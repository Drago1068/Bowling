import { rmSync, existsSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";
import {
  applyLocalMutation,
  createAppliedChangeStore,
  createCheckpointStore,
  createConflictStore,
  createDeviceStore,
  createEntityStore,
  createOutboxStore,
  createSyncCoordinator,
  newEntityMetadata,
  newFrameId,
  newRollId,
  openDatabase,
  transaction,
  type Roll,
  type SqliteDriver,
  type SyncCoordinator,
  type SyncFaults,
  type SyncTransport,
} from "../../src/index.ts";
import type { BowlingApplication } from "../application/app.ts";
import type { PushTransportResult, PullChange as TransportPullChange } from "../../src/index.ts";

export interface MobileHandle {
  driver: SqliteDriver;
  deviceId: string;
  stores: {
    outbox: ReturnType<typeof createOutboxStore>;
    entities: ReturnType<typeof createEntityStore>;
    checkpoint: ReturnType<typeof createCheckpointStore>;
    applied: ReturnType<typeof createAppliedChangeStore>;
    conflicts: ReturnType<typeof createConflictStore>;
  };
}

export function makeRoll(deviceId: string, pinfall = 10): Roll {
  return {
    ...newEntityMetadata({ id: newRollId(), origin_device_id: deviceId }),
    entity_type: "Roll",
    frame_id: newFrameId(),
    roll_number: 1,
    pinfall,
  } as Roll;
}

export function makeMobile(filename?: string): MobileHandle {
  const driver = openDatabase(filename ?? ":memory:");
  const device = createDeviceStore(driver).getOrCreate();
  return {
    driver,
    deviceId: device.device_id,
    stores: {
      outbox: createOutboxStore(driver),
      entities: createEntityStore(driver),
      checkpoint: createCheckpointStore(driver),
      applied: createAppliedChangeStore(driver),
      conflicts: createConflictStore(driver),
    },
  };
}

export function recordRoll(mobile: MobileHandle, pinfall = 10): { roll: Roll; submissionId: string } {
  const roll = makeRoll(mobile.deviceId, pinfall);
  const result = applyLocalMutation(mobile.driver, {
    deviceId: mobile.deviceId,
    operation: "CREATE",
    entity: roll,
    expectedEntityVersion: 0,
  });
  return { roll, submissionId: result.envelope.submission_id };
}

/** Read an entity's canonical representation from a device's local store. */
export function readEntity<T extends Roll>(mobile: MobileHandle, entityType: string, id: string): T | null {
  return mobile.stores.entities.get(entityType as never, id) as T | null;
}

/**
 * Build a stale UPDATE from the ACTUAL pulled canonical representation: only a
 * mutable bowling field (pinfall) changes; immutable identity is preserved.
 * The outbox submission uses expected_entity_version = pulled version.
 */
export function makeStaleUpdate(mobile: MobileHandle, pinfall: number): { submissionId: string; entityId: string } {
  const pulled = mobile.stores.entities.list("Roll")[0] as Roll;
  const updated: Roll = { ...pulled, pinfall } as Roll;
  const result = applyLocalMutation(mobile.driver, {
    deviceId: mobile.deviceId,
    operation: "UPDATE",
    entity: updated,
    expectedEntityVersion: pulled.entity_version,
  });
  return { submissionId: result.envelope.submission_id, entityId: pulled.id };
}

export interface InProcessTransportOptions {
  blocked?: () => boolean;
  /** Simulate a response lost after the server committed, before the client receives it. */
  loseResponse?: () => boolean;
  /** Record each server result (status + submission id) for direct assertions. */
  serverResults?: Array<{ status: string; submission_id: string }>;
  /** Record every submission id the transport was asked to push. */
  receivedSubmissions?: string[];
}

export function createInProcessTransport(
  app: BowlingApplication,
  opts: InProcessTransportOptions = {},
): SyncTransport {
  return {
    async push(envelope) {
      opts.receivedSubmissions?.push(envelope.submission_id);
      if (opts.blocked?.()) {
        return { outcome: "retryable", reason: "offline" };
      }
      const result = await app.push({
        protocol_version: envelope.protocol_version,
        submission_id: envelope.submission_id,
        device_id: envelope.device_id,
        entity_type: envelope.entity_type,
        entity_id: envelope.entity_id,
        operation_type: envelope.operation_type,
        expected_entity_version: envelope.expected_entity_version,
        payload: envelope.payload,
        payload_hash: envelope.payload_hash,
      });
      opts.serverResults?.push({
        status: (result as PushTransportResult).status,
        submission_id: envelope.submission_id,
      });
      if (opts.loseResponse?.()) {
        return { outcome: "retryable", reason: "response lost" };
      }
      return { outcome: "result", result: result as PushTransportResult };
    },
    async pull(afterCursor, limit) {
      if (opts.blocked?.()) {
        return { outcome: "retryable", reason: "offline" };
      }
      const result = await app.pull(afterCursor, limit);
      return {
        outcome: "page",
        page: {
          changes: result.changes.map(
            (c): TransportPullChange => ({
              change_seq: c.change_seq,
              entity_type: c.entity_type as TransportPullChange["entity_type"],
              entity_id: c.entity_id,
              entity_version: c.entity_version,
              operation: c.operation as TransportPullChange["operation"],
              submission_id: c.submission_id,
              committed_at: c.committed_at,
              payload: c.payload,
              origin_device_id: c.origin_device_id ?? undefined,
            }),
          ),
          next_cursor: result.next_cursor,
          has_more: result.has_more,
        },
      };
    },
  };
}

export function coordinatorFor(
  mobile: MobileHandle,
  transport: SyncTransport,
  faults: SyncFaults = {},
): SyncCoordinator {
  return createSyncCoordinator({
    transport,
    stores: mobile.stores,
    withTransaction: (fn) => transaction(mobile.driver, fn),
    faults,
  });
}

/**
 * Seed a canonical entity on the server (v1) via a throwaway device, then sync
 * it so the server has the entity. Returns the created roll and the server
 * change cursor of that create (used to identify the exact applied-change id).
 */
export async function seedCanonical(
  app: BowlingApplication,
  pinfall = 10,
): Promise<{ roll: Roll; seeder: MobileHandle; serverCursor: number }> {
  const seeder = makeMobile();
  const { roll } = recordRoll(seeder, pinfall);
  const report = await coordinatorFor(seeder, createInProcessTransport(app)).syncOnce();
  return { roll, seeder, serverCursor: report.pushed.lastServerCursor ?? 0 };
}

const RETRYABLE_CLEANUP_CODES = new Set(["EPERM", "EBUSY", "EACCES"]);

/**
 * Windows-safe bounded SQLite file deletion: delete db, -wal, and -shm in order,
 * retrying transient lock errors with bounded backoff, then throw on deadline.
 */
export async function deleteSqliteFiles(path: string): Promise<void> {
  const files = [`${path}-wal`, `${path}-shm`, path];
  const deadline = Date.now() + 5000;
  for (const file of files) {
    for (let attempt = 0; ; attempt += 1) {
      try {
        if (existsSync(file)) rmSync(file, { force: true });
        break;
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code ?? "";
        if (!RETRYABLE_CLEANUP_CODES.has(code) || Date.now() >= deadline) {
          throw err;
        }
        await delay(Math.min(200, 50 * Math.pow(2, attempt)));
      }
    }
  }
}

/** Close a mobile handle; no deletion. For reopen/restart tests. Idempotent. */
export function closeMobile(mobile: MobileHandle | undefined | null): void {
  if (!mobile) return;
  try {
    mobile.driver.close();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/already closed|not open/i.test(message)) return;
    throw err;
  }
}

/** Close a server application pool. Idempotent for already-ended pools. */
export async function closeApplication(app: { close(): Promise<void> } | undefined | null): Promise<void> {
  if (!app) return;
  try {
    await app.close();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/end on pool more than once|Cannot use a pool after calling end/i.test(message)) return;
    throw err;
  }
}

/** Close tracked mobiles (and optional app) before deleting SQLite files. */
export async function disposeTestResources(
  mobiles: Array<MobileHandle | undefined | null>,
  options: { path?: string; app?: { close(): Promise<void> } | undefined | null } = {},
): Promise<void> {
  for (const mobile of mobiles) closeMobile(mobile);
  await closeApplication(options.app);
  if (options.path) await deleteSqliteFiles(options.path);
}