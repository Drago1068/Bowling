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
  computeHomeMetrics,
  dateHeaderAverage,
  defaultFixRollId,
  frameSlotCount,
  groupHistoryByDate,
  humanizeNextBallRejection,
  ordinalBall,
  scoringPad,
  selectionAfterDisclosure,
  selectionAfterScoringMode,
  scoringActionsAllowed,
  STORAGE_UNAVAILABLE_NOTICE,
  PBA_HANDICAP_UNDEFINED,
  historyStartNewGamePlacement,
  scoringChromeShowsStartNewGame,
  fixModeLayout,
  fixSaveTargetRollId,
  fixCancelPresentationReset,
  fixExitControlsReachableWithLongRollList,
  spareControlEnabled,
  strikeControlEnabled,
  toggleDisclosure,
} from "../src/shellPresentation.ts";
import { TEST_DEVICE_ID } from "./helpers.ts";
import { recordRoll } from "../src/scoring/session.ts";

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
  assert.equal(ballCellMark({ isStrike: false, isSpare: false, deliveryIndex: 1, pinfall: 10 }), "X");
  assert.equal(ballCellMark({ isStrike: false, isSpare: false, deliveryIndex: 2, pinfall: 10 }), "X");
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

test("FIX_EXIT: editor hides chooser so Save/Cancel are not behind a long roll list", () => {
  const choosing = fixModeLayout(null);
  assert.equal(choosing.showRollChooser, true);
  assert.equal(choosing.showEditor, false);
  assert.equal(choosing.exitControls, "above_chooser");

  const editing = fixModeLayout("01a00000-0000-7000-8000-0000000000aa");
  assert.equal(editing.showRollChooser, false);
  assert.equal(editing.showEditor, true);
  assert.equal(editing.exitControls, "with_editor");

  assert.equal(
    fixExitControlsReachableWithLongRollList("01a00000-0000-7000-8000-0000000000aa", 21),
    true,
  );
  assert.equal(fixExitControlsReachableWithLongRollList(null, 21), true);
});

test("FIX_EXIT: Save targets the selected durable roll only", () => {
  const rollId = "01a00000-0000-7000-8000-0000000000bb";
  assert.equal(fixSaveTargetRollId(rollId), rollId);
  assert.equal(fixSaveTargetRollId(null), null);
});

test("FIX_EXIT: Cancel presentation clears draft and leaves Fix without implying writes", () => {
  const reset = fixCancelPresentationReset();
  assert.equal(reset.fixMode, false);
  assert.equal(reset.selectedRollId, null);
  assert.equal(reset.draftCleared, true);
});

test("HOME_METRICS: range filters use completed games only; PBA stays undefined", () => {
  const games = [
    {
      id: "a",
      dateKey: "2026-09-23",
      gameNumber: 1,
      status: "complete" as const,
      finalTotal: 100,
      created_at: "2026-09-23T12:00:00.000Z",
    },
    {
      id: "b",
      dateKey: "2026-09-23",
      gameNumber: 2,
      status: "active" as const,
      finalTotal: null,
      created_at: "2026-09-23T13:00:00.000Z",
    },
    {
      id: "c",
      dateKey: "2026-09-22",
      gameNumber: 1,
      status: "complete" as const,
      finalTotal: 200,
      created_at: "2026-09-22T12:00:00.000Z",
    },
    {
      id: "d",
      dateKey: "2026-08-01",
      gameNumber: 1,
      status: "complete" as const,
      finalTotal: 150,
      created_at: "2026-08-01T12:00:00.000Z",
    },
  ];
  const all = computeHomeMetrics(games, "all", "2026-09-23");
  assert.equal(all.qualifyingGames, 3);
  assert.equal(all.overallAverage, 150);
  assert.equal(all.pbaDisplay, PBA_HANDICAP_UNDEFINED);
  assert.equal(dateHeaderAverage(games.filter((g) => g.dateKey === "2026-09-23")), 100);
  const month = computeHomeMetrics(games, "month", "2026-09-23");
  assert.equal(month.qualifyingGames, 2);
  const groups = groupHistoryByDate(games, "month", "2026-09-23");
  assert.equal(groups.length, 2);
  assert.equal(groups[0]?.date, "2026-09-23");
  assert.equal(groups[0]?.average, 100);
  assert.ok(all.averageByDateRows.every((r) => r.weekAverage != null || r.average == null));
});

test("ENTRY_CONTROLS: gutter leaves spare legal and strike illegal on ball 2", () => {
  assert.equal(
    strikeControlEnabled({ rackLength: 10, frameNumber: 1, rollNumber: 1 }),
    true,
  );
  assert.equal(
    strikeControlEnabled({ rackLength: 10, frameNumber: 1, rollNumber: 2 }),
    false,
  );
  assert.equal(
    spareControlEnabled({ rackLength: 10, frameNumber: 1, rollNumber: 2 }),
    true,
  );
  assert.equal(
    spareControlEnabled({ rackLength: 10, frameNumber: 1, rollNumber: 1 }),
    false,
  );
  assert.equal(
    strikeControlEnabled({
      rackLength: 10,
      frameNumber: 10,
      rollNumber: 2,
      tenthBall1Pinfall: 10,
    }),
    true,
  );
});

test("FIX_DEFAULT: frame opens first throw when multiple balls exist", () => {
  assert.equal(
    defaultFixRollId([
      { entity_id: "r2", roll_number: 2 },
      { entity_id: "r1", roll_number: 1 },
    ]),
    "r1",
  );
  assert.equal(defaultFixRollId([]), null);
});

test("FIX_EXIT: opening and cancelling Fix does not mutate canonical or outbox", () => {
  const db = openDatabase();
  const gameId = startGame(db, TEST_DEVICE_ID);
  assert.equal(recordRoll(db, TEST_DEVICE_ID, gameId, 5).ok, true);
  assert.equal(recordRoll(db, TEST_DEVICE_ID, gameId, 3).ok, true);
  const beforeCanonical = JSON.stringify(
    db
      .prepare(
        "SELECT entity_type, id, entity_version, payload FROM canonical_entities ORDER BY entity_type, id",
      )
      .all(),
  );
  const beforeOutbox = createOutboxStore(db).pending().length;
  const selected = gameId;
  assert.equal(selectionAfterScoringMode(selected), gameId);
  const cancel = fixCancelPresentationReset();
  assert.equal(cancel.fixMode, false);
  assert.equal(cancel.selectedRollId, null);
  assert.equal(selectionAfterScoringMode(selected), gameId);
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
});
