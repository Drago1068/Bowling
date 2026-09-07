import type { CanonicalEntityStore } from "../persistence/contracts.ts";
import type { Frame, Roll } from "../entities.ts";
import type { RollFact } from "./types.ts";

/**
 * Load the effective, ordered roll facts for a game from an entity store,
 * honoring the integrity invariant that scoring is DERIVED from observed roll
 * facts (ADR-003). Correction-driven effective values (data_quality CORRECTED)
 * are read from the CURRENT canonical representation; the original observed
 * values remain traceable through the correction record and version lineage.
 */
export function loadGameFacts(
  store: CanonicalEntityStore,
  gameId: string,
): RollFact[] {
  const frames = store.list("Frame") as Frame[];
  const rolls = store.list("Roll") as Roll[];

  const frameToNumber = new Map<string, number>();
  for (const frame of frames) {
    if (frame.game_id === gameId && frame.frame_number != null) {
      frameToNumber.set(frame.id, frame.frame_number);
    }
  }

  const facts: RollFact[] = [];
  for (const roll of rolls) {
    const frameNumber = frameToNumber.get(roll.frame_id);
    if (frameNumber == null) continue; // not part of this game's delivery set
    if (roll.roll_number == null || roll.pinfall == null) continue;
    facts.push({
      entity_id: roll.id,
      frame_number: frameNumber,
      roll_number: roll.roll_number,
      pinfall: roll.pinfall,
      entity_version: roll.entity_version,
    });
  }
  return facts;
}
