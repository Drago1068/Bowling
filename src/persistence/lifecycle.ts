import {
  initializeApplication,
  type ApplicationInitResult,
  type InitializeOptions,
} from "./startup.ts";
import type { NetworkAvailability } from "../sync/presentation.ts";
import type { SqliteDriver } from "./sqlite/driver.ts";

/**
 * Application lifecycle events that must recover from persistence rather than
 * from in-memory React state.
 */
export const LIFECYCLE_EVENTS = [
  "launch",
  "normal_close",
  "background",
  "foreground",
  "process_restart",
  "forced_termination",
  "lock_resume",
] as const;

export type LifecycleEvent = (typeof LIFECYCLE_EVENTS)[number];

export interface LifecycleRecoveryInput {
  /** Re-open the file-backed database. Required after close/restart/termination. */
  openDriver: () => SqliteDriver;
  /**
   * Already-open driver for background/foreground/lock-resume, where the
   * process is still alive. When omitted, `openDriver` is used.
   */
  openDriverIfAlive?: () => SqliteDriver;
  network?: NetworkAvailability;
  checkpointKeys?: readonly string[];
}

function requiresReopen(event: LifecycleEvent): boolean {
  return (
    event === "launch" ||
    event === "normal_close" ||
    event === "process_restart" ||
    event === "forced_termination"
  );
}

/**
 * Recover durable application state after a lifecycle event.
 *
 * Close / process restart / forced termination always reopen the database
 * file. Background / foreground / lock-resume re-read from the live connection
 * when one is supplied, still treating persistence as authoritative.
 */
export function recoverAfterLifecycle(
  event: LifecycleEvent,
  input: LifecycleRecoveryInput,
): ApplicationInitResult {
  const options: InitializeOptions = {
    openDriver: requiresReopen(event)
      ? input.openDriver
      : (input.openDriverIfAlive ?? input.openDriver),
    network: input.network,
    checkpointKeys: input.checkpointKeys,
  };
  return initializeApplication(options);
}
