import type { DatabaseSync } from "node:sqlite";
import type { Correction, EntityType } from "../../entities.ts";
import type { CorrectionId } from "../../identity/ids.ts";
import { isDataQuality } from "../../quality.ts";
import type { CorrectionStore } from "../contracts.ts";

interface CorrectionRow {
  id: string;
  target_entity_type: string;
  target_entity_id: string;
  prior_entity_version: number;
  corrected_representation: string;
  change: string | null;
  reason: string;
  actor: string;
  entity_version: number;
  schema_version: number;
  data_quality: string;
  origin_device_id: string;
  created_at: string;
  updated_at: string;
}

function correctionFromRow(row: CorrectionRow): Correction {
  return {
    id: row.id as CorrectionId,
    entity_type: "Correction",
    target_entity_type: row.target_entity_type as EntityType,
    target_entity_id: row.target_entity_id,
    prior_entity_version: row.prior_entity_version,
    corrected_representation: JSON.parse(row.corrected_representation),
    change: row.change === null ? null : JSON.parse(row.change),
    reason: row.reason,
    actor: row.actor,
    schema_version: row.schema_version,
    entity_version: row.entity_version,
    data_quality: isDataQuality(row.data_quality) ? row.data_quality : "UNKNOWN",
    origin_device_id: row.origin_device_id,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

/**
 * Correction persistence. Corrections are append-only audit records: they are
 * inserted, never updated in place, so the original entity history remains
 * traceable through the version lineage plus each correction record.
 */
export function createCorrectionStore(db: DatabaseSync): CorrectionStore {
  const insertStmt = db.prepare(
    `INSERT INTO corrections
       (id, target_entity_type, target_entity_id, prior_entity_version,
        corrected_representation, change, reason, actor,
        entity_version, schema_version, data_quality, origin_device_id,
        created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const getStmt = db.prepare("SELECT * FROM corrections WHERE id = ?");
  const listStmt = db.prepare(
    "SELECT * FROM corrections WHERE target_entity_type = ? AND target_entity_id = ? ORDER BY created_at",
  );

  return {
    record(correction: Correction): void {
      insertStmt.run(
        correction.id,
        correction.target_entity_type,
        correction.target_entity_id,
        correction.prior_entity_version,
        JSON.stringify(correction.corrected_representation),
        correction.change === null ? null : JSON.stringify(correction.change),
        correction.reason,
        correction.actor,
        correction.entity_version,
        correction.schema_version,
        correction.data_quality,
        correction.origin_device_id,
        correction.created_at,
        correction.updated_at,
      );
    },
    get(correctionId: string): Correction | null {
      const row = getStmt.get(correctionId) as CorrectionRow | undefined;
      return row ? correctionFromRow(row) : null;
    },
    listForTarget(entityType: EntityType, entityId: string): Correction[] {
      const rows = listStmt.all(entityType, entityId) as unknown as CorrectionRow[];
      return rows.map(correctionFromRow);
    },
  };
}