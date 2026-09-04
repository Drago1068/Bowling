import type { DatabaseSync } from "node:sqlite";
import type { EntityType } from "../../entities.ts";
import type { AppliedChange, AppliedChangeStore } from "../contracts.ts";

export function createAppliedChangeStore(db: DatabaseSync): AppliedChangeStore {
  const insertStmt = db.prepare(
    `INSERT OR IGNORE INTO applied_changes
       (change_id, device_id, entity_type, entity_id, entity_version, payload_hash, applied_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const getStmt = db.prepare("SELECT change_id FROM applied_changes WHERE change_id = ?");
  const listStmt = db.prepare(
    "SELECT * FROM applied_changes WHERE entity_type = ? AND entity_id = ? ORDER BY applied_at",
  );

  return {
    record(change: AppliedChange): void {
      insertStmt.run(
        change.change_id,
        change.device_id,
        change.entity_type,
        change.entity_id,
        change.entity_version,
        change.payload_hash,
        change.applied_at,
      );
    },
    isApplied(changeId: string): boolean {
      return getStmt.get(changeId) !== undefined;
    },
    listForEntity(entityType: EntityType, entityId: string): AppliedChange[] {
      const rows = listStmt.all(entityType, entityId) as unknown as Array<{
        change_id: string;
        device_id: string;
        entity_type: string;
        entity_id: string;
        entity_version: number;
        payload_hash: string;
        applied_at: string;
      }>;
      return rows.map((r) => ({
        change_id: r.change_id,
        device_id: r.device_id,
        entity_type: r.entity_type as EntityType,
        entity_id: r.entity_id,
        entity_version: r.entity_version,
        payload_hash: r.payload_hash,
        applied_at: r.applied_at,
      }));
    },
  };
}