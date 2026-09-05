import type { CanonicalEntity } from "../entities.ts";
import type { DeviceIdentity } from "../identity/device.ts";
import type { OutboxEntry, SyncCheckpointStore } from "./contracts.ts";
import type { SqliteDriver } from "./sqlite/driver.ts";
import { prepareDatabase } from "./sqlite/database.ts";
import { readSchemaVersion, type MigrateOptions } from "./sqlite/migrate.ts";
import { createDeviceStore } from "./sqlite/deviceStore.ts";
import { createOutboxStore } from "./sqlite/outboxStore.ts";
import { createCheckpointStore } from "./sqlite/checkpointStore.ts";
import { createEntityStore } from "./sqlite/entityStore.ts";
import {
  deriveSyncPresentation,
  type NetworkAvailability,
  type SyncPresentationSnapshot,
} from "../sync/presentation.ts";

/**
 * Application-layer startup / recovery statuses.
 *
 * Failures are explicit and distinct. They are never collapsed into a generic
 * ERROR, and a failed open/migration must not silently recreate the database.
 */
export const STARTUP_STATUSES = [
  "NO_ACTIVE_SESSION",
  "ACTIVE_SESSION_RECOVERED",
  "LOCAL_CHANGES_PENDING",
  "SYNC_TEMPORARILY_UNAVAILABLE",
  "SYNC_CONFLICT_PRESENT",
  "DATABASE_MIGRATION_FAILED",
  "DATABASE_OPEN_FAILED",
  "UNSUPPORTED_SCHEMA",
] as const;

export type StartupStatus = (typeof STARTUP_STATUSES)[number];

export type StartupFailureStatus =
  | "DATABASE_MIGRATION_FAILED"
  | "DATABASE_OPEN_FAILED"
  | "UNSUPPORTED_SCHEMA";

export interface RecoveredDomainState {
  device: DeviceIdentity;
  schemaVersion: number;
  pendingOutbox: OutboxEntry[];
  checkpoint: Record<string, string>;
  activeSession: CanonicalEntity | null;
}

export interface SuccessfulInitResult {
  ok: true;
  status: "NO_ACTIVE_SESSION" | "ACTIVE_SESSION_RECOVERED";
  statuses: StartupStatus[];
  device: DeviceIdentity;
  schemaVersion: number;
  pendingOutbox: OutboxEntry[];
  localChangesPending: boolean;
  activeSession: CanonicalEntity | null;
  checkpoint: Record<string, string>;
  presentation: SyncPresentationSnapshot;
  network: NetworkAvailability;
}

export interface FailedInitResult {
  ok: false;
  status: StartupFailureStatus;
  statuses: StartupStatus[];
  message: string;
  retainedExistingDatabase: true;
  schemaVersion: number | null;
}

export type ApplicationInitResult = SuccessfulInitResult | FailedInitResult;

export interface InitializeOptions {
  /**
   * Open the SQLite driver. Must not delete an existing database file when
   * open fails — preserving bowling data takes priority over a clean UI.
   */
  openDriver: () => SqliteDriver;
  network?: NetworkAvailability;
  /** Known checkpoint keys to restore (missing keys are omitted). */
  checkpointKeys?: readonly string[];
  migrateOptions?: MigrateOptions;
}

const DEFAULT_CHECKPOINT_KEYS = [
  "last_pull_cursor",
  "last_ack_submission_id",
] as const;

function readCheckpoint(
  store: SyncCheckpointStore,
  keys: readonly string[],
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of keys) {
    const value = store.get(key);
    if (value !== null) out[key] = value;
  }
  return out;
}

function restoreActiveSession(driver: SqliteDriver): CanonicalEntity | null {
  const sessions = createEntityStore(driver).list("BowlingSession");
  return sessions[0] ?? null;
}

function statusesForSuccess(args: {
  activeSession: CanonicalEntity | null;
  localChangesPending: boolean;
  presentation: SyncPresentationSnapshot;
  network: NetworkAvailability;
}): StartupStatus[] {
  const statuses: StartupStatus[] = [
    args.activeSession ? "ACTIVE_SESSION_RECOVERED" : "NO_ACTIVE_SESSION",
  ];
  if (args.localChangesPending) statuses.push("LOCAL_CHANGES_PENDING");
  if (args.presentation.hasConflict) statuses.push("SYNC_CONFLICT_PRESENT");
  if (args.network === "unavailable") {
    statuses.push("SYNC_TEMPORARILY_UNAVAILABLE");
  }
  return statuses;
}

/**
 * Explicit mobile initialization sequence:
 *
 *   OPEN DATABASE
 *     → READ DATABASE SCHEMA VERSION
 *     → RUN REQUIRED MIGRATIONS
 *     → VERIFY MIGRATION SUCCESS
 *     → LOAD/CREATE DEVICE IDENTITY
 *     → READ OUTBOX STATE
 *     → READ SYNC CHECKPOINT
 *     → RESTORE RECOVERABLE DOMAIN STATE
 *     → RETURN INITIALIZATION RESULT
 *
 * Recovery always comes from persistence, never from in-memory React state.
 */
export function initializeApplication(
  options: InitializeOptions,
): ApplicationInitResult {
  const network: NetworkAvailability = options.network ?? "unavailable";
  const checkpointKeys = options.checkpointKeys ?? DEFAULT_CHECKPOINT_KEYS;

  let driver: SqliteDriver;
  try {
    driver = options.openDriver();
  } catch (err) {
    return {
      ok: false,
      status: "DATABASE_OPEN_FAILED",
      statuses: ["DATABASE_OPEN_FAILED"],
      message: err instanceof Error ? err.message : String(err),
      retainedExistingDatabase: true,
      schemaVersion: null,
    };
  }

  try {
    const migrated = prepareDatabase(driver, options.migrateOptions);
    if (!migrated.ok) {
      const status: StartupFailureStatus =
        migrated.code === "UNSUPPORTED_SCHEMA"
          ? "UNSUPPORTED_SCHEMA"
          : "DATABASE_MIGRATION_FAILED";
      return {
        ok: false,
        status,
        statuses: [status],
        message: migrated.message,
        retainedExistingDatabase: true,
        schemaVersion: migrated.schemaVersion,
      };
    }

    const schemaVersion = readSchemaVersion(driver);
    const device = createDeviceStore(driver).getOrCreate();
    const pendingOutbox = createOutboxStore(driver).pending();
    const checkpoint = readCheckpoint(
      createCheckpointStore(driver),
      checkpointKeys,
    );
    const activeSession = restoreActiveSession(driver);
    const presentation = deriveSyncPresentation(pendingOutbox, { network });
    const localChangesPending = pendingOutbox.length > 0;
    const status = activeSession
      ? "ACTIVE_SESSION_RECOVERED"
      : "NO_ACTIVE_SESSION";

    return {
      ok: true,
      status,
      statuses: statusesForSuccess({
        activeSession,
        localChangesPending,
        presentation,
        network,
      }),
      device,
      schemaVersion,
      pendingOutbox,
      localChangesPending,
      activeSession,
      checkpoint,
      presentation,
      network,
    };
  } catch (err) {
    return {
      ok: false,
      status: "DATABASE_OPEN_FAILED",
      statuses: ["DATABASE_OPEN_FAILED"],
      message: err instanceof Error ? err.message : String(err),
      retainedExistingDatabase: true,
      schemaVersion: null,
    };
  }
}

/**
 * Re-read durable state from an already-open database. Used after lifecycle
 * events (background/foreground, lock/resume) so React state is never the
 * recovery authority.
 */
export function recoverFromOpenDatabase(
  driver: SqliteDriver,
  options: {
    network?: NetworkAvailability;
    checkpointKeys?: readonly string[];
    migrateOptions?: MigrateOptions;
  } = {},
): ApplicationInitResult {
  return initializeApplication({
    openDriver: () => driver,
    network: options.network,
    checkpointKeys: options.checkpointKeys,
    migrateOptions: options.migrateOptions,
  });
}
