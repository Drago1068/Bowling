import test from "node:test";
import assert from "node:assert/strict";
import {
  correctRoll,
  createCorrectionStore,
  createEntityStore,
  createOutboxStore,
  latestGameId,
  loadGameFacts,
  loadScoringView,
  nextLegalSlot,
  openDatabase,
  pinfallLegal,
  recordRoll,
  startGame,
} from "../src/index.ts";
import { TEST_DEVICE_ID } from "./helpers.ts";

const DEVICE = TEST_DEVICE_ID;

test("NEW_GAME: persisted identity is NOT_STARTED with zero rolls", () => {
  const db = openDatabase();
  const gameId = startGame(db, DEVICE);
  const view = loadScoringView(db, gameId);
  assert.equal(view.gameId, gameId);
  assert.equal(view.sheet?.status, "NOT_STARTED");
  assert.equal(view.sheet?.finalTotal, null);
  assert.equal(view.rolls.length, 0);
  assert.deepEqual(view.next, { frame_number: 1, roll_number: 1 });
  assert.equal(view.canRecord, true);
});

test("ROLL_ENTRY: open, spare, strike, and unresolved bonus project from the engine", () => {
  const db = openDatabase();
  const gameId = startGame(db, DEVICE);
  assert.equal(recordRoll(db, DEVICE, gameId, 5).ok, true);
  assert.equal(recordRoll(db, DEVICE, gameId, 3).ok, true);
  let view = loadScoringView(db, gameId);
  assert.equal(view.sheet?.status, "IN_PROGRESS");
  assert.equal(view.sheet?.frames[0]!.isOpen, true);
  assert.equal(view.sheet?.frames[0]!.score, 8);
  assert.equal(view.sheet?.finalTotal, null);

  assert.equal(recordRoll(db, DEVICE, gameId, 7).ok, true);
  assert.equal(recordRoll(db, DEVICE, gameId, 3).ok, true);
  view = loadScoringView(db, gameId);
  assert.equal(view.sheet?.frames[1]!.isSpare, true);
  assert.equal(view.sheet?.frames[1]!.awaitingBonus, true);
  assert.equal(view.sheet?.finalScoreUnavailable, true);

  assert.equal(recordRoll(db, DEVICE, gameId, 10).ok, true);
  view = loadScoringView(db, gameId);
  assert.equal(view.sheet?.frames[1]!.score, 20);
  assert.equal(view.sheet?.frames[2]!.isStrike, true);
  assert.equal(view.sheet?.frames[2]!.awaitingBonus, true);
});

test("COMPLETION: ten open 5,3 frames derive 80", () => {
  const db = openDatabase();
  const gameId = startGame(db, DEVICE);
  for (let i = 0; i < 10; i++) {
    assert.equal(recordRoll(db, DEVICE, gameId, 5).ok, true);
    assert.equal(recordRoll(db, DEVICE, gameId, 3).ok, true);
  }
  const view = loadScoringView(db, gameId);
  assert.equal(view.sheet?.status, "COMPLETED");
  assert.equal(view.sheet?.finalTotal, 80);
  assert.equal(view.canRecord, false);
  assert.equal(view.next, null);
});

test("CORRECTION before and after completion re-derives; audit is preserved", () => {
  const db = openDatabase();
  const gameId = startGame(db, DEVICE);
  assert.equal(recordRoll(db, DEVICE, gameId, 5).ok, true);
  assert.equal(recordRoll(db, DEVICE, gameId, 3).ok, true);
  const first = loadScoringView(db, gameId).rolls[0]!;
  assert.equal(correctRoll(db, DEVICE, first.entity_id, 6).ok, true);
  let view = loadScoringView(db, gameId);
  assert.equal(view.sheet?.frames[0]!.score, 9);
  assert.equal(view.correctionCount, 1);

  for (let i = 0; i < 9; i++) {
    assert.equal(recordRoll(db, DEVICE, gameId, 5).ok, true);
    assert.equal(recordRoll(db, DEVICE, gameId, 3).ok, true);
  }
  view = loadScoringView(db, gameId);
  assert.equal(view.sheet?.status, "COMPLETED");
  const completedTotal = view.sheet!.finalTotal;
  const target = view.rolls[0]!;
  assert.equal(correctRoll(db, DEVICE, target.entity_id, 5).ok, true);
  view = loadScoringView(db, gameId);
  assert.notEqual(view.sheet?.finalTotal, completedTotal);
  assert.equal(view.sheet?.status, "COMPLETED");
  assert.equal(view.sheet?.finalTotal, 80);
  assert.equal(createCorrectionStore(db).listForTarget("Roll", target.entity_id).length, 2);
});

test("P1 OPEN_TO_STRIKE is exposable via correction and explicit repair", () => {
  const db = openDatabase();
  const gameId = startGame(db, DEVICE);
  assert.equal(recordRoll(db, DEVICE, gameId, 6).ok, true);
  assert.equal(recordRoll(db, DEVICE, gameId, 4).ok, true);
  const first = loadScoringView(db, gameId).rolls[0]!;
  const second = loadScoringView(db, gameId).rolls[1]!;
  assert.equal(correctRoll(db, DEVICE, first.entity_id, 10).ok, true);
  let view = loadScoringView(db, gameId);
  assert.equal(view.sheet?.status, "DOMAIN_INVALID_REQUIRING_REPAIR");
  assert.equal(view.sheet?.finalTotal, null);
  assert.deepEqual(view.sheet?.frames[0]!.deliveries, [10, 4]);
  assert.equal(view.rolls.find((r) => r.entity_id === second.entity_id)?.frame_number, 1);
  assert.equal(view.rolls.find((r) => r.entity_id === second.entity_id)?.roll_number, 2);
  assert.equal(view.canRecord, false);

  assert.equal(correctRoll(db, DEVICE, first.entity_id, 6).ok, true);
  view = loadScoringView(db, gameId);
  assert.equal(view.sheet?.status, "IN_PROGRESS");
  assert.equal(view.sheet?.frames[0]!.isSpare, true);
});

test("RESTART_RECOVERY: latest game reloads observations and re-derives", () => {
  const db = openDatabase();
  const gameId = startGame(db, DEVICE);
  assert.equal(recordRoll(db, DEVICE, gameId, 10).ok, true);
  assert.equal(recordRoll(db, DEVICE, gameId, 3).ok, true);
  assert.equal(latestGameId(db), gameId);
  const before = loadScoringView(db, null);
  const facts = loadGameFacts(createEntityStore(db), gameId);
  assert.equal(facts.length, 2);
  const after = loadScoringView(db, latestGameId(db));
  assert.equal(after.sheet?.status, before.sheet?.status);
  assert.equal(after.sheet?.frames[0]!.score, before.sheet?.frames[0]!.score);
  assert.equal(after.rolls.length, 2);
});

test("nextLegalSlot does not offer a second ball after a frames 1-9 strike", () => {
  const db = openDatabase();
  const gameId = startGame(db, DEVICE);
  recordRoll(db, DEVICE, gameId, 10);
  const slot = nextLegalSlot(loadGameFacts(createEntityStore(db), gameId));
  assert.deepEqual(slot, { frame_number: 2, roll_number: 1 });
});

test("recordRoll rejects when the game is complete", () => {
  const db = openDatabase();
  const gameId = startGame(db, DEVICE);
  for (let i = 0; i < 10; i++) {
    recordRoll(db, DEVICE, gameId, 0);
    recordRoll(db, DEVICE, gameId, 0);
  }
  const denied = recordRoll(db, DEVICE, gameId, 1);
  assert.equal(denied.ok, false);
});

function snapshotFacts(db: ReturnType<typeof openDatabase>) {
  return JSON.stringify(
    db
      .prepare(
        "SELECT entity_type, id, entity_version, payload FROM canonical_entities ORDER BY entity_type, id",
      )
      .all(),
  );
}

function nineStrikes(db: ReturnType<typeof openDatabase>, gameId: string) {
  for (let i = 0; i < 9; i++) {
    assert.equal(recordRoll(db, DEVICE, gameId, 10).ok, true);
  }
}

test("ENTRY: twelve sequential strikes complete at 300", () => {
  const db = openDatabase();
  const gameId = startGame(db, DEVICE);
  for (let i = 0; i < 12; i++) {
    assert.equal(recordRoll(db, DEVICE, gameId, 10).ok, true, `strike ${i + 1}`);
  }
  const view = loadScoringView(db, gameId);
  assert.equal(view.sheet?.status, "COMPLETED");
  assert.equal(view.sheet?.finalTotal, 300);
  assert.equal(view.canRecord, false);
  assert.equal(view.next, null);
  const extra = recordRoll(db, DEVICE, gameId, 10);
  assert.equal(extra.ok, false);
});

test("ENTRY: tenth 10,9,1 succeeds; 10,9 then 2 is rejected without mutation", () => {
  const db = openDatabase();
  const gameId = startGame(db, DEVICE);
  nineStrikes(db, gameId);
  assert.equal(recordRoll(db, DEVICE, gameId, 10).ok, true);
  assert.equal(recordRoll(db, DEVICE, gameId, 9).ok, true);
  const before = snapshotFacts(db);
  const beforeOutbox = createOutboxStore(db).pending().length;
  assert.equal(recordRoll(db, DEVICE, gameId, 2).ok, false);
  assert.equal(snapshotFacts(db), before);
  assert.equal(createOutboxStore(db).pending().length, beforeOutbox);
  assert.equal(recordRoll(db, DEVICE, gameId, 1).ok, true);
  const view = loadScoringView(db, gameId);
  assert.equal(view.sheet?.status, "COMPLETED");
  assert.deepEqual(
    view.rolls.filter((r) => r.frame_number === 10).map((r) => r.pinfall),
    [10, 9, 1],
  );
});

test("ENTRY: after tenth 10,10 every 0-10 fill is legal", () => {
  const db = openDatabase();
  const gameId = startGame(db, DEVICE);
  nineStrikes(db, gameId);
  assert.equal(recordRoll(db, DEVICE, gameId, 10).ok, true);
  assert.equal(recordRoll(db, DEVICE, gameId, 10).ok, true);
  const facts = loadGameFacts(createEntityStore(db), gameId);
  const slot = nextLegalSlot(facts);
  assert.deepEqual(slot, { frame_number: 10, roll_number: 3 });
  for (let n = 0; n <= 10; n++) {
    assert.equal(pinfallLegal(facts, slot!, n), true, `fill ${n}`);
  }
});

test("ENTRY: tenth 8,5 remains rejected without mutation", () => {
  const db = openDatabase();
  const gameId = startGame(db, DEVICE);
  for (let i = 0; i < 9; i++) {
    assert.equal(recordRoll(db, DEVICE, gameId, 0).ok, true);
    assert.equal(recordRoll(db, DEVICE, gameId, 0).ok, true);
  }
  assert.equal(recordRoll(db, DEVICE, gameId, 8).ok, true);
  const before = snapshotFacts(db);
  const beforeOutbox = createOutboxStore(db).pending().length;
  assert.equal(recordRoll(db, DEVICE, gameId, 5).ok, false);
  assert.equal(snapshotFacts(db), before);
  assert.equal(createOutboxStore(db).pending().length, beforeOutbox);
});

test("ENTRY: tenth spare permits a fill ball; open tenth rejects an extra ball", () => {
  const db = openDatabase();
  const spareId = startGame(db, DEVICE);
  for (let i = 0; i < 9; i++) {
    assert.equal(recordRoll(db, DEVICE, spareId, 0).ok, true);
    assert.equal(recordRoll(db, DEVICE, spareId, 0).ok, true);
  }
  assert.equal(recordRoll(db, DEVICE, spareId, 9).ok, true);
  assert.equal(recordRoll(db, DEVICE, spareId, 1).ok, true);
  assert.equal(recordRoll(db, DEVICE, spareId, 7).ok, true);
  const spareView = loadScoringView(db, spareId);
  assert.equal(spareView.sheet?.status, "COMPLETED");
  assert.equal(spareView.canRecord, false);

  const openId = startGame(db, DEVICE);
  for (let i = 0; i < 9; i++) {
    assert.equal(recordRoll(db, DEVICE, openId, 0).ok, true);
    assert.equal(recordRoll(db, DEVICE, openId, 0).ok, true);
  }
  assert.equal(recordRoll(db, DEVICE, openId, 8).ok, true);
  assert.equal(recordRoll(db, DEVICE, openId, 1).ok, true);
  const before = snapshotFacts(db);
  const beforeOutbox = createOutboxStore(db).pending().length;
  assert.equal(recordRoll(db, DEVICE, openId, 1).ok, false);
  assert.equal(snapshotFacts(db), before);
  assert.equal(createOutboxStore(db).pending().length, beforeOutbox);
  const openView = loadScoringView(db, openId);
  assert.equal(openView.sheet?.status, "COMPLETED");
  assert.equal(openView.rolls.filter((r) => r.frame_number === 10).length, 2);
});
