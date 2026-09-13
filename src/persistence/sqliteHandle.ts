import type { FailedInitResult, InitFailureStage } from "./startup.ts";
import type { SqliteDriver } from "./sqlite/driver.ts";

/** Message shape recorded on the original device NativeDatabase.execSync NPE. */
export const NATIVE_EXECSYNC_NPE_MESSAGE =
  "Call to function 'NativeDatabase.execSync' has been rejected. → Caused by: java.lang.NullPointerException";

/**
 * Hits the same `exec` / native `execSync` path as PRAGMA preparation.
 * Does not change journal mode, schema, or data.
 */
export function probeSqliteDriver(driver: SqliteDriver): void {
  driver.exec("SELECT 1;");
}

export type SqliteCloseStatus =
  | "not_needed"
  | "closed"
  | "already_closed"
  | "close_failed";

export interface SqliteCloseResult {
  status: SqliteCloseStatus;
  message?: string;
}

export function isAlreadyClosedSqliteError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /already closed|not open|database is (not open|closed)/i.test(message);
}

export function isRecoverableNativeSqliteFailure(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return (
    /NativeDatabase\.(execSync|getFirstSync|getAllSync|runSync)/i.test(message) ||
    /Call to function 'NativeDatabase/i.test(message) ||
    /NullPointerException/i.test(message) ||
    /database is (not open|closed)/i.test(message)
  );
}

/**
 * Close the driver and classify the outcome. Never reports `closed` on throw.
 * The caller must drop the reference regardless of status (detached).
 */
export function closeSqliteDriver(
  driver: SqliteDriver | null | undefined,
): SqliteCloseResult {
  if (!driver) return { status: "not_needed" };
  try {
    driver.close();
    return { status: "closed" };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (isAlreadyClosedSqliteError(err)) {
      return { status: "already_closed", message };
    }
    return { status: "close_failed", message };
  }
}

/**
 * Whether a failed close still allows a same-file fresh-connection open.
 * Native-like / already-closed: yes (old handle is unusable).
 * Other close failures: no (explicit fail; do not open a second connection).
 */
export function canProceedAfterCloseFailure(result: SqliteCloseResult): boolean {
  return (
    result.status === "closed" ||
    result.status === "already_closed" ||
    result.status === "not_needed" ||
    (result.status === "close_failed" &&
      isRecoverableNativeSqliteFailure(result.message ?? ""))
  );
}

/** Test/cleanup helper. Recovery must use `closeSqliteDriver`. */
export function closeSqliteDriverQuietly(
  driver: SqliteDriver | null | undefined,
): void {
  closeSqliteDriver(driver);
}

export function databaseOpenFailedFrom(
  err: unknown,
  failureStage: InitFailureStage,
): FailedInitResult {
  const detail = err instanceof Error ? err.message : String(err);
  return {
    ok: false,
    status: "DATABASE_OPEN_FAILED",
    statuses: ["DATABASE_OPEN_FAILED"],
    message: `[${failureStage}] ${detail}`,
    retainedExistingDatabase: true,
    schemaVersion: null,
    failureStage,
  };
}

/**
 * After a successful SELECT 1 probe, fail the next `exec` that is not the probe.
 * Does not mutate stored facts. One shot.
 */
export function withOneShotPostProbeExecFailure(
  inner: SqliteDriver,
  message: string = NATIVE_EXECSYNC_NPE_MESSAGE,
): SqliteDriver {
  let fired = false;
  return {
    exec(sql: string): void {
      const trimmed = sql.trimStart().toUpperCase();
      if (!fired && !trimmed.startsWith("SELECT 1")) {
        fired = true;
        throw new Error(message);
      }
      inner.exec(sql);
    },
    prepare(sql: string) {
      return inner.prepare(sql);
    },
    close(): void {
      inner.close();
    },
  };
}

export function formatRecoveryDiagnostic(d: {
  recoveryAttempted: boolean;
  closeOutcome: SqliteCloseStatus;
  newConnectionOpened: boolean;
  initializationOutcome: "ok" | "failed" | "not_run";
  recoveredDriverPublished: boolean;
  injectedPostProbeFault: boolean;
  stages: readonly string[];
}): string {
  return [
    `recoveryAttempted=${d.recoveryAttempted}`,
    `close=${d.closeOutcome}`,
    `newConnection=${d.newConnectionOpened}`,
    `init=${d.initializationOutcome}`,
    `published=${d.recoveredDriverPublished}`,
    `injected=${d.injectedPostProbeFault}`,
    `stages=${d.stages.join(",") || "none"}`,
  ].join(" ");
}
