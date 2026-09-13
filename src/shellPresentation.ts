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
 * Presentation marks from existing frame projection flags and stored pinfall.
 * Does not compute strike/spare/totals.
 */
export function ballCellMark(args: {
  isStrike: boolean;
  isSpare: boolean;
  deliveryIndex: number;
  pinfall: number | undefined;
}): "unplayed" | "X" | "/" | `${number}` {
  if (args.pinfall === undefined) return "unplayed";
  if (args.deliveryIndex === 0 && args.isStrike) return "X";
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
