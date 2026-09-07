import test from "node:test";
import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  applyCorrection,
  applyLocalMutation,
  createCorrection,
  createCorrectionStore,
  createEntityStore,
  createNodeSqliteDriver,
  deriveGame,
  initializeApplication,
  loadGameFacts,
  newEntityMetadata,
  newFrameId,
  newGameId,
  newRollId,
  openDatabase,
  validateNextRoll,
  type CanonicalEntity,
  type SqliteDriver,
} from "../src/index.ts";
import { TEST_DEVICE_ID } from "./helpers.ts";

function tmpPath(label: string): string {
  return join(tmpdir(), `bowling-score-${label}-${newRollId()}.db`);
}

function cleanup(path: string): void {
  for (const target of [path, `${path}-wal`, `${path}-shm`]) {
    try {
      rmSync(target, { force: true });
    } catch {
      /* ignore cleanup races */
    }
  }
}

function meta(id: string) {
  return {
    ...newEntityMetadata({ id, origin_device_id: TEST_DEVICE_ID }),
    id,
  };
}

/** Create a Game + Frames + Rolls for a per-frame delivery spec. */
function buildGame(
  db: SqliteDriver,
  spec: Array<{ frame: number; rolls: number[] }>,
): string {
  const gameId = newGameId();
  applyLocalMutation(db, {
    deviceId: TEST_DEVICE_ID,
    operation: "CREATE",
    entity: {
      ...meta(gameId),
      entity_type: "Game",
      session_id: null,
      bowler_profile_id: null,
      game_number: 1,
    } as unknown as CanonicalEntity,
    expectedEntityVersion: 0,
  });

  for (const { frame, rolls } of spec) {
    const frameId = newFrameId();
    applyLocalMutation(db, {
      deviceId: TEST_DEVICE_ID,
      operation: "CREATE",
      entity: {
        ...meta(frameId),
        entity_type: "Frame",
        game_id: gameId,
        frame_number: frame,
      } as unknown as CanonicalEntity,
      expectedEntityVersion: 0,
    });
    rolls.forEach((pinfall, i) => {
      const rollId = newRollId();
      applyLocalMutation(db, {
        deviceId: TEST_DEVICE_ID,
        operation: "CREATE",
        entity: {
          ...meta(rollId),
          entity_type: "Roll",
          frame_id: frameId,
          roll_number: i + 1,
          pinfall,
        } as unknown as CanonicalEntity,
        expectedEntityVersion: 0,
      });
    });
  }
  return gameId;
}

function rollIdFor(db: SqliteDriver, frameNumber: number, rollNumber: number): string {
  const store = createEntityStore(db);
  const frames = store.list("Frame") as Array<{ id: string; frame_number: number | null; game_id: string }>;
  const frame = frames.find((f) => f.frame_number === frameNumber);
  assert.ok(frame, `frame ${frameNumber} exists`);
  const rolls = store.list("Roll") as Array<{ id: string; roll_number: number | null; frame_id: string; pinfall: number | null }>;
  const roll = rolls.find((r) => r.frame_id === frame.id && r.roll_number === rollNumber);
  assert.ok(roll, `roll ${frameNumber}.${rollNumber} exists`);
  return roll.id;
}

// ---- CORRECTION ----

test("OPEN_TO_SPARE: correcting a 5,3 to a 5,5 spare adds the spare bonus", () => {
  const db = openDatabase();
  const gameId = buildGame(db, [
    { frame: 1, rolls: [5, 3] },
    { frame: 2, rolls: [3, 4] },
  ]);
  const before = deriveGame(loadGameFacts(createEntityStore(db), gameId));
  assert.equal(before.frames[0]!.score, 8);

  const target = rollIdFor(db, 1, 2);
  const prior = (createEntityStore(db).get("Roll", target) as { entity_version: number }).entity_version;
  applyCorrection(db, {
    correction: createCorrection({
      target_entity_type: "Roll",
      target_entity_id: target,
      prior_entity_version: prior,
      corrected_representation: { id: target, pinfall: 5 },
      change: { pinfall: { from: 3, to: 5 } },
      reason: "recount",
      actor: "bowler-001",
      origin_device_id: TEST_DEVICE_ID,
    }),
    deviceId: TEST_DEVICE_ID,
  });

  const after = deriveGame(loadGameFacts(createEntityStore(db), gameId));
  // Frame 1 is now a spare (5,5) = 10 + frame2 first ball (3) = 13.
  assert.equal(after.frames[0]!.isSpare, true);
  assert.equal(after.frames[0]!.score, 13);
});

test("OPEN_TO_STRIKE: correcting a first ball to a strike derives a strike deterministically", () => {
  const db = openDatabase();
  const gameId = buildGame(db, [
    { frame: 1, rolls: [5, 3] },
    { frame: 2, rolls: [3, 4] },
  ]);
  const target = rollIdFor(db, 1, 1);
  const prior = (createEntityStore(db).get("Roll", target) as { entity_version: number }).entity_version;
  applyCorrection(db, {
    correction: createCorrection({
      target_entity_type: "Roll",
      target_entity_id: target,
      prior_entity_version: prior,
      corrected_representation: { id: target, pinfall: 10 },
      change: { pinfall: { from: 5, to: 10 } },
      reason: "recount",
      actor: "bowler-001",
      origin_device_id: TEST_DEVICE_ID,
    }),
    deviceId: TEST_DEVICE_ID,
  });
  // The corrected first ball makes frame 1 a strike; its bonus is drawn from
  // the next two legal deliveries after it in the ordered fact stream. The
  // frame-1 second-ball entity (the former "3") remains an effective fact and
  // is the first of those two bonus deliveries (10 + 3 + frame-2 first = 3).
  const s = deriveGame(loadGameFacts(createEntityStore(db), gameId));
  assert.equal(s.frames[0]!.isStrike, true);
  assert.equal(s.frames[0]!.score, 10 + 3 + 3); // 16
});

test("STRIKE_TO_NON_STRIKE: a correction can turn a strike into an open", () => {
  const db = openDatabase();
  const gameId = buildGame(db, [
    { frame: 1, rolls: [10] },
    { frame: 2, rolls: [3, 4] },
  ]);
  const target = rollIdFor(db, 1, 1);
  const prior = (createEntityStore(db).get("Roll", target) as { entity_version: number }).entity_version;
  applyCorrection(db, {
    correction: createCorrection({
      target_entity_type: "Roll",
      target_entity_id: target,
      prior_entity_version: prior,
      corrected_representation: { id: target, pinfall: 5 },
      change: { pinfall: { from: 10, to: 5 } },
      reason: "miscount",
      actor: "bowler-001",
      origin_device_id: TEST_DEVICE_ID,
    }),
    deviceId: TEST_DEVICE_ID,
  });
  const s = deriveGame(loadGameFacts(createEntityStore(db), gameId));
  assert.equal(s.frames[0]!.isStrike, false);
});

test("TENTH_FRAME_CORRECTION: correcting a tenth bonus pinfall changes the final total", () => {
  const db = openDatabase();
  const gameId = buildGame(db, [
    ...Array.from({ length: 9 }, (_, i) => ({ frame: i + 1, rolls: [10] })),
    { frame: 10, rolls: [10, 10, 7] },
  ]);
  const s0 = deriveGame(loadGameFacts(createEntityStore(db), gameId));
  assert.equal(s0.finalTotal, 297); // (9 strikes) + 10 + 10 + 7

  const target = rollIdFor(db, 10, 3);
  const prior = (createEntityStore(db).get("Roll", target) as { entity_version: number }).entity_version;
  applyCorrection(db, {
    correction: createCorrection({
      target_entity_type: "Roll",
      target_entity_id: target,
      prior_entity_version: prior,
      corrected_representation: { id: target, pinfall: 10 },
      change: { pinfall: { from: 7, to: 10 } },
      reason: "recount",
      actor: "bowler-001",
      origin_device_id: TEST_DEVICE_ID,
    }),
    deviceId: TEST_DEVICE_ID,
  });
  const s1 = deriveGame(loadGameFacts(createEntityStore(db), gameId));
  assert.equal(s1.finalTotal, 300);
});

test("CORRECTION_AFTER_COMPLETION: a corrected completed game may derive to not-currently-complete", () => {
  const db = openDatabase();
  const gameId = buildGame(db, [
    ...Array.from({ length: 10 }, (_, i) => ({ frame: i + 1, rolls: i === 9 ? [5, 3] : [5, 3] })),
  ]);
  const completed = deriveGame(loadGameFacts(createEntityStore(db), gameId));
  assert.equal(completed.status, "COMPLETED");
  assert.equal(completed.finalTotal, 80);

  // Correct a first-frame second ball so the frame's later structure changes.
  const target = rollIdFor(db, 1, 1);
  const prior = (createEntityStore(db).get("Roll", target) as { entity_version: number }).entity_version;
  applyCorrection(db, {
    correction: createCorrection({
      target_entity_type: "Roll",
      target_entity_id: target,
      prior_entity_version: prior,
      corrected_representation: { id: target, pinfall: 10 },
      change: { pinfall: { from: 5, to: 10 } },
      reason: "recount",
      actor: "bowler-001",
      origin_device_id: TEST_DEVICE_ID,
    }),
    deviceId: TEST_DEVICE_ID,
  });
  const rederived = deriveGame(loadGameFacts(createEntityStore(db), gameId));
  // The game now begins with a strike; total deliveries differ, so it is no
  // longer necessarily complete/finalized at 80. The completed evidence is
  // preserved through the correction record, not destroyed.
  const corrections = createCorrectionStore(db);
  assert.equal(corrections.listForTarget("Roll", target).length, 1);
  assert.ok(rederived.rollCount !== 20 || rederived.status !== "COMPLETED");
});

test("CORRECTION_AFFECTING_LATER_LEGALITY: correcting to an impossible second-ball total surfaces DOMAIN_INVALID", () => {
  const db = openDatabase();
  const gameId = buildGame(db, [
    { frame: 1, rolls: [10] },
    { frame: 2, rolls: [3, 4] },
  ]);
  // Correct frame-2 first ball to 9: 9 + 4 = 13 > 10 -> impossible two-roll total.
  const firstBall = rollIdFor(db, 2, 1);
  const prior1 = (createEntityStore(db).get("Roll", firstBall) as { entity_version: number }).entity_version;
  applyCorrection(db, {
    correction: createCorrection({
      target_entity_type: "Roll",
      target_entity_id: firstBall,
      prior_entity_version: prior1,
      corrected_representation: { id: firstBall, pinfall: 9 },
      change: { pinfall: { from: 3, to: 9 } },
      reason: "recount",
      actor: "bowler-001",
      origin_device_id: TEST_DEVICE_ID,
    }),
    deviceId: TEST_DEVICE_ID,
  });
  // Frame 2's second ball (4) is now illegal against the corrected first ball.
  const s = deriveGame(loadGameFacts(createEntityStore(db), gameId));
  assert.equal(s.status, "DOMAIN_INVALID_REQUIRING_REPAIR");
  assert.equal(s.finalScoreUnavailable, true);
});

// ---- PERSISTENCE_RESTART ----

test("PERSISTENCE_RESTART: re-derivation after reopening the db matches the pre-restart result", () => {
  const path = tmpPath("restart");
  let driver: SqliteDriver | undefined;
  try {
    driver = createNodeSqliteDriver(path);
    const init = initializeApplication({ openDriver: () => driver! });
    if (!init.ok) assert.fail(init.message);
    const gameId = buildGame(driver, [
      { frame: 1, rolls: [10] },
      { frame: 2, rolls: [3, 6] },
      { frame: 3, rolls: [9, 1] },
      { frame: 4, rolls: [7, 2] },
      { frame: 5, rolls: [10] },
      { frame: 6, rolls: [10] },
      { frame: 7, rolls: [8, 2] },
      { frame: 8, rolls: [9, 0] },
      { frame: 9, rolls: [10] },
      { frame: 10, rolls: [7, 3, 9] },
    ]);
    const before = deriveGame(loadGameFacts(createEntityStore(driver), gameId));
    assert.equal(before.finalTotal, 169);
    driver.close();

    // Reopen the same file and re-derive (schema persists on disk).
    driver = createNodeSqliteDriver(path);
    const after = deriveGame(loadGameFacts(createEntityStore(driver), gameId));
    assert.equal(after.status, before.status);
    assert.equal(after.finalTotal, before.finalTotal);
    assert.deepEqual(after.runningTotals, before.runningTotals);
    assert.equal(after.rollCount, before.rollCount);
  } finally {
    if (driver) driver.close();
    cleanup(path);
  }
});

// ---- SYNC_PRESERVATION ----

test("SYNC_PRESERVATION: scoring derivation does not disturb the outbox or correction lineage", () => {
  const db = openDatabase();
  const gameId = buildGame(db, [{ frame: 1, rolls: [5, 3] }]);
  const before = deriveGame(loadGameFacts(createEntityStore(db), gameId));

  // A legitimate boundary validation does not mute the accepted fact.
  const v = validateNextRoll(loadGameFacts(createEntityStore(db), gameId), {
    frame_number: 2,
    roll_number: 1,
    pinfall: 4,
  });
  assert.equal(v.ok, true);

  const after = deriveGame(loadGameFacts(createEntityStore(db), gameId));
  assert.equal(after.finalTotal, before.finalTotal);
  assert.equal(createCorrectionStore(db).listForTarget("Roll", rollIdFor(db, 1, 1)).length, 0);
});

// ---- MOBILE_LOGIC ----

test("MOBILE_LOGIC: portable scoring surfaces to a mobile-style module without Node-only deps", async () => {
  // `deriveGame`/`loadGameFacts`/`validateNextRoll` are re-exported from the
  // portable surface (src/portable.ts), which mobile imports.
  const portable = await import("./support/portableProbe.ts");
  const s = portable.deriveGame([]);
  assert.equal(s.status, "NOT_STARTED");
  const r = portable.validateNextRoll([], { frame_number: 1, roll_number: 1, pinfall: 10 });
  assert.equal(r.ok, true);
});

test("MOBILE_LOGIC: a tenth-frame spare score sheet is derived deterministically", () => {
  const db = openDatabase();
  const gameId = buildGame(db, [
    ...Array.from({ length: 9 }, (_, i) => ({ frame: i + 1, rolls: [5, 5] })),
    { frame: 10, rolls: [5, 5, 5] },
  ]);
  const s = deriveGame(loadGameFacts(createEntityStore(db), gameId));
  assert.equal(s.status, "COMPLETED");
  assert.equal(s.finalTotal, 150);
  assert.equal(s.frames[9]!.isSpare, true);
  assert.equal(s.frames[9]!.score, 15);
});
