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
 * Frame identity and roll position are AUTHORITATIVE (ADR-003 §9). Derivation
 * groups facts by stored `(frame_number, roll_number)` and never reinterprets a
 * leftover roll as a later delivery or bonus merely because a correction
 * changed frame topology (Slice 4 P1: CORRECTION-DOWNSTREAM-LEGALITY).
 *
 * Scoring bonuses for legal frames 1–9 are taken from subsequent stored
 * deliveries in frame order — not by flattening-and-reparsing past extra rolls
 * that remain attached to an earlier frame.
 *
 * Legality (ADR-003 Decision 4-4): illegality is never silently repaired. Facts
 * are preserved. A structurally illegal fact set yields
 * `DOMAIN_INVALID_REQUIRING_REPAIR` and no final score.
 */
export function deriveGame(facts: readonly RollFact[]): GameScores {
  const ordered = orderRollFacts(facts);
  if (ordered.length === 0) {
    return emptyGame();
  }

  const byFrame = groupByFrame(ordered);
  if (detectNumberingIllegality(ordered) || anyFrameTopologyIllegal(byFrame)) {
    return invalidGameFromFacts(ordered, byFrame);
  }

  const deliveryFrames: Array<{ frameNumber: number; start: number; deliveries: number[] }> = [];
  const stream: number[] = [];
  for (let frame = 1; frame <= FRAME_COUNT; frame++) {
    const deliveries = (byFrame.get(frame) ?? []).map((r) => r.pinfall);
    const start = stream.length;
    stream.push(...deliveries);
    deliveryFrames.push({ frameNumber: frame, start, deliveries });
  }

  const frames = scoreFrames(deliveryFrames, stream);
  const complete = deliveryFrames.every((f) => frameComplete(f.frameNumber, f.deliveries));
  const status: GameStatus = complete ? "COMPLETED" : "IN_PROGRESS";
  const runningTotals = computeRunningTotals(frames);
  const finalTotal =
    status === "COMPLETED" && frames.every((f) => f.isResolved)
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

function groupByFrame(ordered: readonly RollFact[]): Map<number, RollFact[]> {
  const byFrame = new Map<number, RollFact[]>();
  for (const fact of ordered) {
    const list = byFrame.get(fact.frame_number) ?? [];
    list.push(fact);
    byFrame.set(fact.frame_number, list);
  }
  return byFrame;
}

function detectNumberingIllegality(ordered: readonly RollFact[]): boolean {
  for (const f of ordered) {
    if (f.frame_number < 1 || f.frame_number > FRAME_COUNT) return true;
    if (!Number.isInteger(f.pinfall) || f.pinfall < 0 || f.pinfall > 10) return true;
  }
  const byFrame = groupByFrame(ordered);
  for (const [, list] of byFrame) {
    const numbers = list.map((r) => r.roll_number).sort((a, b) => a - b);
    for (let i = 0; i < numbers.length; i++) {
      if (numbers[i] !== i + 1) return true;
    }
    if (numbers.length > 3) return true;
  }
  return false;
}

function anyFrameTopologyIllegal(byFrame: Map<number, RollFact[]>): boolean {
  for (const [frameNumber, rolls] of byFrame) {
    if (frameTopologyIllegal(frameNumber, rolls.map((r) => r.pinfall))) return true;
  }
  return false;
}

/**
 * Structural (topology) legality of the rolls already stored on a frame.
 * Extra rolls after a frames 1–9 strike, or a third roll after an open tenth,
 * are illegal even though the observations remain preserved.
 */
function frameTopologyIllegal(frameNumber: number, pinfalls: readonly number[]): boolean {
  if (frameNumber < FRAME_COUNT) {
    if (pinfalls.length > 2) return true;
    if (pinfalls[0] === 10 && pinfalls.length > 1) return true;
    if (pinfalls.length >= 2 && pinfalls[0]! + pinfalls[1]! > 10) return true;
    return false;
  }
  if (pinfalls.length > 3) return true;
  const first = pinfalls[0];
  const second = pinfalls[1];
  const third = pinfalls[2];
  if (first === 10) {
    return false;
  }
  if (second === undefined) return false;
  if (first! + second > 10) return true;
  if (first! + second < 10 && third !== undefined) return true;
  return false;
}

function frameComplete(frameNumber: number, deliveries: readonly number[]): boolean {
  if (frameNumber < FRAME_COUNT) {
    if (deliveries.length === 0) return false;
    if (deliveries[0] === 10) return deliveries.length === 1;
    return deliveries.length === 2;
  }
  return frame10Complete(deliveries);
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
      }
    } else {
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

function emptyFrameProjection(frameNumber: number, deliveries: number[] = []): FrameProjection {
  return {
    frame_number: frameNumber,
    deliveries,
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

function invalidGameFromFacts(
  ordered: readonly RollFact[],
  byFrame: Map<number, RollFact[]>,
): GameScores {
  const frames: FrameProjection[] = [];
  for (let f = 1; f <= FRAME_COUNT; f++) {
    frames.push(emptyFrameProjection(f, (byFrame.get(f) ?? []).map((r) => r.pinfall)));
  }
  return {
    frames,
    runningTotals: [],
    finalTotal: null,
    status: "DOMAIN_INVALID_REQUIRING_REPAIR",
    finalScoreUnavailable: true,
    rollCount: ordered.length,
  };
}
