import {
  initializeApplication,
  type ApplicationInitResult,
  type FailedInitResult,
  type InitializeOptions,
} from "./startup.ts";
import type { NetworkAvailability } from "../sync/presentation.ts";
import type { SqliteDriver } from "./sqlite/driver.ts";
import {
  canProceedAfterCloseFailure,
  closeSqliteDriver,
  databaseOpenFailedFrom,
  formatRecoveryDiagnostic,
  isRecoverableNativeSqliteFailure,
  probeSqliteDriver,
  withOneShotPostProbeExecFailure,
  type SqliteCloseStatus,
} from "./sqliteHandle.ts";

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

export type MobileLifecycleEvent =
  | "launch"
  | "foreground"
  | "lock_resume"
  | "process_restart";

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

export interface SqliteRecoveryDiagnostic {
  recoveryAttempted: boolean;
  closeOutcome: SqliteCloseStatus;
  newConnectionOpened: boolean;
  initializationOutcome: "ok" | "failed" | "not_run";
  recoveredDriverPublished: boolean;
  injectedPostProbeFault: boolean;
  stages: string[];
}

export function emptyRecoveryDiagnostic(): SqliteRecoveryDiagnostic {
  return {
    recoveryAttempted: false,
    closeOutcome: "not_needed",
    newConnectionOpened: false,
    initializationOutcome: "not_run",
    recoveredDriverPublished: false,
    injectedPostProbeFault: false,
    stages: [],
  };
}

export interface LifecycleRecoveryPassInput {
  event: MobileLifecycleEvent;
  current: SqliteDriver | null;
  /** Default open of the established file-backed database. Must not delete it. */
  openSameDatabase: () => SqliteDriver;
  /** Same file, requesting a new native connection (Expo `useNewConnection`). */
  openFreshSameDatabase: () => SqliteDriver;
  nativeReopenUsed: boolean;
  network?: NetworkAvailability;
  /** Returns true once when a one-shot post-probe fault is armed. */
  consumePostProbeFault?: () => boolean;
}

export interface LifecycleRecoveryPassResult {
  current: SqliteDriver | null;
  nativeReopenUsed: boolean;
  init: ApplicationInitResult;
  diagnostic: SqliteRecoveryDiagnostic;
}

export interface AcquireSqliteDriverInput {
  event: MobileLifecycleEvent;
  current: SqliteDriver | null;
  openSameDatabase: () => SqliteDriver;
  openFreshSameDatabase?: () => SqliteDriver;
  nativeReopenUsed: boolean;
  network?: NetworkAvailability;
}

export interface AcquireSqliteDriverResult {
  current: SqliteDriver | null;
  nativeReopenUsed: boolean;
  reopened: boolean;
  failure?: FailedInitResult;
  diagnostic: SqliteRecoveryDiagnostic;
}

/**
 * Serialize overlapping launch/foreground work. A superseded ticket must not
 * publish a driver or init result.
 */
export function createLifecycleInitGate() {
  let latest = 0;
  let inFlight = false;
  return {
    claim(): { id: number; beginNow: boolean } {
      latest += 1;
      const id = latest;
      if (inFlight) return { id, beginNow: false };
      inFlight = true;
      return { id, beginNow: true };
    },
    shouldPublish(id: number): boolean {
      return id === latest;
    },
    release(): void {
      inFlight = false;
    },
  };
}

function requiresReopen(event: LifecycleEvent): boolean {
  return (
    event === "launch" ||
    event === "normal_close" ||
    event === "process_restart" ||
    event === "forced_termination"
  );
}

function requiresFreshOpen(event: MobileLifecycleEvent): boolean {
  return event === "launch" || event === "process_restart";
}

function tryOpen(
  open: () => SqliteDriver,
): { driver: SqliteDriver } | { failure: FailedInitResult } {
  try {
    return { driver: open() };
  } catch (err) {
    return { failure: databaseOpenFailedFrom(err, "open") };
  }
}

function initializeForEvent(
  event: MobileLifecycleEvent,
  driver: SqliteDriver,
  network?: NetworkAvailability,
): ApplicationInitResult {
  if (event === "foreground" || event === "lock_resume") {
    return recoverAfterLifecycle(event, {
      openDriver: () => driver,
      openDriverIfAlive: () => driver,
      network,
    });
  }
  return initializeApplication({ openDriver: () => driver, network });
}

function failedInit(failure: FailedInitResult): ApplicationInitResult {
  return failure;
}

/**
 * One lifecycle recovery pass: probe, optional one-shot native reopen of the
 * same file, initialize. At most one native reopen per `nativeReopenUsed` flag.
 */
export function runLifecycleRecoveryPass(
  input: LifecycleRecoveryPassInput,
): LifecycleRecoveryPassResult {
  const diagnostic = emptyRecoveryDiagnostic();
  const stage = (name: string) => {
    diagnostic.stages.push(name);
  };

  const detachAfterClose = (
    driver: SqliteDriver | null,
  ): { current: null; proceed: boolean } => {
    const closed = closeSqliteDriver(driver);
    diagnostic.closeOutcome = closed.status;
    stage(`close:${closed.status}`);
    if (!canProceedAfterCloseFailure(closed)) {
      diagnostic.recoveryAttempted = true;
      return { current: null, proceed: false };
    }
    return { current: null, proceed: true };
  };

  const openFresh = ():
    | { driver: SqliteDriver }
    | { failure: FailedInitResult } => {
    diagnostic.newConnectionOpened = true;
    stage("open_fresh");
    return tryOpen(input.openFreshSameDatabase);
  };

  if (requiresFreshOpen(input.event)) {
    const detached = detachAfterClose(input.current);
    if (input.current && !detached.proceed) {
      diagnostic.initializationOutcome = "failed";
      return {
        current: null,
        nativeReopenUsed: false,
        init: failedInit(
          databaseOpenFailedFrom(
            new Error(`close failed: ${diagnostic.closeOutcome}`),
            "open",
          ),
        ),
        diagnostic,
      };
    }
    const opened = tryOpen(
      input.event === "process_restart"
        ? input.openFreshSameDatabase
        : input.openSameDatabase,
    );
    if (input.event === "process_restart") {
      diagnostic.newConnectionOpened = true;
      stage("open_fresh");
    } else {
      stage("open");
    }
    if ("failure" in opened) {
      diagnostic.initializationOutcome = "failed";
      return {
        current: null,
        nativeReopenUsed: false,
        init: failedInit(opened.failure),
        diagnostic,
      };
    }
    const init = initializeForEvent(input.event, opened.driver, input.network);
    diagnostic.initializationOutcome = init.ok ? "ok" : "failed";
    stage(init.ok ? "init_ok" : "init_failed");
    return {
      current: init.ok ? opened.driver : null,
      nativeReopenUsed: false,
      init,
      diagnostic,
    };
  }

  let driver = input.current;
  let nativeReopenUsed = input.nativeReopenUsed;

  if (!driver) {
    const opened = tryOpen(input.openSameDatabase);
    stage("open");
    if ("failure" in opened) {
      diagnostic.initializationOutcome = "failed";
      return {
        current: null,
        nativeReopenUsed,
        init: failedInit(opened.failure),
        diagnostic,
      };
    }
    driver = opened.driver;
  } else {
    try {
      probeSqliteDriver(driver);
      stage("probe_ok");
    } catch (err) {
      stage("probe_failed");
      if (!nativeReopenUsed && isRecoverableNativeSqliteFailure(err)) {
        diagnostic.recoveryAttempted = true;
        stage("recovery_attempted");
        const detached = detachAfterClose(driver);
        driver = null;
        nativeReopenUsed = true;
        if (!detached.proceed) {
          diagnostic.initializationOutcome = "failed";
          return {
            current: null,
            nativeReopenUsed,
            init: failedInit(
              databaseOpenFailedFrom(
                new Error(`close failed: ${diagnostic.closeOutcome}`),
                "open",
              ),
            ),
            diagnostic,
          };
        }
        const opened = openFresh();
        if ("failure" in opened) {
          diagnostic.initializationOutcome = "failed";
          return {
            current: null,
            nativeReopenUsed,
            init: failedInit(opened.failure),
            diagnostic,
          };
        }
        driver = opened.driver;
      } else {
        detachAfterClose(driver);
        diagnostic.initializationOutcome = "failed";
        return {
          current: null,
          nativeReopenUsed,
          init: failedInit(databaseOpenFailedFrom(err, "prepare")),
          diagnostic,
        };
      }
    }
  }

  if (diagnostic.stages[diagnostic.stages.length - 1] !== "probe_ok") {
    try {
      probeSqliteDriver(driver);
      stage("probe_ok");
    } catch (err) {
      stage("probe_failed_after_open");
      detachAfterClose(driver);
      diagnostic.initializationOutcome = "failed";
      return {
        current: null,
        nativeReopenUsed,
        init: failedInit(databaseOpenFailedFrom(err, "prepare")),
        diagnostic,
      };
    }
  }

  let initDriver = driver;
  if (input.consumePostProbeFault?.()) {
    diagnostic.injectedPostProbeFault = true;
    stage("injected_post_probe_fault");
    initDriver = withOneShotPostProbeExecFailure(driver);
  }

  let init = initializeForEvent(input.event, initDriver, input.network);

  if (
    !init.ok &&
    init.status === "DATABASE_OPEN_FAILED" &&
    !nativeReopenUsed &&
    isRecoverableNativeSqliteFailure(init.message)
  ) {
    diagnostic.recoveryAttempted = true;
    stage("recovery_attempted");
    const detached = detachAfterClose(driver);
    nativeReopenUsed = true;
    if (!detached.proceed) {
      diagnostic.initializationOutcome = "failed";
      return {
        current: null,
        nativeReopenUsed,
        init: failedInit(
          databaseOpenFailedFrom(
            new Error(`close failed: ${diagnostic.closeOutcome}`),
            "open",
          ),
        ),
        diagnostic,
      };
    }
    const opened = openFresh();
    if ("failure" in opened) {
      diagnostic.initializationOutcome = "failed";
      return {
        current: null,
        nativeReopenUsed,
        init: failedInit(opened.failure),
        diagnostic,
      };
    }
    driver = opened.driver;
    try {
      probeSqliteDriver(driver);
      stage("probe_ok");
    } catch (err) {
      stage("probe_failed_after_open");
      detachAfterClose(driver);
      diagnostic.initializationOutcome = "failed";
      return {
        current: null,
        nativeReopenUsed,
        init: failedInit(databaseOpenFailedFrom(err, "prepare")),
        diagnostic,
      };
    }
    init = initializeForEvent(input.event, driver, input.network);
  }

  diagnostic.initializationOutcome = init.ok ? "ok" : "failed";
  stage(init.ok ? "init_ok" : "init_failed");
  if (!init.ok) {
    detachAfterClose(driver);
    return {
      current: null,
      nativeReopenUsed,
      init,
      diagnostic,
    };
  }
  return {
    current: driver,
    nativeReopenUsed,
    init,
    diagnostic,
  };
}

export function acquireSqliteDriverForLifecycle(
  input: AcquireSqliteDriverInput,
): AcquireSqliteDriverResult {
  const pass = runLifecycleRecoveryPass({
    event: input.event,
    current: input.current,
    openSameDatabase: input.openSameDatabase,
    openFreshSameDatabase:
      input.openFreshSameDatabase ?? input.openSameDatabase,
    nativeReopenUsed: input.nativeReopenUsed,
    network: input.network,
  });
  return {
    current: pass.current,
    nativeReopenUsed: pass.nativeReopenUsed,
    reopened: pass.diagnostic.newConnectionOpened,
    failure: pass.init.ok ? undefined : (pass.init as FailedInitResult),
    diagnostic: pass.diagnostic,
  };
}

export interface SqliteLifecycleControllerDeps {
  openSameDatabase: () => SqliteDriver;
  openFreshSameDatabase: () => SqliteDriver;
  getNetwork?: () => NetworkAvailability | undefined;
}

export interface SqliteLifecycleRunResult {
  skipped: boolean;
  published: boolean;
  current: SqliteDriver | null;
  init: ApplicationInitResult | null;
  diagnostic: SqliteRecoveryDiagnostic;
  diagnosticLine: string;
}

/**
 * Owns the live driver and serializes lifecycle events. Tests and the mobile
 * shell must use this orchestration, not a parallel reconstruction.
 */
export function createSqliteLifecycleController(
  deps: SqliteLifecycleControllerDeps,
) {
  let current: SqliteDriver | null = null;
  const gate = createLifecycleInitGate();
  let pending: MobileLifecycleEvent | null = null;
  let postProbeArmed = false;
  let lastDiagnostic = emptyRecoveryDiagnostic();

  const consumePostProbeFault = (): boolean => {
    if (!postProbeArmed) return false;
    postProbeArmed = false;
    return true;
  };

  const runOne = (
    event: MobileLifecycleEvent,
    ticket: number,
  ): SqliteLifecycleRunResult => {
    const pass = runLifecycleRecoveryPass({
      event,
      current,
      openSameDatabase: deps.openSameDatabase,
      openFreshSameDatabase: deps.openFreshSameDatabase,
      nativeReopenUsed: false,
      network: deps.getNetwork?.(),
      consumePostProbeFault,
    });
    current = pass.current;
    const published = gate.shouldPublish(ticket);
    pass.diagnostic.recoveredDriverPublished = published && pass.init.ok;
    if (published && pass.init.ok) {
      pass.diagnostic.stages.push("published");
    }
    if (!published && !pass.init.ok) {
      const closed = closeSqliteDriver(current);
      pass.diagnostic.closeOutcome = closed.status;
      current = null;
    }
    lastDiagnostic = pass.diagnostic;
    return {
      skipped: false,
      published,
      current: published && pass.init.ok ? current : published ? null : current,
      init: pass.init,
      diagnostic: pass.diagnostic,
      diagnosticLine: formatRecoveryDiagnostic(pass.diagnostic),
    };
  };

  return {
    armPostProbeFaultOnce(): void {
      postProbeArmed = true;
    },
    disarmPostProbeFault(): void {
      postProbeArmed = false;
    },
    isPostProbeFaultArmed(): boolean {
      return postProbeArmed;
    },
    getDriver(): SqliteDriver | null {
      return current;
    },
    lastDiagnostic(): SqliteRecoveryDiagnostic {
      return lastDiagnostic;
    },
    lastDiagnosticLine(): string {
      return formatRecoveryDiagnostic(lastDiagnostic);
    },
    run(event: MobileLifecycleEvent): SqliteLifecycleRunResult {
      const claimed = gate.claim();
      if (!claimed.beginNow) {
        pending = event;
        return {
          skipped: true,
          published: false,
          current,
          init: null,
          diagnostic: lastDiagnostic,
          diagnosticLine: formatRecoveryDiagnostic(lastDiagnostic),
        };
      }
      let ticket = claimed.id;
      let currentEvent = event;
      let last: SqliteLifecycleRunResult | null = null;
      try {
        for (;;) {
          last = runOne(currentEvent, ticket);
          const queued = pending;
          pending = null;
          gate.release();
          if (!queued) break;
          const next = gate.claim();
          if (!next.beginNow) {
            pending = queued;
            break;
          }
          ticket = next.id;
          currentEvent = queued;
        }
        return last as SqliteLifecycleRunResult;
      } catch (err) {
        gate.release();
        current = null;
        const failure = databaseOpenFailedFrom(err, "open");
        lastDiagnostic = emptyRecoveryDiagnostic();
        lastDiagnostic.initializationOutcome = "failed";
        lastDiagnostic.stages.push("throw");
        return {
          skipped: false,
          published: gate.shouldPublish(ticket),
          current: null,
          init: failure,
          diagnostic: lastDiagnostic,
          diagnosticLine: formatRecoveryDiagnostic(lastDiagnostic),
        };
      }
    },
  };
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
