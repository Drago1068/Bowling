import type { Correction, EntityType } from "./entities.ts";
import { newCorrectionId } from "./identity/ids.ts";
import { newEntityMetadata } from "./metadata.ts";

/**
 * Correction contract.
 *
 * Corrections are auditable, append-only canonical data. A correction NEVER
 * deletes or silently overwrites history: it records the target entity type and
 * id, the prior entity version it applies to, the corrected representation and
 * an optional structured `change` delta, plus reason and actor. The original
 * entity representation is retained and remains traceable through the version
 * lineage and the correction record itself.
 */
export interface CorrectionOptions {
  target_entity_type: EntityType;
  target_entity_id: string;
  prior_entity_version: number;
  corrected_representation: unknown;
  change?: unknown;
  reason: string;
  actor: string;
  origin_device_id: string;
  now?: Date;
}

export function createCorrection(options: CorrectionOptions): Correction {
  const now = options.now ?? new Date();
  const id = newCorrectionId(now.getTime());
  const meta = newEntityMetadata({
    id,
    origin_device_id: options.origin_device_id,
    data_quality: "CORRECTED",
    now,
  });
  return {
    ...meta,
    entity_type: "Correction",
    target_entity_type: options.target_entity_type,
    target_entity_id: options.target_entity_id,
    prior_entity_version: options.prior_entity_version,
    corrected_representation: options.corrected_representation,
    change: options.change ?? null,
    reason: options.reason,
    actor: options.actor,
  };
}