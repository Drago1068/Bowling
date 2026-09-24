/** Presentation-only shell state. Not persisted. */

export type ShellDisclosures = {
  historyOpen: boolean;
  diagnosticsOpen: boolean;
};

export const INITIAL_SHELL_DISCLOSURES: ShellDisclosures = {
  historyOpen: false,
  diagnosticsOpen: false,
};

export function toggleDisclosure(
  state: ShellDisclosures,
  key: keyof ShellDisclosures,
): ShellDisclosures {
  return { ...state, [key]: !state[key] };
}

/** Disclosure toggles must not rewrite the in-session game selection. */
export function selectionAfterDisclosure(
  selectedGameId: string | null,
  _next: ShellDisclosures,
): string | null {
  return selectedGameId;
}

/** Opening Fix a ball, Advanced, or Previous games must not change the game. */
export function selectionAfterScoringMode(
  selectedGameId: string | null,
): string | null {
  return selectedGameId;
}

export type ScoringPad = "none" | "nextBall" | "fixBall";

export function scoringPad(args: {
  historyOpen: boolean;
  fixMode: boolean;
  canRecord: boolean;
  gameMissing: boolean;
}): ScoringPad {
  if (args.historyOpen) return "none";
  if (args.fixMode) return "fixBall";
  if (args.canRecord && !args.gameMissing) return "nextBall";
  return "none";
}

export function ordinalBall(rollNumber: number): string {
  if (rollNumber === 1) return "1st";
  if (rollNumber === 2) return "2nd";
  if (rollNumber === 3) return "3rd";
  return `${rollNumber}th`;
}

/**
 * Presentation marks from stored pinfall / spare flags.
 * Tenth fill strikes (pinfall 10) display as X on any delivery slot.
 */
export function ballCellMark(args: {
  isStrike: boolean;
  isSpare: boolean;
  deliveryIndex: number;
  pinfall: number | undefined;
}): "unplayed" | "X" | "/" | `${number}` {
  if (args.pinfall === undefined) return "unplayed";
  if (args.pinfall === 10) return "X";
  if (args.deliveryIndex === 1 && args.isSpare) return "/";
  return String(args.pinfall) as `${number}`;
}

export function frameSlotCount(frameNumber: number): 2 | 3 {
  return frameNumber === 10 ? 3 : 2;
}

export function humanizeNextBallRejection(_message: string): string {
  return "That number isn’t allowed for this ball.";
}

/** Leftover scorecard/history is not a live read and must not look actionable. */
export const STORAGE_UNAVAILABLE_NOTICE =
  "Scoring is temporarily unavailable. Anything still shown is a leftover view, not a live database read. Game actions are disabled.";

export function scoringActionsAllowed(args: {
  storageAvailable: boolean;
}): boolean {
  return args.storageAvailable;
}

/**
 * Previous games: Start a new game is above the list so it remains visible
 * without scrolling. The scoring surface keeps its own new-game control;
 * history must not also keep a second copy at the bottom.
 */
export function historyStartNewGamePlacement(historyOpen: boolean): "above_list" | "not_in_history" {
  return historyOpen ? "above_list" : "not_in_history";
}

export function scoringChromeShowsStartNewGame(historyOpen: boolean): boolean {
  return !historyOpen;
}

/**
 * Fix-mode chrome: while a durable roll is selected for edit, hide the full
 * chooser so Save/Cancel sit with the editor (no scroll through every roll).
 * While choosing, Cancel sits above the (height-capped) roll list.
 */
export type FixModeLayout = {
  showRollChooser: boolean;
  showEditor: boolean;
  exitControls: "with_editor" | "above_chooser";
};

export function fixModeLayout(selectedRollId: string | null): FixModeLayout {
  if (selectedRollId != null) {
    return {
      showRollChooser: false,
      showEditor: true,
      exitControls: "with_editor",
    };
  }
  return {
    showRollChooser: true,
    showEditor: false,
    exitControls: "above_chooser",
  };
}

/** Save standing / pinfall correction always targets the selected durable roll. */
export function fixSaveTargetRollId(selectedRollId: string | null): string | null {
  return selectedRollId;
}

/**
 * Cancel leaves Fix without implying a canonical write: draft cleared, no roll
 * remains selected, Fix chrome closes. Callers must not enqueue outbox work.
 */
export function fixCancelPresentationReset(): {
  fixMode: false;
  selectedRollId: null;
  draftCleared: true;
} {
  return { fixMode: false, selectedRollId: null, draftCleared: true };
}

/** Long roll lists must not push exit controls out of the Fix editor region. */
export function fixExitControlsReachableWithLongRollList(
  selectedRollId: string | null,
  rollCount: number,
): boolean {
  const layout = fixModeLayout(selectedRollId);
  if (layout.exitControls === "with_editor") return true;
  // Chooser: Cancel is above the list; list length does not bury exit.
  return layout.exitControls === "above_chooser" && rollCount >= 0;
}

/**
 * X is legal only on a fresh 10-pin rack that begins a strike-eligible delivery
 * (frames 1–9 ball 1; tenth ball 1; tenth fill after X or /).
 */
export function strikeControlEnabled(args: {
  rackLength: number;
  frameNumber: number;
  rollNumber: number;
  tenthBall1Pinfall?: number | null;
  tenthBall2Pinfall?: number | null;
}): boolean {
  if (args.rackLength !== 10) return false;
  if (args.rollNumber === 1) return true;
  if (args.frameNumber !== 10) return false;
  if (args.rollNumber === 2) return args.tenthBall1Pinfall === 10;
  if (args.rollNumber === 3) {
    const b1 = args.tenthBall1Pinfall;
    const b2 = args.tenthBall2Pinfall;
    if (b2 == null || b1 == null) return false;
    return b2 === 10 || b1 + b2 === 10;
  }
  return false;
}

/** / is legal when clearing a non-fresh remaining rack (incl. after gutter). */
export function spareControlEnabled(args: {
  rackLength: number;
  frameNumber: number;
  rollNumber: number;
  tenthBall1Pinfall?: number | null;
  tenthBall2Pinfall?: number | null;
}): boolean {
  if (args.rackLength <= 0) return false;
  if (
    strikeControlEnabled({
      rackLength: args.rackLength,
      frameNumber: args.frameNumber,
      rollNumber: args.rollNumber,
      tenthBall1Pinfall: args.tenthBall1Pinfall,
      tenthBall2Pinfall: args.tenthBall2Pinfall,
    })
  ) {
    return false;
  }
  if (args.frameNumber < 10) return args.rollNumber === 2;
  if (args.rollNumber === 2) {
    return args.tenthBall1Pinfall != null && args.tenthBall1Pinfall < 10;
  }
  if (args.rollNumber === 3) {
    const b1 = args.tenthBall1Pinfall;
    const b2 = args.tenthBall2Pinfall;
    return b1 === 10 && b2 != null && b2 < 10;
  }
  return false;
}

/** Frame-tap Fix opens the first recorded throw; later throws are selectable. */
export function defaultFixRollId(
  rollsInFrame: readonly { entity_id: string; roll_number: number }[],
): string | null {
  if (!rollsInFrame.length) return null;
  const ordered = [...rollsInFrame].sort((a, b) => a.roll_number - b.roll_number);
  return ordered[0]!.entity_id;
}

export type MetricRangeId = "week" | "month" | "year" | "all";

export const METRIC_RANGE_OPTIONS: ReadonlyArray<{ id: MetricRangeId; label: string }> = [
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
  { id: "year", label: "Year" },
  { id: "all", label: "All time" },
];

export const PBA_HANDICAP_UNDEFINED = "Formula not defined";
export const METRICS_INSUFFICIENT = "Not enough games yet.";
export const ROLLING_WINDOW = 5;

export type HomeHistoryGame = {
  id: string;
  dateKey: string;
  gameNumber: number;
  status: "complete" | "active" | "repair";
  finalTotal: number | null;
  created_at: string;
};

function parseLocalDateKey(dateKey: string): Date {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Date(y!, m! - 1, d!);
}

export function formatLocalTodayKey(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function gameDateInMetricRange(
  dateKey: string,
  rangeId: MetricRangeId,
  todayKey = formatLocalTodayKey(),
): boolean {
  const g = parseLocalDateKey(dateKey);
  const today = parseLocalDateKey(todayKey);
  if (g > today) return false;
  if (rangeId === "all") return true;
  if (rangeId === "week") {
    const start = new Date(today);
    start.setDate(start.getDate() - 6);
    return g >= start && g <= today;
  }
  if (rangeId === "month") {
    return g.getFullYear() === today.getFullYear() && g.getMonth() === today.getMonth();
  }
  if (rangeId === "year") {
    return g.getFullYear() === today.getFullYear();
  }
  return true;
}

function meanScore(scores: readonly number[]): number | null {
  if (!scores.length) return null;
  const sum = scores.reduce((a, b) => a + b, 0);
  return Math.round((sum / scores.length) * 10) / 10;
}

export type HomeMetrics = {
  rangeId: MetricRangeId;
  qualifyingGames: number;
  overallAverage: number | null;
  rollingAverage: number | null;
  averageByDateRows: Array<{
    date: string;
    average: number | null;
    weekAverage: number | null;
  }>;
  pbaDisplay: string;
  enough: boolean;
};

/** Sunday–Saturday calendar week key for the given local date. */
export function calendarWeekKey(dateKey: string): string {
  const d = parseLocalDateKey(dateKey);
  const start = new Date(d);
  start.setDate(d.getDate() - d.getDay());
  const y = start.getFullYear();
  const m = String(start.getMonth() + 1).padStart(2, "0");
  const day = String(start.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function isQualifyingCompletedGame(g: {
  status: string;
  finalTotal: number | null;
}): boolean {
  return g.status === "complete" && typeof g.finalTotal === "number";
}

/** Completed valid games only — excludes active, incomplete, invalid, repair. */
export function computeHomeMetrics(
  games: readonly HomeHistoryGame[],
  rangeId: MetricRangeId,
  todayKey = formatLocalTodayKey(),
): HomeMetrics {
  const completed = games
    .filter(isQualifyingCompletedGame)
    .filter((g) => gameDateInMetricRange(g.dateKey, rangeId, todayKey))
    .slice()
    .sort((a, b) => {
      if (a.created_at !== b.created_at) return a.created_at < b.created_at ? -1 : 1;
      return a.id < b.id ? -1 : 1;
    });
  const scores = completed.map((g) => g.finalTotal!);
  const byDate = new Map<string, number[]>();
  const byWeek = new Map<string, number[]>();
  for (const g of completed) {
    const list = byDate.get(g.dateKey) ?? [];
    list.push(g.finalTotal!);
    byDate.set(g.dateKey, list);
    const wk = calendarWeekKey(g.dateKey);
    const wlist = byWeek.get(wk) ?? [];
    wlist.push(g.finalTotal!);
    byWeek.set(wk, wlist);
  }
  const averageByDateRows = [...byDate.keys()]
    .sort((a, b) => (a < b ? 1 : -1))
    .map((date) => ({
      date,
      average: meanScore(byDate.get(date) ?? []),
      weekAverage: meanScore(byWeek.get(calendarWeekKey(date)) ?? []),
    }));
  const recent = completed.slice(-ROLLING_WINDOW);
  const enough = completed.length >= 1;
  return {
    rangeId,
    qualifyingGames: completed.length,
    overallAverage: enough ? meanScore(scores) : null,
    rollingAverage: recent.length ? meanScore(recent.map((g) => g.finalTotal!)) : null,
    averageByDateRows,
    pbaDisplay: PBA_HANDICAP_UNDEFINED,
    enough,
  };
}

export function dateHeaderAverage(
  gamesOnDate: readonly HomeHistoryGame[],
): number | null {
  const scores = gamesOnDate.filter(isQualifyingCompletedGame).map((g) => g.finalTotal!);
  return meanScore(scores);
}

export function groupHistoryByDate(
  games: readonly HomeHistoryGame[],
  rangeId: MetricRangeId,
  todayKey = formatLocalTodayKey(),
): Array<{ date: string; average: number | null; games: HomeHistoryGame[] }> {
  const filtered = games.filter((g) => gameDateInMetricRange(g.dateKey, rangeId, todayKey));
  const byDate = new Map<string, HomeHistoryGame[]>();
  for (const g of filtered) {
    const list = byDate.get(g.dateKey) ?? [];
    list.push(g);
    byDate.set(g.dateKey, list);
  }
  return [...byDate.keys()]
    .sort((a, b) => (a < b ? 1 : -1))
    .map((date) => {
      const list = (byDate.get(date) ?? []).slice().sort((a, b) => a.gameNumber - b.gameNumber);
      return { date, average: dateHeaderAverage(list), games: list };
    });
}
