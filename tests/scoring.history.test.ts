import test from "node:test";
import assert from "node:assert/strict";
import {
  compareGamesNewestFirst,
  createEntityStore,
  correctRoll,
  createOutboxStore,
  latestGameId,
  listGameHistory,
  listGamesNewestFirst,
  loadGameFacts,
  loadScoringView,
  newGameId,
  openDatabase,
  recordRoll,
  startGame,
  withHistoryLabels,
  type Game,
  type SqliteDriver,
} from "../src/index.ts";
import { TEST_DEVICE_ID } from "./helpers.ts";

const DEVICE = TEST_DEVICE_ID;

function fingerprint(db: SqliteDriver): string {
  const canonical = db
    .prepare(
      "SELECT entity_type, id, entity_version, payload FROM canonical_entities ORDER BY entity_type, id",
    )
    .all();
  const outbox = db
    .prepare("SELECT submission_id, entity_id, entity_type, state FROM sync_outbox ORDER BY seq")
    .all();
  return JSON.stringify({ canonical, outbox });
}

function setGameCreatedAt(db: SqliteDriver, gameId: string, createdAt: string): void {
  const store = createEntityStore(db);
  const game = store.get("Game", gameId) as Game | null;
  assert.ok(game);
  store.upsert({ ...game, created_at: createdAt });
  db.prepare(
    "UPDATE canonical_entities SET created_at = ? WHERE entity_type = 'Game' AND id = ?",
  ).run(createdAt, gameId);
}

test("EMPTY_HISTORY: listing creates no Game, Frame, Roll, or outbox rows", () => {
  const db = openDatabase();
  const before = fingerprint(db);
  const history = listGameHistory(db);
  const view = loadScoringView(db, null);
  assert.deepEqual(history, []);
  assert.equal(view.gameId, null);
  assert.equal(view.gameMissing, false);
  assert.equal(view.canRecord, false);
  assert.equal(createEntityStore(db).list("Game").length, 0);
  assert.equal(createEntityStore(db).list("Frame").length, 0);
  assert.equal(createEntityStore(db).list("Roll").length, 0);
  assert.equal(createOutboxStore(db).pending().length, 0);
  assert.equal(fingerprint(db), before);
});

test("ORDERING: newest-first by created_at then id lexicographic descending", () => {
  const db = openDatabase();
  const older = startGame(db, DEVICE);
  const newer = startGame(db, DEVICE);
  setGameCreatedAt(db, older, "2026-01-01T00:00:00.000Z");
  setGameCreatedAt(db, newer, "2026-01-02T00:00:00.000Z");
  assert.deepEqual(
    listGamesNewestFirst(db).map((g) => g.id),
    [newer, older],
  );

  const a = startGame(db, DEVICE);
  const b = startGame(db, DEVICE);
  const stamp = "2026-02-01T12:00:00.000Z";
  setGameCreatedAt(db, a, stamp);
  setGameCreatedAt(db, b, stamp);
  const tied = listGamesNewestFirst(db).filter((g) => g.created_at === stamp);
  const expected = [a, b].sort((x, y) => (x < y ? 1 : x > y ? -1 : 0));
  assert.deepEqual(
    tied.map((g) => g.id),
    expected,
  );
  assert.equal(compareGamesNewestFirst(tied[0]!, tied[1]!), -1);
});

test("LABELS: identical displayed timestamps get a short ID suffix", () => {
  const db = openDatabase();
  const a = startGame(db, DEVICE);
  const b = startGame(db, DEVICE);
  const stamp = "2026-03-01T15:04:05.000Z";
  setGameCreatedAt(db, a, stamp);
  setGameCreatedAt(db, b, stamp);
  const labeled = withHistoryLabels(listGamesNewestFirst(db).filter((g) => g.id === a || g.id === b));
  assert.equal(labeled.length, 2);
  assert.notEqual(labeled[0]!.label, labeled[1]!.label);
  assert.ok(labeled[0]!.label.includes("·"));
  assert.ok(labeled[1]!.label.includes("·"));
});

test("OPEN_BY_ID: explicit missing game is not replaced by the newest game", () => {
  const db = openDatabase();
  const existing = startGame(db, DEVICE);
  const missingId = newGameId();
  const view = loadScoringView(db, missingId);
  assert.equal(view.gameMissing, true);
  assert.equal(view.gameId, missingId);
  assert.notEqual(view.gameId, existing);
  assert.equal(view.canRecord, false);
  assert.equal(view.sheet, null);
  assert.match(view.formatted, /not found/i);
  assert.equal(latestGameId(db), existing);
});

test("SESSION_SELECTION: refresh and mutation keep the opened older game", () => {
  const db = openDatabase();
  const older = startGame(db, DEVICE);
  const newer = startGame(db, DEVICE);
  assert.equal(latestGameId(db), newer);
  let view = loadScoringView(db, older);
  assert.equal(view.gameId, older);
  assert.equal(recordRoll(db, DEVICE, older, 5).ok, true);
  view = loadScoringView(db, older);
  assert.equal(view.gameId, older);
  assert.equal(view.rolls.length, 1);
  assert.equal(loadScoringView(db, older).gameId, older);
  assert.equal(latestGameId(db), newer);
});

test("ISOLATION: recording and correcting one game leaves another unchanged", () => {
  const db = openDatabase();
  const a = startGame(db, DEVICE);
  const b = startGame(db, DEVICE);
  assert.equal(recordRoll(db, DEVICE, a, 7).ok, true);
  const firstA = loadScoringView(db, a).rolls[0]!;
  assert.equal(recordRoll(db, DEVICE, b, 3).ok, true);
  const bFacts = loadGameFacts(createEntityStore(db), b);
  assert.equal(bFacts.length, 1);
  assert.equal(correctRoll(db, DEVICE, firstA.entity_id, 6).ok, true);
  const aAfter = loadScoringView(db, a);
  assert.equal(aAfter.rolls[0]!.pinfall, 6);
  assert.equal(loadGameFacts(createEntityStore(db), b).length, 1);
  assert.equal(loadGameFacts(createEntityStore(db), b)[0]!.pinfall, 3);
});

test("NEW_GAME: prior games remain listed and loadable", () => {
  const db = openDatabase();
  const first = startGame(db, DEVICE);
  assert.equal(recordRoll(db, DEVICE, first, 4).ok, true);
  const second = startGame(db, DEVICE);
  const ids = listGamesNewestFirst(db).map((g) => g.id);
  assert.ok(ids.includes(first));
  assert.ok(ids.includes(second));
  assert.equal(loadScoringView(db, first).rolls.length, 1);
  assert.equal(loadScoringView(db, second).rolls.length, 0);
});

test("RESTART_DEFAULT: null selection opens the newest persisted game", () => {
  const db = openDatabase();
  const older = startGame(db, DEVICE);
  const newer = startGame(db, DEVICE);
  assert.equal(recordRoll(db, DEVICE, older, 9).ok, true);
  const restarted = loadScoringView(db, null);
  assert.equal(restarted.gameId, newer);
  assert.equal(restarted.rolls.length, 0);
  assert.equal(restarted.gameMissing, false);
});

test("LIST_AND_OPEN_ARE_READ_ONLY: no canonical or outbox mutation", () => {
  const db = openDatabase();
  const first = startGame(db, DEVICE);
  const second = startGame(db, DEVICE);
  const before = fingerprint(db);
  listGameHistory(db);
  listGamesNewestFirst(db);
  loadScoringView(db, null);
  loadScoringView(db, first);
  loadScoringView(db, second);
  loadScoringView(db, newGameId());
  assert.equal(fingerprint(db), before);
});
