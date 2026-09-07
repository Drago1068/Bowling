import {
  FRAME_COUNT,
  type RollFact,
  type ScoringValidationCode,
  type ScoringValidationResult,
} from "./types.ts";
import { orderRollFacts } from "./types.ts";
import { deriveGame } from "./derive.ts";

export interface NextRollCandidate {
  frame_number: number;
  roll_number: number;
  pinfall: number;
}

/**
 * Local single-mutation legality validation (ADR-003 §11).
 *
 * "Where legality can be decided from locally available facts, it is decided at
 * the local domain boundary." A roll that is legal in isolation but illegal
 * given the current effective facts of its frame is rejected with an explicit
 * machine-readable code. Illegal facts are never invented or silently repaired.
 *
 * Correction-drive illegality (a corrected earlier fact making later facts
 * illegal) is NOT rejected here; it surfaces through `deriveGame` as
 * `DOMAIN_INVALID_REQUIRING_REPAIR` while all observations are preserved
 * (ADR-003 Decision 4-4).
 */
export function validateNextRoll(
  existing: readonly RollFact[],
  candidate: NextRollCandidate,
): ScoringValidationResult {
  if (candidate.pinfall < 0) return invalid("PINFALL_LT_0", "pinfall must be >= 0");
  if (candidate.pinfall > 10) return invalid("PINFALL_GT_10", "pinfall must be <= 10");
  if (candidate.frame_number < 1 || candidate.frame_number > FRAME_COUNT) {
    return invalid("INVALID_STATE_TRANSITION", `frame_number out of range: ${candidate.frame_number}`);
  }

  const ordered = orderRollFacts(existing);

  // A structurally completed game rejects any new non-correction roll.
  if (deriveGame(existing).status === "COMPLETED") {
    return invalid("ROLL_AFTER_COMPLETION", "game is already completed; no new roll may be recorded");
  }

  const frameRolls = new Map<number, number[]>();
  for (const f of ordered) {
    const list = frameRolls.get(f.frame_number) ?? [];
    list.push(f.roll_number);
    frameRolls.set(f.frame_number, list);
  }

  const existingInFrame = (frameRolls.get(candidate.frame_number) ?? []).sort((a, b) => a - b);
  const expectedNextRoll =
    existingInFrame.length === 0 ? 1 : existingInFrame[existingInFrame.length - 1]! + 1;
  if (candidate.roll_number !== expectedNextRoll) {
    return invalid(
      "INVALID_STATE_TRANSITION",
      `roll_number for frame ${candidate.frame_number} must be ${expectedNextRoll}, got ${candidate.roll_number}`,
    );
  }
  if (expectedNextRoll > 3) {
    return invalid("INVALID_TENTH_BONUS", `frame ${candidate.frame_number} already has its legal roll count`);
  }

  // Evaluate frame legality with the candidate as the next delivery in its frame.
  const framePinfalls = ordered
    .filter((f) => f.frame_number === candidate.frame_number)
    .map((f) => f.pinfall);
  const withCandidate = [...framePinfalls, candidate.pinfall];

  // Frames 1-9: two-roll total must not exceed ten on the second ball of a
  // non-strike frame.
  if (candidate.frame_number < FRAME_COUNT) {
    if (withCandidate.length === 2 && withCandidate[0]! + withCandidate[1]! > 10) {
      return invalid(
        "IMPOSSIBLE_TWO_ROLL_TOTAL",
        `frame ${candidate.frame_number} first two rolls sum to ${withCandidate[0]! + withCandidate[1]!} (>10)`,
      );
    }
    return ok();
  }

  // Frame 10.
  if (withCandidate.length === 1) {
    return ok(); // first ball: always legal (0..10).
  }
  const first = withCandidate[0]!;
  const second = withCandidate[1]!;
  if (withCandidate.length === 2) {
    if (first + second > 10) {
      return invalid(
        "IMPOSSIBLE_TWO_ROLL_TOTAL",
        `frame 10 first two rolls sum to ${first + second} (>10)`,
      );
    }
    return ok();
  }
  // Third roll.
  if (first !== 10 && first + second !== 10) {
    return invalid(
      "INVALID_TENTH_BONUS",
      "a tenth-frame third roll is only legal after a strike or a spare",
    );
  }
  return ok();
}

function ok(): ScoringValidationResult {
  return { ok: true, code: null, message: null };
}

function invalid(code: ScoringValidationCode, message: string): ScoringValidationResult {
  return { ok: false, code, message };
}
