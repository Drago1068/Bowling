import type { EntityType } from "../../entities.ts";
import type { ConflictRecord, ConflictStore } from "../contracts.ts";
import type { SqliteDriver } from "./driver.ts";

export function createConflictStore(db: SqliteDriver): ConflictStore {
  const insertStmt = db.prepare(
    `INSERT INTO sync_conflicts
       (conflict_id, submission_id, entity_type, entity_id,
        expected_entity_version, canonical_entity_version, local_payload, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const listStmt = db.prepare("SELECT * FROM sync_conflicts ORDER BY created_at");
  const listEntityStmt = db.prepare(
    "SELECT * FROM sync_conflicts WHERE entity_type = ? AND entity_id = ? ORDER BY created_at",
  );

  function map(row: {
    conflict_id: string;
    submission_id: string;
    entity_type: string;
    entity_id: string;
    expected_entity_version: number;
    canonical_entity_version: number;
    local_payload: string;
    status: string;
    created_at: string;
  }): ConflictRecord {
    return {
      conflict_id: row.conflict_id,
      submission_id: row.submission_id,
      entity_type: row.entity_type as EntityType,
      entity_id: row.entity_id,
      expected_entity_version: row.expected_entity_version,
      canonical_entity_version: row.canonical_entity_version,
      local_payload: JSON.parse(row.local_payload),
      status: row.status === "RESOLVED" ? "RESOLVED" : "OPEN",
      created_at: row.created_at,
    };
  }

  return {
    record(conflict: ConflictRecord): void {
      insertStmt.run(
        conflict.conflict_id,
        conflict.submission_id,
        conflict.entity_type,
        conflict.entity_id,
        conflict.expected_entity_version,
        conflict.canonical_entity_version,
        JSON.stringify(conflict.local_payload),
        conflict.status,
        conflict.created_at,
      );
    },
    list(): ConflictRecord[] {
      return (listStmt.all() as unknown as Parameters<typeof map>[0][]).map(map);
    },
    listForEntity(entityType: EntityType, entityId: string): ConflictRecord[] {
      return (
        listEntityStmt.all(entityType, entityId) as unknown as Parameters<typeof map>[0][]
      ).map(map);
    },
  };
}