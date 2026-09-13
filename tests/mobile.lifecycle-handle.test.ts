import test from "node:test";
import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  acquireSqliteDriverForLifecycle,
  applyLocalMutation,
  canProceedAfterCloseFailure,
  closeSqliteDriver,
  closeSqliteDriverQuietly,
  createEntityStore,
  createLifecycleInitGate,
  createNodeSqliteDriver,
  createSqliteLifecycleController,
  initializeApplication,
  isRecoverableNativeSqliteFailure,
  latestGameId,
  loadScoringView,
  runLifecycleRecoveryPass,
  startGame,
  uuidv7,
  withOneShotPostProbeExecFailure,
  type SqliteDriver,
} from "../src/index.ts";
import { TEST_DEVICE_ID, makeRoll } from "./helpers.ts";
import {
  STORAGE_UNAVAILABLE_NOTICE,
  scoringActionsAllowed,
} from "../src/shellPresentation.ts";

const NATIVE_NPE =
  "Call to function 'NativeDatabase.execSync' has been rejected. → Caused by: java.lang.NullPointerException";

function tmpPath(label: string): string {
  return join(tmpdir(), `bowling-handle-${label}-${uuidv7()}.db`);
}

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function cleanup(path: string): void {
  const files = [`${path}-wal`, `${path}-shm`, path];
  const deadline = Date.now() + 4000;
  for (const file of files) {
    for (let attempt = 0; ; attempt += 1) {
      try {
        rmSync(file, { force: true });
        break;
      } catch (err) {
        const code = (err as NodeJS.ErrnoException).code;
        if (code !== "EPERM" && code !== "EBUSY") throw err;
        if (Date.now() >= deadline) throw err;
        sleepSync(Math.min(200, 25 * 2 ** attempt));
      }
    }
  }
}

function failingProbe(inner: SqliteDriver, failTimes: number): SqliteDriver {
  let remaining = failTimes;
  return {
    exec(sql: string): void {
      if (sql.trimStart().toUpperCase().startsWith("SELECT 1") && remaining > 0) {
        remaining -= 1;
        throw new Error(NATIVE_NPE);
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

test("native exec failure is classified as a recoverable handle problem", () => {
  assert.equal(isRecoverableNativeSqliteFailure(new Error(NATIVE_NPE)), true);
  assert.equal(isRecoverableNativeSqliteFailure(new Error("file locked")), false);
});

test("overlapping active claims do not publish the stale ticket", () => {
  const gate = createLifecycleInitGate();
  const first = gate.claim();
  const second = gate.claim();
  assert.equal(first.beginNow, true);
  assert.equal(second.beginNow, false);
  assert.equal(gate.shouldPublish(first.id), false);
  assert.equal(gate.shouldPublish(second.id), true);
  gate.release();
  const third = gate.claim();
  assert.equal(third.beginNow, true);
  assert.equal(gate.shouldPublish(second.id), false);
  assert.equal(gate.shouldPublish(third.id), true);
  gate.release();
});

test("foreground native probe failure reopens the same file once and keeps facts", () => {
  const path = tmpPath("reopen");
  let live: SqliteDriver | undefined;
  let recovered: SqliteDriver | undefined;
  try {
    live = createNodeSqliteDriver(path);
    const launched = initializeApplication({ openDriver: () => live! });
    if (!launched.ok) assert.fail(launched.message);
    const roll = makeRoll();
    applyLocalMutation(live, {
      deviceId: launched.device.device_id,
      operation: "CREATE",
      entity: roll,
      expectedEntityVersion: 0,
    });
    const poisoned = failingProbe(live, 1);
    const acquired = acquireSqliteDriverForLifecycle({
      event: "foreground",
      current: poisoned,
      openSameDatabase: () => createNodeSqliteDriver(path),
      nativeReopenUsed: false,
    });
    assert.equal(acquired.reopened, true);
    assert.equal(acquired.nativeReopenUsed, true);
    assert.equal(acquired.failure, undefined);
    recovered = acquired.current ?? undefined;
    assert.ok(recovered);
    const again = initializeApplication({ openDriver: () => recovered! });
    if (!again.ok) assert.fail(again.message);
    assert.ok(createEntityStore(recovered).get("Roll", roll.id));
    assert.equal(again.device.device_id, launched.device.device_id);
  } finally {
    closeSqliteDriverQuietly(recovered);
    closeSqliteDriverQuietly(live);
    cleanup(path);
  }
});

test("a second native failure on the same event stays explicit and does not loop", () => {
  const path = tmpPath("persist-fail");
  let live: SqliteDriver | undefined;
  try {
    live = createNodeSqliteDriver(path);
    initializeApplication({ openDriver: () => live! });
    const poisoned = failingProbe(live, 99);
    const first = acquireSqliteDriverForLifecycle({
      event: "foreground",
      current: poisoned,
      openSameDatabase: () => failingProbe(createNodeSqliteDriver(path), 99),
      nativeReopenUsed: false,
    });
    assert.equal(first.nativeReopenUsed, true);
    assert.ok(first.failure);
    assert.equal(first.failure.status, "DATABASE_OPEN_FAILED");
    assert.equal(first.current, null);

    const second = acquireSqliteDriverForLifecycle({
      event: "foreground",
      current: failingProbe(createNodeSqliteDriver(path), 99),
      openSameDatabase: () => {
        throw new Error("must not open again");
      },
      nativeReopenUsed: true,
    });
    assert.ok(second.failure);
    assert.equal(second.reopened, false);
  } finally {
    closeSqliteDriverQuietly(live);
    cleanup(path);
  }
});

test("HOT resume keeps the selected game; process restart loads newest", () => {
  const path = tmpPath("selection");
  let live: SqliteDriver | undefined;
  let hot: SqliteDriver | undefined;
  let cold: SqliteDriver | undefined;
  try {
    live = createNodeSqliteDriver(path);
    initializeApplication({ openDriver: () => live! });
    const older = startGame(live, TEST_DEVICE_ID);
    const newer = startGame(live, TEST_DEVICE_ID);
    const poisoned = failingProbe(live, 1);
    const acquired = acquireSqliteDriverForLifecycle({
      event: "foreground",
      current: poisoned,
      openSameDatabase: () => createNodeSqliteDriver(path),
      nativeReopenUsed: false,
    });
    hot = acquired.current ?? undefined;
    assert.ok(hot);
    const selected = loadScoringView(hot, older);
    assert.equal(selected.gameId, older);
    assert.equal(selected.gameMissing, false);
    assert.equal(latestGameId(hot), newer);

    closeSqliteDriverQuietly(hot);
    hot = undefined;
    const restarted = acquireSqliteDriverForLifecycle({
      event: "process_restart",
      current: null,
      openSameDatabase: () => createNodeSqliteDriver(path),
      nativeReopenUsed: false,
    });
    cold = restarted.current ?? undefined;
    assert.ok(cold);
    const newest = loadScoringView(cold, null);
    assert.equal(newest.gameId, newer);
  } finally {
    closeSqliteDriverQuietly(cold);
    closeSqliteDriverQuietly(hot);
    closeSqliteDriverQuietly(live);
    cleanup(path);
  }
});

test("storage unavailable copy disables actions and is not a live-read claim", () => {
  assert.equal(scoringActionsAllowed({ storageAvailable: false }), false);
  assert.equal(scoringActionsAllowed({ storageAvailable: true }), true);
  assert.match(STORAGE_UNAVAILABLE_NOTICE, /leftover view/i);
  assert.match(STORAGE_UNAVAILABLE_NOTICE, /not a live database read/i);
});

function failingClose(
  inner: SqliteDriver,
  message: string,
): SqliteDriver {
  return {
    exec(sql: string): void {
      inner.exec(sql);
    },
    prepare(sql: string) {
      return inner.prepare(sql);
    },
    close(): void {
      throw new Error(message);
    },
  };
}

function failingNonProbeExec(inner: SqliteDriver): SqliteDriver {
  return {
    exec(sql: string): void {
      const trimmed = sql.trimStart().toUpperCase();
      if (trimmed.startsWith("SELECT 1")) {
        inner.exec(sql);
        return;
      }
      throw new Error(NATIVE_NPE);
    },
    prepare(sql: string) {
      return inner.prepare(sql);
    },
    close(): void {
      inner.close();
    },
  };
}

test("close does not report success when close throws", () => {
  const driver = failingClose(
    {
      exec(): void {},
      prepare(): never {
        throw new Error("not used");
      },
      close(): void {},
    },
    "disk i/o error",
  );
  const result = closeSqliteDriver(driver);
  assert.equal(result.status, "close_failed");
  assert.equal(canProceedAfterCloseFailure(result), false);
  const nativeClose = closeSqliteDriver(
    failingClose(
      {
        exec(): void {},
        prepare(): never {
          throw new Error("not used");
        },
        close(): void {},
      },
      NATIVE_NPE,
    ),
  );
  assert.equal(nativeClose.status, "close_failed");
  assert.equal(canProceedAfterCloseFailure(nativeClose), true);
});

test("post-probe native-like init failure recovers with one fresh connection", () => {
  const path = tmpPath("post-probe");
  let live: SqliteDriver | undefined;
  let recovered: SqliteDriver | undefined;
  let freshOpens = 0;
  try {
    live = createNodeSqliteDriver(path);
    const launched = initializeApplication({ openDriver: () => live! });
    if (!launched.ok) assert.fail(launched.message);
    const roll = makeRoll();
    applyLocalMutation(live, {
      deviceId: launched.device.device_id,
      operation: "CREATE",
      entity: roll,
      expectedEntityVersion: 0,
    });
    const pass = runLifecycleRecoveryPass({
      event: "foreground",
      current: live,
      openSameDatabase: () => {
        throw new Error("must not reopen the cached connection");
      },
      openFreshSameDatabase: () => {
        freshOpens += 1;
        recovered = createNodeSqliteDriver(path);
        return recovered;
      },
      nativeReopenUsed: false,
      consumePostProbeFault: () => true,
    });
    assert.equal(freshOpens, 1);
    assert.equal(pass.diagnostic.recoveryAttempted, true);
    assert.equal(pass.diagnostic.injectedPostProbeFault, true);
    assert.equal(pass.diagnostic.newConnectionOpened, true);
    assert.equal(pass.diagnostic.closeOutcome, "closed");
    assert.equal(pass.diagnostic.initializationOutcome, "ok");
    assert.equal(pass.init.ok, true);
    assert.ok(pass.current);
    assert.ok(createEntityStore(pass.current).get("Roll", roll.id));
    assert.match(pass.diagnostic.stages.join(","), /injected_post_probe_fault/);
    assert.match(pass.diagnostic.stages.join(","), /open_fresh/);
  } finally {
    closeSqliteDriverQuietly(recovered);
    closeSqliteDriverQuietly(live);
    cleanup(path);
  }
});

test("non-native close failure does not open a second connection", () => {
  const path = tmpPath("close-fail");
  let live: SqliteDriver | undefined;
  try {
    live = createNodeSqliteDriver(path);
    initializeApplication({ openDriver: () => live! });
    const pass = runLifecycleRecoveryPass({
      event: "foreground",
      current: failingClose(failingProbe(live, 1), "disk i/o error"),
      openSameDatabase: () => {
        throw new Error("must not open same");
      },
      openFreshSameDatabase: () => {
        throw new Error("must not open fresh after close failure");
      },
      nativeReopenUsed: false,
    });
    assert.equal(pass.init.ok, false);
    if (!pass.init.ok) {
      assert.equal(pass.init.status, "DATABASE_OPEN_FAILED");
    }
    assert.equal(pass.current, null);
    assert.equal(pass.diagnostic.closeOutcome, "close_failed");
    assert.equal(pass.diagnostic.newConnectionOpened, false);
    assert.equal(pass.diagnostic.recoveryAttempted, true);
  } finally {
    closeSqliteDriverQuietly(live);
    cleanup(path);
  }
});

test("reopen failure after a successful probe-path recovery remains explicit", () => {
  const path = tmpPath("reopen-fail");
  let live: SqliteDriver | undefined;
  try {
    live = createNodeSqliteDriver(path);
    initializeApplication({ openDriver: () => live! });
    const pass = runLifecycleRecoveryPass({
      event: "foreground",
      current: withOneShotPostProbeExecFailure(live),
      openSameDatabase: () => {
        throw new Error("must not use cached open");
      },
      openFreshSameDatabase: () => {
        throw new Error("NativeDatabase.execSync rejected");
      },
      nativeReopenUsed: false,
      consumePostProbeFault: () => false,
    });
    assert.equal(pass.diagnostic.newConnectionOpened, true);
    assert.equal(pass.init.ok, false);
    if (!pass.init.ok) {
      assert.equal(pass.init.status, "DATABASE_OPEN_FAILED");
      assert.match(pass.init.message, /rejected|NullPointerException/i);
    }
    assert.equal(pass.current, null);
  } finally {
    closeSqliteDriverQuietly(live);
    cleanup(path);
  }
});

test("init failure on the recovered connection stays explicit and does not loop", () => {
  const path = tmpPath("init-after-fresh");
  let live: SqliteDriver | undefined;
  let leftover: SqliteDriver | undefined;
  try {
    live = createNodeSqliteDriver(path);
    initializeApplication({ openDriver: () => live! });
    let freshOpens = 0;
    const pass = runLifecycleRecoveryPass({
      event: "foreground",
      current: live,
      openSameDatabase: () => {
        throw new Error("must not use cached open");
      },
      openFreshSameDatabase: () => {
        freshOpens += 1;
        leftover = failingNonProbeExec(createNodeSqliteDriver(path));
        return leftover;
      },
      nativeReopenUsed: false,
      consumePostProbeFault: () => true,
    });
    assert.equal(freshOpens, 1);
    assert.equal(pass.nativeReopenUsed, true);
    assert.equal(pass.init.ok, false);
    if (!pass.init.ok) {
      assert.equal(pass.init.status, "DATABASE_OPEN_FAILED");
    }
    assert.equal(pass.current, null);
  } finally {
    closeSqliteDriverQuietly(leftover);
    closeSqliteDriverQuietly(live);
    cleanup(path);
  }
});

test("controller overlapping events cannot publish or reuse an obsolete driver", () => {
  const path = tmpPath("overlap");
  let controller: ReturnType<typeof createSqliteLifecycleController> | undefined;
  try {
    controller = createSqliteLifecycleController({
      openSameDatabase: () => createNodeSqliteDriver(path),
      openFreshSameDatabase: () => {
        const skipped = controller!.run("lock_resume");
        assert.equal(skipped.skipped, true);
        assert.equal(skipped.published, false);
        return createNodeSqliteDriver(path);
      },
    });
    const launched = controller.run("launch");
    assert.equal(launched.init?.ok, true);
    const stale = controller.getDriver();
    assert.ok(stale);
    stale.close();
    const recovered = controller.run("foreground");
    assert.equal(recovered.skipped, false);
    assert.equal(recovered.published, true);
    assert.equal(recovered.init?.ok, true);
    assert.notEqual(controller.getDriver(), stale);
    assert.equal(recovered.diagnostic.recoveredDriverPublished, true);
  } finally {
    closeSqliteDriverQuietly(controller?.getDriver());
    cleanup(path);
  }
});

test("launch does not consume the one-shot post-probe diagnostic", () => {
  const path = tmpPath("launch-arm");
  let controller: ReturnType<typeof createSqliteLifecycleController> | undefined;
  try {
    controller = createSqliteLifecycleController({
      openSameDatabase: () => createNodeSqliteDriver(path),
      openFreshSameDatabase: () => createNodeSqliteDriver(path),
    });
    controller.armPostProbeFaultOnce();
    const launched = controller.run("launch");
    assert.equal(launched.init?.ok, true);
    assert.equal(controller.isPostProbeFaultArmed(), true);
    controller.disarmPostProbeFault();
    assert.equal(controller.isPostProbeFaultArmed(), false);
  } finally {
    closeSqliteDriverQuietly(controller?.getDriver());
    cleanup(path);
  }
});

test("prepare-stage throw is labeled without recreating the database", () => {
  const driver: SqliteDriver = {
    exec(sql: string): void {
      if (sql.includes("foreign_keys") || sql.includes("journal_mode")) {
        throw new Error(NATIVE_NPE);
      }
    },
    prepare(): never {
      throw new Error("not used");
    },
    close(): void {},
  };
  const result = initializeApplication({ openDriver: () => driver });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.failureStage, "prepare");
    assert.match(result.message, /^\[prepare\]/);
    assert.equal(result.retainedExistingDatabase, true);
  }
});
