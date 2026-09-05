import type { SyncCheckpointStore } from "../contracts.ts";
import type { SqliteDriver } from "./driver.ts";

export function createCheckpointStore(db: SqliteDriver): SyncCheckpointStore {
  const getStmt = db.prepare("SELECT value FROM sync_checkpoint WHERE key = ?");
  const setStmt = db.prepare(
    `INSERT INTO sync_checkpoint (key, value, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at`,
  );

  return {
    get(key: string): string | null {
      const row = getStmt.get(key) as { value: string } | undefined;
      return row ? row.value : null;
    },
    set(key: string, value: string): void {
      setStmt.run(key, value, new Date().toISOString());
    },
  };
}