/**
 * Thin mobile score-sheet projection (ADR-003 §20 Thin mobile flow).
 *
 * Importable from the mobile runtime: depends only on the portable surface
 * (`src/portable.ts`) — no Node-only modules. Scoring output is DERIVED from
 * observed roll facts and is never authoritative storage or sync payload.
 */
import {
  deriveGame,
  type GameScores,
  type RollFact,
} from "../../../src/portable.ts";

/**
 * Derive the complete score sheet for an ordered set of observed roll facts.
 * Deterministic: the same ordered fact set always recomputes the same sheet.
 */
export function buildScoreSheet(facts: readonly RollFact[]): GameScores {
  return deriveGame(facts);
}

/** Compact textual sheet for diagnostic display. */
export function formatScoreSheet(sheet: GameScores): string {
  const frameScores = sheet.frames
    .map((f) => (f.score === null ? "-" : String(f.score)))
    .join(" ");
  const total =
    sheet.finalTotal === null ? "unavailable" : String(sheet.finalTotal);
  const status = sheet.status === "COMPLETED" ? "completed" : sheet.status;
  return `${frameScores} | total: ${total} (${status})`;
}

function fact(
  frame_number: number,
  roll_number: number,
  pinfall: number,
): RollFact {
  return {
    entity_id: `demo-${frame_number}-${roll_number}`,
    frame_number,
    roll_number,
    pinfall,
    entity_version: 1,
  };
}

/** A known-good mixed game (total 169) for offline diagnostic display. */
export function demoMixedGameFacts(): RollFact[] {
  const specs: Array<{ frame: number; rolls: number[] }> = [
    { frame: 1, rolls: [10] },
    { frame: 2, rolls: [3, 6] },
    { frame: 3, rolls: [9, 1] },
    { frame: 4, rolls: [7, 2] },
    { frame: 5, rolls: [10] },
    { frame: 6, rolls: [10] },
    { frame: 7, rolls: [8, 2] },
    { frame: 8, rolls: [9, 0] },
    { frame: 9, rolls: [10] },
    { frame: 10, rolls: [7, 3, 9] },
  ];
  const facts: RollFact[] = [];
  for (const { frame, rolls } of specs) {
    rolls.forEach((p, i) => facts.push(fact(frame, i + 1, p)));
  }
  return facts;
}
