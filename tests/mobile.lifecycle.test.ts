import test from "node:test";
import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  applyCorrection,
  applyLocalMutation,
  createCorrection,
  createCorrectionStore,
  createDeviceStore,
  createEntityStore,
  createNodeSqliteDriver,
  createOutboxStore,
  DuplicateCorrectionError,
  initializeApplication,
  recoverAfterLifecycle,
  StaleEntityVersionError,
  TargetEntityNotFoundError,
  uuidv7,
  type Roll,
  type SqliteDriver,
} from "../src/index.ts";
import { TEST_DEVICE_ID, makeRoll } from "./helpers.ts";
import { openMobileAdapterDatabase } from "./support/nodeExpoBinding.ts";

function tmpPath(label: string): string {
  return join(tmpdir(), `bowling-life-${label}-${uuidv7()}.db`);
}

function closeDriver(driver: SqliteDriver | undefined): void {
  if (!driver) return;
  try {
    driver.close();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (/already closed|not open/i.test(message)) return;
    throw err;
  }
}

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

const SQLITE_CLEANUP_WINDOW_MS = 4000;
const SQLITE_CLEANUP_INITIAL_DELAY_MS = 25;
const SQLITE_CLEANUP_MAX_DELAY_MS = 250;

function isRetryableCleanupError(err: unknown): boolean {
  const code = (err as NodeJS.ErrnoException).code;
  return code === "EPERM" || code === "EBUSY";
}

function cleanup(path: string): void {
  const remaining = [`${path}-wal`, `${path}-shm`, path];
  const deadline = Date.now() + SQLITE_CLEANUP_WINDOW_MS;
  let delayMs = SQLITE_CLEANUP_INITIAL_DELAY_MS;
  let lastError: unknown;

  while (remaining.length > 0) {
    const locked: string[] = [];
    for (const target of remaining) {
      try {
        rmSync(target, { force: true });
      } catch (err) {
        if (!isRetryableCleanupError(err)) throw err;
        lastError = err;
        locked.push(target);
      }
    }
    if (locked.length === 0) return;

    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) throw lastError;
    sleepSync(Math.min(delayMs, remainingMs));
    delayMs = Math.min(delayMs * 2, SQLITE_CLEANUP_MAX_DELAY_MS);
    remaining.length = 0;
    remaining.push(...locked);
  }
}

test("device id is created on first launch and reused afterwards", () => {
  const path = tmpPath("device");
  let first: SqliteDriver | undefined;
  let second: SqliteDriver | undefined;
  try {
    first = createNodeSqliteDriver(path);
    const launch = initializeApplication({ openDriver: () => first! });
    if (!launch.ok) assert.fail(launch.message);
    const id = launch.device.device_id;
    assert.match(id, /^[0-9a-f-]{36}$/);
    first.close();

    second = createNodeSqliteDriver(path);
    const relaunch = recoverAfterLifecycle("process_restart", {
      openDriver: () => second!,
    });
    if (!relaunch.ok) assert.fail(relaunch.message);
    assert.equal(relaunch.device.device_id, id);
  } finally {
    closeDriver(second);
    closeDriver(first);
    cleanup(path);
  }
});

test("background/foreground recovery rereads persistence, not memory", () => {
  const path = tmpPath("bg");
  let live: SqliteDriver | undefined;
  try {
    live = createNodeSqliteDriver(path);
    initializeApplication({ openDriver: () => live! });
    const deviceId = createDeviceStore(live).getOrCreate().device_id;
    const roll = makeRoll();
    applyLocalMutation(live, {
      deviceId,
      operation: "CREATE",
      entity: roll,
      expectedEntityVersion: 0,
    });

    const background = recoverAfterLifecycle("background", {
      openDriver: () => createNodeSqliteDriver(path),
      openDriverIfAlive: () => live!,
    });
    if (!background.ok) assert.fail(background.message);
    assert.equal(background.device.device_id, deviceId);
    assert.equal(background.localChangesPending, true);

    const foreground = recoverAfterLifecycle("foreground", {
      openDriver: () => createNodeSqliteDriver(path),
      openDriverIfAlive: () => live!,
    });
    if (!foreground.ok) assert.fail(foreground.message);
    assert.equal(foreground.device.device_id, deviceId);
    assert.ok(createEntityStore(live).get("Roll", roll.id));
  } finally {
    closeDriver(live);
    cleanup(path);
  }
});

test("forced termination recovery restores entity, outbox, checkpoint, device", () => {
  const path = tmpPath("kill");
  let first: SqliteDriver | undefined;
  let recoveredDriver: SqliteDriver | undefined;
  try {
    first = createNodeSqliteDriver(path);
    const launched = initializeApplication({ openDriver: () => first! });
    if (!launched.ok) assert.fail(launched.message);
    const roll = makeRoll();
    const mutation = applyLocalMutation(first, {
      deviceId: launched.device.device_id,
      operation: "CREATE",
      entity: roll,
      expectedEntityVersion: 0,
    });
    first.close();

    recoveredDriver = createNodeSqliteDriver(path);
    const recovered = recoverAfterLifecycle("forced_termination", {
      openDriver: () => recoveredDriver!,
    });
    if (!recovered.ok) assert.fail(recovered.message);
    assert.equal(recovered.device.device_id, launched.device.device_id);
    assert.equal(recovered.localChangesPending, true);
    assert.equal(
      recovered.pendingOutbox[0]?.envelope.submission_id,
      mutation.envelope.submission_id,
    );
  } finally {
    closeDriver(recoveredDriver);
    closeDriver(first);
    cleanup(path);
  }
});

test("lock/resume recovery keeps the same device id", () => {
  const driver = createNodeSqliteDriver(":memory:");
  const launch = initializeApplication({ openDriver: () => driver });
  if (!launch.ok) assert.fail(launch.message);
  const resume = recoverAfterLifecycle("lock_resume", {
    openDriver: () => driver,
    openDriverIfAlive: () => driver,
  });
  if (!resume.ok) assert.fail(resume.message);
  assert.equal(resume.device.device_id, launch.device.device_id);
});

test("mobile adapter correction success path", () => {
  const db = openMobileAdapterDatabase(":memory:");
  const roll = makeRoll();
  applyLocalMutation(db, {
    deviceId: TEST_DEVICE_ID,
    operation: "CREATE",
    entity: roll,
    expectedEntityVersion: 0,
  });
  const correction = createCorrection({
    target_entity_type: "Roll",
    target_entity_id: roll.id,
    prior_entity_version: 1,
    corrected_representation: { pinfall: 7 },
    reason: "recount",
    actor: "mobile",
    origin_device_id: TEST_DEVICE_ID,
  });
  const result = applyCorrection(db, { correction, deviceId: TEST_DEVICE_ID });
  const updated = createEntityStore(db).get("Roll", roll.id) as Roll;
  assert.equal(updated.pinfall, 7);
  assert.equal(updated.entity_version, 2);
  assert.equal(updated.data_quality, "CORRECTED");
  assert.ok(createCorrectionStore(db).get(correction.id));
  assert.equal(
    createOutboxStore(db).get(result.envelope.submission_id)?.envelope.operation_type,
    "CORRECT",
  );
  db.close();
});

test("mobile adapter rejects stale, missing, and duplicate corrections", () => {
  const db = openMobileAdapterDatabase(":memory:");
  const roll = makeRoll();
  applyLocalMutation(db, {
    deviceId: TEST_DEVICE_ID,
    operation: "CREATE",
    entity: roll,
    expectedEntityVersion: 0,
  });
  const good = createCorrection({
    target_entity_type: "Roll",
    target_entity_id: roll.id,
    prior_entity_version: 1,
    corrected_representation: { pinfall: 6 },
    reason: "ok",
    actor: "mobile",
    origin_device_id: TEST_DEVICE_ID,
  });
  applyCorrection(db, { correction: good, deviceId: TEST_DEVICE_ID });

  const stale = createCorrection({
    target_entity_type: "Roll",
    target_entity_id: roll.id,
    prior_entity_version: 1,
    corrected_representation: { pinfall: 5 },
    reason: "stale",
    actor: "mobile",
    origin_device_id: TEST_DEVICE_ID,
  });
  assert.throws(
    () => applyCorrection(db, { correction: stale, deviceId: TEST_DEVICE_ID }),
    StaleEntityVersionError,
  );
  assert.throws(
    () => applyCorrection(db, { correction: good, deviceId: TEST_DEVICE_ID }),
    DuplicateCorrectionError,
  );
  const missing = createCorrection({
    target_entity_type: "Roll",
    target_entity_id: uuidv7(),
    prior_entity_version: 1,
    corrected_representation: { pinfall: 1 },
    reason: "missing",
    actor: "mobile",
    origin_device_id: TEST_DEVICE_ID,
  });
  assert.throws(
    () => applyCorrection(db, { correction: missing, deviceId: TEST_DEVICE_ID }),
    TargetEntityNotFoundError,
  );
  db.close();
});
