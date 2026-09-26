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
  /** Derived roll count when the source row carries it; absent means unknown (never discardable). */
  rollCount?: number;
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

/** Window → bucket size for the Analysis average trend chart (All time = calendar years). */
export type AverageTrendGranularity = "day" | "week" | "month" | "year";

export function averageTrendGranularity(
  rangeId: MetricRangeId,
): AverageTrendGranularity {
  if (rangeId === "week") return "day";
  if (rangeId === "month") return "week";
  if (rangeId === "year") return "month";
  return "year";
}

/** Strict YYYY-MM-DD check (rejects rolled-over dates like 2026-02-31). */
export function isValidDateKey(key: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return false;
  const d = parseLocalDateKey(key);
  return (
    d.getFullYear() === Number(key.slice(0, 4)) &&
    d.getMonth() === Number(key.slice(5, 7)) - 1 &&
    d.getDate() === Number(key.slice(8, 10))
  );
}

/** Bucket size for a custom period: ≤14 days → day, ≤120 → week, ≤400 → month, else year. */
export function customTrendGranularity(
  fromKey: string,
  toKey: string,
): AverageTrendGranularity {
  const days = Math.round(
    (parseLocalDateKey(toKey).getTime() - parseLocalDateKey(fromKey).getTime()) /
      86_400_000,
  );
  if (days <= 14) return "day";
  if (days <= 120) return "week";
  if (days <= 400) return "month";
  return "year";
}

export type HandicapSettings = { basisScore: number; percentage: number };

/**
 * League handicap: (Basis Score − average) × Percentage, exactly as entered —
 * negative results are kept as-is. Null settings or a non-finite average → null.
 */
export function computeHandicap(
  average: number,
  settings: HandicapSettings | null,
): number | null {
  if (!settings || !Number.isFinite(average)) return null;
  if (!Number.isFinite(settings.basisScore) || !Number.isFinite(settings.percentage)) {
    return null;
  }
  const raw = (settings.basisScore - average) * (settings.percentage / 100);
  return Math.round(raw * 10) / 10;
}

export type AverageTrendPoint = {
  label: string;
  average: number;
  count: number;
};

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * Average score per bucket (day/week/month/year) over already range-filtered
 * completed games — presentation only, oldest → newest.
 */
export function computeAverageTrend(
  games: readonly { dateKey: string; finalTotal: number | null }[],
  granularity: AverageTrendGranularity,
): AverageTrendPoint[] {
  const valid = games.filter(
    (g): g is { dateKey: string; finalTotal: number } =>
      typeof g.finalTotal === "number",
  );
  if (valid.length === 0) return [];
  const bucketKey = (dateKey: string): string => {
    if (granularity === "day") return dateKey;
    if (granularity === "week") return calendarWeekKey(dateKey);
    if (granularity === "month") return dateKey.slice(0, 7);
    return dateKey.slice(0, 4);
  };
  const buckets = new Map<string, { sum: number; count: number }>();
  for (const g of valid) {
    const key = bucketKey(g.dateKey);
    const existing = buckets.get(key);
    if (existing) {
      existing.sum += g.finalTotal;
      existing.count += 1;
    } else {
      buckets.set(key, { sum: g.finalTotal, count: 1 });
    }
  }
  const multiYear =
    new Set(valid.map((g) => g.dateKey.slice(0, 4))).size > 1;
  const labelFor = (key: string): string => {
    if (granularity === "year") return key;
    const [y, m, d] = key.split("-").map(Number);
    const monthName = MONTHS_SHORT[(m ?? 1) - 1] ?? "";
    if (granularity === "month") {
      return multiYear ? `${monthName} ${String(y).slice(2)}` : monthName;
    }
    return `${monthName} ${d ?? ""}`.trim();
  };
  return [...buckets.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([key, bucket]) => ({
      label: labelFor(key),
      average: Math.round((bucket.sum / bucket.count) * 10) / 10,
      count: bucket.count,
    }));
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

/** Completed-game candidate row for the Done-for-the-Day set summary. */
export type GameSetCandidate = {
  dateKey: string;
  status: string;
  finalTotal: number | null;
  gameNumber: number;
};

export type GameSetSummary = {
  /** Local YYYY-MM-DD the set was bowled (defaults to today). */
  dateKey: string;
  /** Human label for the set day, e.g. "Sep 26" (year when not current). */
  label: string;
  games: number;
  totalPins: number;
  average: number | null;
  high: { gameNumber: number; total: number } | null;
  low: { gameNumber: number; total: number } | null;
  /** Completed games of the set, oldest → newest. */
  entries: Array<{ gameNumber: number; total: number }>;
};

/**
 * The game set behind Done for the Day: completed games from one local day
 * (default today). Facts only — counts, sums, and extremes; no claims.
 */
export function computeGameSetSummary(
  games: readonly GameSetCandidate[],
  setKey = formatLocalTodayKey(),
): GameSetSummary {
  const entries = games
    .filter(
      (g): g is GameSetCandidate & { finalTotal: number } =>
        g.dateKey === setKey &&
        isQualifyingCompletedGame(g) &&
        typeof g.finalTotal === "number",
    )
    .sort((a, b) => a.gameNumber - b.gameNumber)
    .map((g) => ({ gameNumber: g.gameNumber, total: g.finalTotal }));
  const totalPins = entries.reduce((sum, e) => sum + e.total, 0);
  let high: GameSetSummary["high"] = null;
  let low: GameSetSummary["low"] = null;
  for (const entry of entries) {
    if (!high || entry.total > high.total) {
      high = { gameNumber: entry.gameNumber, total: entry.total };
    }
    if (!low || entry.total < low.total) {
      low = { gameNumber: entry.gameNumber, total: entry.total };
    }
  }
  const [yearRaw, monthRaw, dayRaw] = setKey.split("-").map(Number);
  const date =
    yearRaw !== undefined &&
    monthRaw !== undefined &&
    dayRaw !== undefined &&
    Number.isInteger(yearRaw) &&
    Number.isInteger(monthRaw) &&
    Number.isInteger(dayRaw)
      ? new Date(yearRaw, monthRaw - 1, dayRaw)
      : null;
  const label = date
    ? `${MONTHS_SHORT[date.getMonth()] ?? ""} ${date.getDate()}${
        date.getFullYear() === new Date().getFullYear()
          ? ""
          : `, ${date.getFullYear()}`
      }`.trim()
    : setKey;
  return {
    dateKey: setKey,
    label,
    games: entries.length,
    totalPins,
    average: meanScore(entries.map((e) => e.total)),
    high,
    low,
    entries,
  };
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

/* O2/UX remediation: frozen top navigation, new-game confirm, discard gating. */

export type TopNavActionId = "home" | "history" | "done" | "start";

export type AppScreen = "landing" | "history" | "analysis" | "advanced" | "game";

/**
 * Ordered navigation actions for the frozen top bar. The landing screen owns
 * its bottom nav (bar hidden); History/Analysis offer Home back; the game
 * view keeps Home + Previous games with Start only on completed games behind
 * confirm. Bottom-of-screen duplicates were removed.
 */
export function topNavActions(state: {
  screen: AppScreen;
  historyOpen: boolean;
  completed: boolean;
}): TopNavActionId[] {
  if (state.screen === "landing") return [];
  if (
    state.screen === "history" ||
    state.screen === "analysis" ||
    state.screen === "advanced"
  )
    return ["home"];
  const actions: TopNavActionId[] = ["home", "history"];
  if (state.completed) actions.push("done", "start");
  return actions;
}

export function historyToggleLabel(historyOpen: boolean): string {
  return historyOpen ? "Hide previous games" : "Previous games";
}

/** Discard is offered only for Active games holding zero recorded rolls. Unknown counts are never discardable. */
export function discardableGame(game: { status: string; rollCount?: number }): boolean {
  return game.status === "active" && game.rollCount === 0;
}

export function newGameConfirmNotice(activeCount: number): string {
  return activeCount > 0
    ? `You have ${activeCount} active game(s). Start a new game anyway?`
    : "Start a new game?";
}

/**
 * Honest Analysis-screen summary: only already-derived basics. Strike %,
 * Spare %, leaves, and history trends are B2/B3 work and are not claimed.
 */
export function analysisAvailableSummary(
  qualifyingGames: number,
  overallAverage: number | null,
): string {
  if (overallAverage == null) {
    return `Qualifying games: ${qualifyingGames}. Averages appear after your first completed game.`;
  }
  return `Qualifying games: ${qualifyingGames} · Overall average: ${overallAverage}.`;
}

export const ANALYSIS_PENDING_COPY =
  "Per-game Strike %, Spare %, leaves, and trends arrive with analysis (B2/B3) and are not computed yet.";

export const ANALYSIS_B3_PENDING_COPY =
  "Historical totals and trends arrive with B3 and are not computed yet.";

/* Lane commentary: flavor quips derived from already-recorded facts. Never
   authoritative, never stored, never shown for Fix corrections. */

const FAMOUS_SPLITS = new Set([
  "7,10",
  "4,6",
  "4,7,10",
  "6,7,10",
  "3,10",
  "2,7",
]);

export function strikeQuip(streak: number): string | null {
  if (streak >= 4) return `${streak} in a row — unstoppable!`;
  if (streak === 3) return "Nice Turkey!";
  if (streak === 2) return "Double! Back-to-back strikes!";
  if (streak === 1) return "Nice strike!";
  return null;
}

/** Leave quips need recorded standing detail; unknown detail yields nothing. */
export function leaveQuip(standingPins: readonly number[] | null): string | null {
  if (!standingPins) return null;
  if (standingPins.length === 1) return "You forgot one.";
  const key = [...standingPins].sort((a, b) => a - b).join(",");
  if (FAMOUS_SPLITS.has(key)) return "Nice split. Good luck.";
  return null;
}

export function strikeStreakCount(
  framesInOrder: readonly { frameNumber: number; isStrike: boolean }[],
  throughFrame: number,
): number {
  const eligible = framesInOrder.filter(
    (f) => f.frameNumber < 10 && f.frameNumber <= throughFrame,
  );
  let streak = 0;
  for (let i = eligible.length - 1; i >= 0; i--) {
    if (!eligible[i]!.isStrike) break;
    streak++;
  }
  return streak;
}

export function ballSaveQuip(input: {
  frameNumber: number;
  rollNumber: number;
  pinfall: number;
  firstBallPinfall: number | null;
  strikeStreak: number;
  standingPins: readonly number[];
}): string | null {
  const tenth = input.frameNumber >= 10;
  if (input.pinfall === 10) {
    if (!tenth && input.rollNumber === 1) return strikeQuip(input.strikeStreak);
    if (tenth) return "Nice strike!";
    return null;
  }
  if (
    input.rollNumber === 2 &&
    input.firstBallPinfall != null &&
    input.firstBallPinfall < 10 &&
    input.firstBallPinfall + input.pinfall === 10
  ) {
    return "Spare! Nice pickup.";
  }
  const leave = leaveQuip(input.standingPins);
  if (leave) return leave;
  if (input.pinfall === 0) return "Gutter ball — shake it off.";
  return null;
}

export function gameCompleteQuip(finalTotal: number | null): string | null {
  if (finalTotal == null) return null;
  if (finalTotal >= 300) return "Perfect game! Legendary.";
  if (finalTotal >= 200) return "Huge game!";
  if (finalTotal >= 100) return "Solid game!";
  return "Game in the books.";
}

/**
 * Completed-game Save is reassurance, not a write: every ball already
 * persists offline at save time. The button refreshes the view, reports the
 * final, and leaves the bowler inside the finished game.
 */
export function completedSaveNotice(finalTotal: number | null): string {
  return finalTotal == null
    ? "All balls already saved. Still in this game."
    : `All balls already saved — final ${finalTotal}. Still in this game.`;
}

/** Persistent in-game Save banner; stays until navigation. In-memory only. */
export function completedSaveBanner(
  finalTotal: number | null,
  savedAt: string,
): string {
  return finalTotal == null
    ? `Saved ✓ · ${savedAt}`
    : `Saved ✓ · Final ${finalTotal} · ${savedAt}`;
}

/* Analysis focus areas: four aggregate rates derived from already-recorded
   rolls of completed games. Presentation-only; no scoring facts are stored. */

export type Handedness = "right" | "left";

export type FocusRate = {
  hits: number;
  chances: number;
  /** Percentage with one decimal, or null when there is no denominator. */
  rate: number | null;
};

export type FocusAnalysis = {
  games: number;
  /** Frame-opening deliveries: average pinfall plus strike share. */
  firstBall: FocusRate & { averagePinfall: number | null };
  /** First balls whose recorded detail shows both pocket pins down. */
  pocket: FocusRate;
  /** Strike frames that could be followed by another strike, and were. */
  doubles: FocusRate;
  /** Spare conversions overall, split by single-pin vs multi-pin leaves. */
  spares: FocusRate & {
    singlePin: FocusRate;
    multiPin: FocusRate;
    /** Opportunities whose first-ball leave detail was not recorded. */
    missingDetail: number;
  };
  /** Frames finished without an open frame (strike or spare). */
  fill: FocusRate;
};

type FocusRoll = {
  frame_number: number;
  roll_number: number;
  pinfall: number;
  standing_pins: number[] | null;
};

export type FocusViewLike = {
  sheet: { status: string } | null;
  rolls: readonly FocusRoll[];
};

function focusRate(hits: number, chances: number): FocusRate {
  return {
    hits,
    chances,
    rate: chances === 0 ? null : Math.round((hits / chances) * 1000) / 10,
  };
}

/**
 * Aggregates the four Analysis focus areas across completed games.
 * Pocket share treats a first ball as a pocket hit when the headpin and the
 * pocket-side pin are both down in the recorded standing detail
 * (1-3 for right-handed, 1-2 for left-handed).
 */
export function computeFocusAnalysis(
  views: readonly FocusViewLike[],
  handedness: Handedness,
): FocusAnalysis {
  const pocketPin = handedness === "right" ? 3 : 2;
  let games = 0;
  let fbShots = 0;
  let fbPins = 0;
  let fbStrikes = 0;
  let pocketShots = 0;
  let pocketHits = 0;
  let doubleOpps = 0;
  let doubles = 0;
  let spareOpps = 0;
  let spareConvs = 0;
  let singleOpps = 0;
  let singleConvs = 0;
  let multiOpps = 0;
  let multiConvs = 0;
  let missingDetail = 0;
  let frames = 0;
  let filled = 0;

  for (const view of views) {
    if (view.sheet?.status !== "COMPLETED") continue;
    games++;
    const byFrame = new Map<number, FocusRoll[]>();
    for (const roll of view.rolls) {
      const list = byFrame.get(roll.frame_number);
      if (list) list.push(roll);
      else byFrame.set(roll.frame_number, [roll]);
    }
    const strikeFrame = new Set<number>();
    for (const [frameNumber, frameRolls] of byFrame) {
      const first = frameRolls.find((r) => r.roll_number === 1);
      const second = frameRolls.find((r) => r.roll_number === 2);
      if (!first) continue;
      frames++;

      const opening = first.pinfall >= 0 && first.pinfall <= 10;
      if (opening) {
        fbShots++;
        fbPins += first.pinfall;
        if (first.pinfall === 10) fbStrikes++;
        const standing = first.standing_pins;
        if (standing != null) {
          pocketShots++;
          if (!standing.includes(1) && !standing.includes(pocketPin)) {
            pocketHits++;
          }
        }
      }

      const frameStrike = first.pinfall === 10;
      if (frameStrike) strikeFrame.add(frameNumber);
      const frameSpare =
        !frameStrike && second != null && first.pinfall + second.pinfall === 10;
      if (frameStrike || frameSpare) filled++;

      if (frameNumber <= 9) {
        if (!frameStrike && second) {
          spareOpps++;
          const converted = first.pinfall + second.pinfall === 10;
          if (converted) spareConvs++;
          const standing = first.standing_pins;
          if (!standing || standing.length === 0) {
            missingDetail++;
          } else if (standing.length === 1) {
            singleOpps++;
            if (converted) singleConvs++;
          } else {
            multiOpps++;
            if (converted) multiConvs++;
          }
        }
      }
    }
    for (let f = 1; f <= 9; f++) {
      if (!strikeFrame.has(f)) continue;
      doubleOpps++;
      if (strikeFrame.has(f + 1)) doubles++;
    }
  }

  return {
    games,
    firstBall: {
      ...focusRate(fbStrikes, fbShots),
      averagePinfall:
        fbShots === 0 ? null : Math.round((fbPins / fbShots) * 10) / 10,
    },
    pocket: focusRate(pocketHits, pocketShots),
    doubles: focusRate(doubles, doubleOpps),
    spares: {
      ...focusRate(spareConvs, spareOpps),
      singlePin: focusRate(singleConvs, singleOpps),
      multiPin: focusRate(multiConvs, multiOpps),
      missingDetail,
    },
    fill: focusRate(filled, frames),
  };
}
