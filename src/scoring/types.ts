/**
 * Slice 4 deterministic ten-pin scoring derivation.
 *
 * RULE_AUTHORITY=USBC_PLAYING_RULES
 * RULE_EDITION=2026-2027
 * SCORING_DOMAIN=AMERICAN_TENPINS
 *
 * See `docs/reference/usbc-playing-rules-2026-2027.provenance.md` for the
 * pinned, immutable rule reference. Scoring is DERIVED from observed roll facts
 * and is never authoritative storage. The same ordered fact set under this
 * pinned rule version recomputes deterministically.
 */

/** Observed roll fact as fed to the derivation. `roll_number`/`entity_id` are
 * ordering/audit fields; `pinfall` is the authoritative observation. */
export interface RollFact {
  /** Roll identity (UUIDv7); stable tiebreak within (frame_number, roll_number). */
  entity_id: string;
  frame_number: number;
  roll_number: number;
  /** Observed pinfall 0..10. */
  pinfall: number;
  /** Optimistic concurrency version; used only for audit tiebreak. */
  entity_version: number;
}

/**
 * Derived per-frame projection. `status` is DERIVED (ADR-003 §9); no durable
 * frame-score truth exists. `score` is only non-null when the frame score is
 * fully resolvable; otherwise `isResolved=false` (unresolved bonus).
 */
export type FrameStatus = "OPEN" | "SPARE" | "STRIKE";

export interface FrameProjection {
  frame_number: number;
  /** Deliveries observed in this frame (pinfalls), in order. */
  deliveries: number[];
  status: FrameStatus | null;
  /** Frames 1-9: first-ball strike; frame 10: first-ball strike (may carry bonuses). */
  isStrike: boolean;
  isSpare: boolean;
  isOpen: boolean;
  /** True when the frame is fully scored (no pending bonus). */
  isResolved: boolean;
  /** Derived frame score, present only when `isResolved`. */
  score: number | null;
  /** True when the frame's score depends on a future roll still to come. */
  awaitingBonus: boolean;
}

/** Overall derived game status. */
export type GameStatus = "NOT_STARTED" | "IN_PROGRESS" | "COMPLETED" | "DOMAIN_INVALID_REQUIRING_REPAIR";

export interface GameScores {
  /** Derived per-frame scores in frame order; null where unresolved. */
  frames: FrameProjection[];
  /** Running total after each frame (final when every frame resolved). */
  runningTotals: Array<number | null>;
  /** Derived final total, present only when the whole game is fully resolved. */
  finalTotal: number | null;
  status: GameStatus;
  /** True when final total is not yet available (unresolved bonus / incomplete). */
  finalScoreUnavailable: boolean;
  /** Match the legal maximum roll count for a full game (12). */
  rollCount: number;
}

/** Machine-readable legality result for an attempted local mutation. */
export type ScoringValidationCode =
  | "PINFALL_LT_0"
  | "PINFALL_GT_10"
  | "IMPOSSIBLE_TWO_ROLL_TOTAL"
  | "INVALID_TENTH_BONUS"
  | "ROLL_AFTER_COMPLETION"
  | "INVALID_STATE_TRANSITION";

export interface ScoringValidationResult {
  ok: boolean;
  code: ScoringValidationCode | null;
  message: string | null;
}

/** Maximum legal roll count across a full ten-pin game (10 frames + bonuses). */
export const MAX_GAME_ROLLS = 12;
export const FRAME_COUNT = 10;

/** Deterministic sort: (frame_number, roll_number, entity_id UUIDv7). */
export function orderRollFacts(facts: readonly RollFact[]): RollFact[] {
  return [...facts].sort((a, b) => {
    if (a.frame_number !== b.frame_number) return a.frame_number - b.frame_number;
    if (a.roll_number !== b.roll_number) return a.roll_number - b.roll_number;
    return a.entity_id < b.entity_id ? -1 : a.entity_id > b.entity_id ? 1 : 0;
  });
}
