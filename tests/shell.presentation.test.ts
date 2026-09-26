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
  averageTrendGranularity,
  ballCellMark,
  computeAverageTrend,
  computeGameSetSummary,
  computeHandicap,
  computeHomeMetrics,
  customTrendGranularity,
  dateHeaderAverage,
  defaultFixRollId,
  frameSlotCount,
  gameDateInMetricRange,
  groupHistoryByDate,
  humanizeNextBallRejection,
  isValidDateKey,
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
import {
  loadHandicapSettings,
  saveHandicapSettings,
} from "../src/localAppSettings.ts";

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

test("AVERAGE_TREND: range chips map to bucket size and average per period", () => {
  assert.equal(averageTrendGranularity("week"), "day");
  assert.equal(averageTrendGranularity("month"), "week");
  assert.equal(averageTrendGranularity("year"), "month");
  assert.equal(averageTrendGranularity("all"), "year");

  const games = [
    { dateKey: "2026-09-21", finalTotal: 180 },
    { dateKey: "2026-09-21", finalTotal: 220 },
    { dateKey: "2026-09-23", finalTotal: 200 },
    { dateKey: "2026-09-28", finalTotal: null },
  ];
  const daily = computeAverageTrend(games, "day");
  assert.equal(daily.length, 2);
  assert.deepEqual(daily[0], { label: "Sep 21", average: 200, count: 2 });
  assert.equal(daily[1]?.label, "Sep 23");
  assert.equal(daily[1]?.average, 200);

  const weekly = computeAverageTrend(games, "week");
  assert.equal(weekly.length, 1);
  assert.equal(weekly[0]?.count, 3);

  const monthly = computeAverageTrend(
    [
      { dateKey: "2026-08-05", finalTotal: 150 },
      { dateKey: "2026-09-05", finalTotal: 250 },
    ],
    "month",
  );
  assert.deepEqual(monthly, [
    { label: "Aug", average: 150, count: 1 },
    { label: "Sep", average: 250, count: 1 },
  ]);

  const yearly = computeAverageTrend(
    [
      { dateKey: "2025-05-05", finalTotal: 100 },
      { dateKey: "2026-06-06", finalTotal: 200 },
    ],
    "year",
  );
  assert.deepEqual(yearly.map((p) => p.label), ["2025", "2026"]);
  assert.equal(computeAverageTrend([], "day").length, 0);

  // Year range = calendar-year months to date (filter to the year, bucket by month).
  const yearToDate = computeAverageTrend(
    [
      { dateKey: "2026-09-26", finalTotal: 180 },
      { dateKey: "2026-01-15", finalTotal: 150 },
      { dateKey: "2026-03-10", finalTotal: 210 },
      { dateKey: "2025-12-30", finalTotal: 160 },
      { dateKey: "2026-12-30", finalTotal: 155 },
    ].filter((g) => gameDateInMetricRange(g.dateKey, "year", "2026-09-26")),
    averageTrendGranularity("year"),
  );
  assert.deepEqual(yearToDate.map((p) => p.label), ["Jan", "Mar", "Sep"]);

  // All time = one bucket per calendar year.
  const allByYear = computeAverageTrend(
    [
      { dateKey: "2025-11-02", finalTotal: 170 },
      { dateKey: "2026-09-21", finalTotal: 190 },
      { dateKey: "2026-09-23", finalTotal: 210 },
    ],
    averageTrendGranularity("all"),
  );
  assert.deepEqual(allByYear, [
    { label: "2025", average: 170, count: 1 },
    { label: "2026", average: 200, count: 2 },
  ]);
});

test("CUSTOM_PERIOD: date validation, span-based buckets, handicap formula", () => {
  assert.equal(isValidDateKey("2026-09-26"), true);
  assert.equal(isValidDateKey("2024-02-29"), true);
  assert.equal(isValidDateKey("2026-02-31"), false);
  assert.equal(isValidDateKey("2026-13-01"), false);
  assert.equal(isValidDateKey("2026-9-26"), false);
  assert.equal(isValidDateKey("20260926"), false);
  assert.equal(isValidDateKey(""), false);

  assert.equal(customTrendGranularity("2026-09-20", "2026-09-26"), "day");
  assert.equal(customTrendGranularity("2026-08-01", "2026-09-26"), "week");
  assert.equal(customTrendGranularity("2026-01-01", "2026-09-26"), "month");
  assert.equal(customTrendGranularity("2025-01-01", "2026-09-26"), "year");

  // League handicap: (Basis − Average) × Percentage — negative results kept as-is.
  assert.equal(computeHandicap(195.5, { basisScore: 220, percentage: 90 }), 22.1);
  assert.equal(computeHandicap(195.5, { basisScore: 220, percentage: 100 }), 24.5);
  assert.equal(computeHandicap(230, { basisScore: 220, percentage: 90 }), -9);
  assert.equal(computeHandicap(242.1, { basisScore: 210, percentage: 95 }), -30.5);
  assert.equal(computeHandicap(195.5, null), null);
  assert.equal(
    computeHandicap(Number.NaN, { basisScore: 220, percentage: 90 }),
    null,
  );
});

test("HANDICAP_SETTINGS: round-trips league inputs through local app_settings", () => {
  const db = openDatabase();
  assert.equal(loadHandicapSettings(db), null);
  saveHandicapSettings(db, { basisScore: 210, percentage: 95 });
  assert.deepEqual(loadHandicapSettings(db), { basisScore: 210, percentage: 95 });
  saveHandicapSettings(db, { basisScore: 225.5, percentage: 90 });
  assert.deepEqual(loadHandicapSettings(db), {
    basisScore: 225.5,
    percentage: 90,
  });
});

test("GAME_SET_SUMMARY: Done for the Day counts only today's completed games", () => {
  const games = [
    { dateKey: "2026-09-26", status: "complete", finalTotal: 133, gameNumber: 1 },
    { dateKey: "2026-09-26", status: "complete", finalTotal: 209, gameNumber: 2 },
    { dateKey: "2026-09-26", status: "active", finalTotal: null, gameNumber: 3 },
    { dateKey: "2026-09-26", status: "repair", finalTotal: 180, gameNumber: 4 },
    { dateKey: "2026-09-25", status: "complete", finalTotal: 201, gameNumber: 1 },
  ];
  const summary = computeGameSetSummary(games, "2026-09-26");
  assert.equal(summary.dateKey, "2026-09-26");
  assert.equal(summary.games, 2);
  assert.equal(summary.totalPins, 342);
  assert.equal(summary.average, 171);
  assert.deepEqual(summary.entries, [
    { gameNumber: 1, total: 133 },
    { gameNumber: 2, total: 209 },
  ]);
  assert.deepEqual(summary.high, { gameNumber: 2, total: 209 });
  assert.deepEqual(summary.low, { gameNumber: 1, total: 133 });
  assert.ok(summary.label.startsWith("Sep 26"));

  const empty = computeGameSetSummary(
    [{ dateKey: "2026-09-26", status: "complete", finalTotal: 100, gameNumber: 1 }],
    "2026-09-27",
  );
  assert.equal(empty.games, 0);
  assert.equal(empty.totalPins, 0);
  assert.equal(empty.average, null);
  assert.equal(empty.high, null);
  assert.equal(empty.low, null);
  assert.deepEqual(empty.entries, []);

  const tie = computeGameSetSummary(
    [
      { dateKey: "2026-09-26", status: "complete", finalTotal: 200, gameNumber: 2 },
      { dateKey: "2026-09-26", status: "complete", finalTotal: 200, gameNumber: 1 },
    ],
    "2026-09-26",
  );
  assert.deepEqual(tie.entries.map((e) => e.gameNumber), [1, 2]);
  assert.deepEqual(tie.high, { gameNumber: 1, total: 200 });
  assert.deepEqual(tie.low, { gameNumber: 1, total: 200 });
});
