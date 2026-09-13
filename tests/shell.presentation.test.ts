import test from "node:test";
import assert from "node:assert/strict";
import {
  createOutboxStore,
  createEntityStore,
  listGameHistory,
  loadScoringView,
  openDatabase,
  startGame,
} from "../src/index.ts";
import {
  INITIAL_SHELL_DISCLOSURES,
  ballCellMark,
  frameSlotCount,
  humanizeNextBallRejection,
  ordinalBall,
  scoringPad,
  selectionAfterDisclosure,
  selectionAfterScoringMode,
  scoringActionsAllowed,
  STORAGE_UNAVAILABLE_NOTICE,
  historyStartNewGamePlacement,
  scoringChromeShowsStartNewGame,
  toggleDisclosure,
} from "../src/shellPresentation.ts";
import { TEST_DEVICE_ID } from "./helpers.ts";

test("SHELL_DEFAULT: history and diagnostics start collapsed", () => {
  assert.equal(INITIAL_SHELL_DISCLOSURES.historyOpen, false);
  assert.equal(INITIAL_SHELL_DISCLOSURES.diagnosticsOpen, false);
});

test("DISCLOSURE: toggling history or diagnostics does not rewrite selection", () => {
  const selected = "01a00000-0000-7000-8000-000000000001";
  const afterHistory = toggleDisclosure(INITIAL_SHELL_DISCLOSURES, "historyOpen");
  assert.equal(afterHistory.historyOpen, true);
  assert.equal(afterHistory.diagnosticsOpen, false);
  assert.equal(selectionAfterDisclosure(selected, afterHistory), selected);

  const afterDiagnostics = toggleDisclosure(afterHistory, "diagnosticsOpen");
  assert.equal(afterDiagnostics.diagnosticsOpen, true);
  assert.equal(afterDiagnostics.historyOpen, true);
  assert.equal(selectionAfterDisclosure(selected, afterDiagnostics), selected);
  assert.equal(selectionAfterDisclosure(null, afterDiagnostics), null);
});

test("DISCLOSURE: listing after a toggle does not mutate facts or selection", () => {
  const db = openDatabase();
  const older = startGame(db, TEST_DEVICE_ID);
  const newer = startGame(db, TEST_DEVICE_ID);
  const beforeCanonical = JSON.stringify(
    db
      .prepare(
        "SELECT entity_type, id, entity_version, payload FROM canonical_entities ORDER BY entity_type, id",
      )
      .all(),
  );
  const beforeOutbox = createOutboxStore(db).pending().length;
  const selected = older;
  const disclosed = toggleDisclosure(INITIAL_SHELL_DISCLOSURES, "historyOpen");
  assert.equal(selectionAfterDisclosure(selected, disclosed), older);
  const history = listGameHistory(db);
  const view = loadScoringView(db, selected);
  assert.equal(view.gameId, older);
  assert.equal(view.gameMissing, false);
  assert.ok(history.some((row) => row.id === older));
  assert.ok(history.some((row) => row.id === newer));
  assert.equal(
    JSON.stringify(
      db
        .prepare(
          "SELECT entity_type, id, entity_version, payload FROM canonical_entities ORDER BY entity_type, id",
        )
        .all(),
    ),
    beforeCanonical,
  );
  assert.equal(createOutboxStore(db).pending().length, beforeOutbox);
  assert.equal(createEntityStore(db).list("Game").length, 2);
});

test("PAD: only one scoring pad is visible at a time", () => {
  assert.equal(
    scoringPad({ historyOpen: false, fixMode: false, canRecord: true, gameMissing: false }),
    "nextBall",
  );
  assert.equal(
    scoringPad({ historyOpen: false, fixMode: true, canRecord: true, gameMissing: false }),
    "fixBall",
  );
  assert.equal(
    scoringPad({ historyOpen: true, fixMode: true, canRecord: true, gameMissing: false }),
    "none",
  );
  assert.equal(
    scoringPad({ historyOpen: false, fixMode: false, canRecord: false, gameMissing: false }),
    "none",
  );
});

test("FIX_MODE: cancel and mode changes do not rewrite selection", () => {
  const selected = "01a00000-0000-7000-8000-000000000002";
  assert.equal(selectionAfterScoringMode(selected), selected);
  assert.equal(selectionAfterScoringMode(null), null);
  const afterAdvanced = toggleDisclosure(INITIAL_SHELL_DISCLOSURES, "diagnosticsOpen");
  assert.equal(selectionAfterDisclosure(selected, afterAdvanced), selected);
});

test("SCORECARD: unplayed, zero, strike, spare, and tenth-frame slots", () => {
  assert.equal(ballCellMark({ isStrike: false, isSpare: false, deliveryIndex: 0, pinfall: undefined }), "unplayed");
  assert.equal(ballCellMark({ isStrike: false, isSpare: false, deliveryIndex: 1, pinfall: 0 }), "0");
  assert.equal(ballCellMark({ isStrike: true, isSpare: false, deliveryIndex: 0, pinfall: 10 }), "X");
  assert.equal(ballCellMark({ isStrike: false, isSpare: true, deliveryIndex: 1, pinfall: 3 }), "/");
  assert.equal(frameSlotCount(1), 2);
  assert.equal(frameSlotCount(10), 3);
  assert.equal(ordinalBall(1), "1st");
  assert.equal(ordinalBall(2), "2nd");
  assert.equal(ordinalBall(3), "3rd");
  assert.equal(humanizeNextBallRejection("illegal roll"), "That number isn’t allowed for this ball.");
});

test("STORAGE: leftover views are not treated as live database reads", () => {
  assert.equal(scoringActionsAllowed({ storageAvailable: false }), false);
  assert.equal(scoringActionsAllowed({ storageAvailable: true }), true);
  assert.match(STORAGE_UNAVAILABLE_NOTICE, /leftover view/);
});

test("HISTORY: Start a new game sits above the list, not in scoring chrome", () => {
  assert.equal(historyStartNewGamePlacement(true), "above_list");
  assert.equal(historyStartNewGamePlacement(false), "not_in_history");
  assert.equal(scoringChromeShowsStartNewGame(true), false);
  assert.equal(scoringChromeShowsStartNewGame(false), true);
});
