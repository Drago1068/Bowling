import type { DatabaseSync } from "node:sqlite";
import type { DeviceIdentity, DeviceIdentityStore } from "../../identity/device.ts";
import { createDeviceIdentity } from "../../identity/device.ts";

/**
 * Durable device identity backed by a single-row SQLite table. The id is
 * created once and reused on every subsequent load, remaining stable across
 * process restarts and application upgrades.
 */
export function createDeviceStore(db: DatabaseSync): DeviceIdentityStore {
  const getStmt = db.prepare(
    "SELECT device_id, created_at FROM device_identity WHERE singleton = 1",
  );
  const insertStmt = db.prepare(
    "INSERT INTO device_identity (singleton, device_id, created_at) VALUES (1, ?, ?)",
  );

  return {
    get(): DeviceIdentity | null {
      const row = getStmt.get() as
        | { device_id: string; created_at: string }
        | undefined;
      return row ? { device_id: row.device_id, created_at: row.created_at } : null;
    },
    getOrCreate(): DeviceIdentity {
      const existing = getStmt.get() as
        | { device_id: string; created_at: string }
        | undefined;
      if (existing) {
        return { device_id: existing.device_id, created_at: existing.created_at };
      }
      const identity = createDeviceIdentity();
      insertStmt.run(identity.device_id, identity.created_at);
      return identity;
    },
  };
}