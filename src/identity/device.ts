import { newDeviceId } from "./ids.ts";

/**
 * Durable device identity.
 *
 * A device id is:
 *   - generated once per installation,
 *   - stable across process restarts and ordinary application upgrades,
 *   - non-PII (a random UUIDv7 carries no personal or device-fingerprint data),
 *   - globally unique,
 *   - available before any network connectivity exists.
 *
 * The store (see persistence contracts) owns durability; this module exposes
 * the identity value and its generation, so Cursor can persist it through any
 * SQLite binding later.
 */
export interface DeviceIdentity {
  device_id: string;
  created_at: string;
}

/** Generate a fresh device identity (UUIDv7). */
export function createDeviceIdentity(nowMs?: number): DeviceIdentity {
  return {
    device_id: newDeviceId(nowMs),
    created_at: new Date(nowMs ?? Date.now()).toISOString(),
  };
}

/**
 * Storage contract for the durable device identity. Implementations must
 * return the SAME identity across process restarts.
 */
export interface DeviceIdentityStore {
  getOrCreate(): DeviceIdentity;
  get(): DeviceIdentity | null;
}