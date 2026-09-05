import type { CanonicalEntity, EntityType } from "../../entities.ts";
import type { CanonicalEntityStore } from "../contracts.ts";
import type { SqliteDriver } from "./driver.ts";

export function createEntityStore(db: SqliteDriver): CanonicalEntityStore {
  const getStmt = db.prepare(
    "SELECT payload FROM canonical_entities WHERE entity_type = ? AND id = ? AND archived = 0",
  );
  const upsertStmt = db.prepare(
    `INSERT INTO canonical_entities
       (id, entity_type, entity_version, schema_version, data_quality,
        origin_device_id, created_at, updated_at, archived, payload)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(entity_type, id) DO UPDATE SET
       entity_version = excluded.entity_version,
       schema_version = excluded.schema_version,
       data_quality = excluded.data_quality,
       origin_device_id = excluded.origin_device_id,
       updated_at = excluded.updated_at,
       archived = excluded.archived,
       payload = excluded.payload`,
  );
  const archiveStmt = db.prepare(
    "UPDATE canonical_entities SET archived = ?, updated_at = ? WHERE entity_type = ? AND id = ?",
  );
  const listStmt = db.prepare(
    "SELECT payload FROM canonical_entities WHERE entity_type = ? AND archived = 0",
  );

  return {
    get(entityType: EntityType, id: string): CanonicalEntity | null {
      const row = getStmt.get(entityType, id) as { payload: string } | undefined;
      return row ? (JSON.parse(row.payload) as CanonicalEntity) : null;
    },
    upsert(entity: CanonicalEntity): void {
      const archived = entity.deleted ? 1 : 0;
      upsertStmt.run(
        entity.id,
        entity.entity_type,
        entity.entity_version,
        entity.schema_version,
        entity.data_quality,
        entity.origin_device_id,
        entity.created_at,
        entity.updated_at,
        archived,
        JSON.stringify(entity),
      );
    },
    markArchived(entityType: EntityType, id: string, archived: boolean): void {
      archiveStmt.run(archived ? 1 : 0, new Date().toISOString(), entityType, id);
    },
    list(entityType: EntityType): CanonicalEntity[] {
      const rows = listStmt.all(entityType) as Array<{ payload: string }>;
      return rows.map((r) => JSON.parse(r.payload) as CanonicalEntity);
    },
  };
}