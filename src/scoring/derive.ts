import {
  FRAME_COUNT,
  orderRollFacts,
  type FrameProjection,
  type GameScores,
  type GameStatus,
  type RollFact,
} from "./types.ts";

/**
 * Derive the complete game state from ordered observed roll facts.
 *
 * Deterministic two-pass algorithm over the (frame_number, roll_number, UUIDv7)
 * ordered delivery stream:
 *
 *   PASS 1 (frame parse): consume deliveries into frames 1..10 per the standard
 *   ten-pin frame rules (strike = one roll in frames 1-9; tenth frame up to three).
 *
 *   PASS 2 (score): assign each frame a score only when all its bonus deliveries
 *   exist; otherwise leave it unresolved (awaiting bonus). A spare in frame N
 *   needs the next delivery; a strike needs the next two deliveries.
 *
 * Legality (ADR-003 Decision 4-4): illegality is never silently repaired. A fact
 * set that is internally illegal yields `DOMAIN_INVALID_REQUIRING_REPAIR` and all
 * observations are preserved.
 */
export function deriveGame(facts: readonly RollFact[]): GameScores {
  const ordered = orderRollFacts(facts);
  const deliveryStream = ordered.map((f) => f.pinfall);

  if (detectStructuralIllegality(ordered)) {
    return invalidGame(ordered.length);
  }
  if (ordered.length === 0) {
    return emptyGame();
  }

  // PASS 1: parse frames.
  const parsed = parseFrames(deliveryStream);
  if (parsed.status === "DOMAIN_INVALID_REQUIRING_REPAIR") {
    const invalid = invalidGame(ordered.length);
    return invalid;
  }

  // PASS 2: score each frame against the full stream.
  const frames = scoreFrames(parsed.deliveryFrames, deliveryStream);

  const status: GameStatus =
    parsed.status === "COMPLETED" ? "COMPLETED" : "IN_PROGRESS";

  const runningTotals = computeRunningTotals(frames);
  const finalTotal =
    status === "COMPLETED" && frames.every((f) => f.isResolved) && frames.length === FRAME_COUNT
      ? runningTotals[FRAME_COUNT - 1] ?? null
      : null;

  return {
    frames,
    runningTotals,
    finalTotal,
    status,
    finalScoreUnavailable: finalTotal === null,
    rollCount: ordered.length,
  };
}

/**
 * Parse the delivery stream into per-frame delivery slices, honoring the
 * standard ten-pin frame structure and the tenth-frame bonus rules.
 *
 * Returns the frames (each with the absolute start delivery index) and a
 * completion/invalid status.
 */
function parseFrames(
  stream: readonly number[],
): {
  deliveryFrames: Array<{ frameNumber: number; start: number; deliveries: number[] }>;
  status: "IN_PROGRESS" | "COMPLETED" | "DOMAIN_INVALID_REQUIRING_REPAIR";
} {
  const frames: Array<{ frameNumber: number; start: number; deliveries: number[] }> = [];
  let idx = 0;
  let status: "IN_PROGRESS" | "COMPLETED" | "DOMAIN_INVALID_REQUIRING_REPAIR" = "IN_PROGRESS";

  for (let frame = 1; frame <= FRAME_COUNT; frame++) {
    if (idx >= stream.length) break; // no further deliveries

    const start = idx;
    const first = stream[idx]!;
    let consumed: number;
    let deliveries: number[];

    if (frame < FRAME_COUNT) {
      if (first === 10) {
        consumed = 1;
        deliveries = [10];
      } else {
        // Need a second roll to complete a legal non-strike frame, or an
        // explicitly recorded zero-count means "waiting" (partial).
        if (idx + 1 >= stream.length) {
          // Partial: only the first roll recorded.
          consumed = 1;
          deliveries = [first];
        } else {
          const second = stream[idx + 1]!;
          if (first + second > 10) {
            status = "DOMAIN_INVALID_REQUIRING_REPAIR";
            deliveries = [first, second];
            consumed = 2;
          } else {
            consumed = 2;
            deliveries = [first, second];
          }
        }
      }
    } else {
      // Frame 10.
      const second = idx + 1 < stream.length ? stream[idx + 1] : undefined;
      const third = idx + 2 < stream.length ? stream[idx + 2] : undefined;

      if (second === undefined) {
        consumed = 1;
        deliveries = [first];
      } else if (first === 10) {
        // Strike in tenth: up to two bonus rolls.
        if (third === undefined) {
          consumed = 2;
          deliveries = [first, second];
        } else {
          consumed = 3;
          deliveries = [first, second, third];
        }
      } else if (first + second <= 10) {
        if (first + second === 10) {
          // Spare: exactly one bonus roll.
          if (third === undefined) {
            consumed = 2;
            deliveries = [first, second];
          } else {
            consumed = 3;
            deliveries = [first, second, third];
          }
        } else {
          // Open tenth: exactly two rolls.
          if (third !== undefined) {
            status = "DOMAIN_INVALID_REQUIRING_REPAIR";
            deliveries = [first, second, third];
            consumed = 3;
          } else {
            consumed = 2;
            deliveries = [first, second];
          }
        }
      } else {
        status = "DOMAIN_INVALID_REQUIRING_REPAIR";
        deliveries = [first, second];
        consumed = 2;
      }
    }

    frames.push({ frameNumber: frame, start, deliveries });
    idx += consumed;
  }

  // Completion requires all ten frames parsed and every downstream pause resolved.
  if (frames.length === FRAME_COUNT) {
    const last = frames[9]!;
    const gameComplete = frame10Complete(last.deliveries) && idx === stream.length;
    status = gameComplete ? "COMPLETED" : status;
    if (idx < stream.length) status = "DOMAIN_INVALID_REQUIRING_REPAIR";
  }

  return { deliveryFrames: frames, status };
}

/** A tenth frame is complete when it has the exact legal roll count for its type. */
function frame10Complete(deliveries: readonly number[]): boolean {
  if (deliveries.length === 1) return false;
  const [a, b] = [deliveries[0] ?? -1, deliveries[1] ?? -1];
  if (a === 10) {
    return deliveries.length === 3;
  }
  if (a + b === 10) {
    return deliveries.length === 3;
  }
  // open
  return deliveries.length === 2;
}

function scoreFrames(
  parsed: Array<{ frameNumber: number; start: number; deliveries: number[] }>,
  stream: readonly number[],
): FrameProjection[] {
  return parsed.map(({ frameNumber, start, deliveries }) => {
    const isStrike = deliveries[0] === 10;
    const isSpare = !isStrike && deliveries.length >= 2 && deliveries[0]! + deliveries[1]! === 10;
    const isOpen = !isStrike && !isSpare && deliveries.length >= 2;

    let score: number | null = null;
    let awaitingBonus = false;
    let isResolved = false;

    if (frameNumber < FRAME_COUNT) {
      if (isStrike) {
        // Need next two deliveries.
        const b1 = stream[start + 1];
        const b2 = stream[start + 2];
        if (b1 !== undefined && b2 !== undefined) {
          score = 10 + b1 + b2;
          isResolved = true;
        } else {
          awaitingBonus = true;
        }
      } else if (isSpare) {
        const b1 = stream[start + 2];
        if (b1 !== undefined) {
          score = 10 + b1;
          isResolved = true;
        } else {
          awaitingBonus = true;
        }
      } else if (isOpen) {
        score = deliveries[0]! + deliveries[1]!;
        isResolved = true;
      } else {
        // Partial (single first roll recorded).
        awaitingBonus = false;
        isResolved = false;
      }
    } else {
      // Frame 10 scored from its own deliveries.
      const a = deliveries[0];
      const b = deliveries[1];
      if (a === 10 && deliveries.length >= 2) {
        if (deliveries.length >= 2) score = 10 + deliveries[1]!;
        if (deliveries.length === 3) score = 10 + deliveries[1]! + deliveries[2]!;
        isResolved = deliveries.length === 3;
        if (!isResolved) awaitingBonus = true;
      } else if (a !== undefined && b !== undefined && a + b === 10) {
        if (deliveries.length === 3) {
          score = 10 + deliveries[2]!;
          isResolved = true;
        } else {
          awaitingBonus = true;
        }
      } else if (a !== undefined && b !== undefined && a + b < 10) {
        score = a + b;
        isResolved = true;
      } else if (a !== undefined) {
        isResolved = false;
        awaitingBonus = true;
      }
    }

    let status: FrameProjection["status"] = null;
    if (isStrike) status = "STRIKE";
    else if (isSpare) status = "SPARE";
    else if (isOpen) status = "OPEN";

    return {
      frame_number: frameNumber,
      deliveries,
      status,
      isStrike,
      isSpare,
      isOpen,
      isResolved,
      score,
      awaitingBonus,
    };
  });
}

function computeRunningTotals(frames: readonly FrameProjection[]): Array<number | null> {
  const totals: Array<number | null> = [];
  let running = 0;
  for (const f of frames) {
    if (f.score !== null) {
      running += f.score;
      totals.push(running);
    } else {
      totals.push(null);
    }
  }
  return totals;
}

function detectStructuralIllegality(ordered: readonly RollFact[]): boolean {
  for (const f of ordered) {
    if (f.frame_number < 1 || f.frame_number > FRAME_COUNT) return true;
    if (!Number.isInteger(f.pinfall) || f.pinfall < 0 || f.pinfall > 10) return true;
  }
  const byFrame = new Map<number, number[]>();
  for (const f of ordered) {
    const list = byFrame.get(f.frame_number) ?? [];
    list.push(f.roll_number);
    byFrame.set(f.frame_number, list);
  }
  for (const [, list] of byFrame) {
    list.sort((a, b) => a - b);
    for (let i = 0; i < list.length; i++) {
      if (list[i] !== i + 1) return true;
    }
    if (list.length > 3) return true;
  }
  return false;
}

function emptyFrameProjection(frameNumber: number): FrameProjection {
  return {
    frame_number: frameNumber,
    deliveries: [],
    status: null,
    isStrike: false,
    isSpare: false,
    isOpen: false,
    isResolved: false,
    score: null,
    awaitingBonus: false,
  };
}

function emptyGame(): GameScores {
  const frames = [];
  for (let f = 1; f <= FRAME_COUNT; f++) frames.push(emptyFrameProjection(f));
  return {
    frames,
    runningTotals: [],
    finalTotal: null,
    status: "NOT_STARTED",
    finalScoreUnavailable: true,
    rollCount: 0,
  };
}

function invalidGame(rollCount: number): GameScores {
  const frames = [];
  for (let f = 1; f <= FRAME_COUNT; f++) frames.push(emptyFrameProjection(f));
  return {
    frames,
    runningTotals: [],
    finalTotal: null,
    status: "DOMAIN_INVALID_REQUIRING_REPAIR",
    finalScoreUnavailable: true,
    rollCount,
  };
}
