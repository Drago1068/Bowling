import test from "node:test";
import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  CURRENT_SCHEMA_VERSION,
  MIGRATIONS,
  applyLocalMutation,
  applyMigrations,
  createDeviceStore,
  createEntityStore,
  createNodeSqliteDriver,
  initializeApplication,
  injectedFailure,
  uuidv7,
  type Migration,
} from "../src/index.ts";
import { TEST_DEVICE_ID, makeRoll } from "./helpers.ts";
import { openRawMobileAdapterDatabase } from "./support/nodeExpoBinding.ts";

function tmpPath(label: string): string {
  return join(tmpdir(), `bowling-init-${label}-${uuidv7()}.db`);
}

/**
 * Windows-safe bounded cleanup: remove -wal/-shm/db in order, retrying transient
 * lock errors (EPERM/EBUSY) with exponential backoff, then throw on deadline.
 * Mirrors the established pattern in tests/mobile.lifecycle.test.ts.
 */
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
        sleepSync(Math.min(200, 25 * Math.pow(2, attempt)));
      }
    }
  }
}

test("empty database: schema initialized successfully", () => {
  const driver = createNodeSqliteDriver(":memory:");
  const result = initializeApplication({ openDriver: () => driver });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.schemaVersion, CURRENT_SCHEMA_VERSION);
    assert.equal(result.status, "NO_ACTIVE_SESSION");
    assert.ok(result.device.device_id);
  }
});

test("existing baseline database: no destructive recreation", () => {
  const path = tmpPath("existing");
  try {
    const first = createNodeSqliteDriver(path);
    const created = initializeApplication({ openDriver: () => first });
    if (!created.ok) assert.fail(created.message);
    const deviceId = created.device.device_id;
    const roll = makeRoll();
    applyLocalMutation(first, {
      deviceId: TEST_DEVICE_ID,
      operation: "CREATE",
      entity: roll,
      expectedEntityVersion: 0,
    });
    first.close();

    const second = createNodeSqliteDriver(path);
    const reopened = initializeApplication({ openDriver: () => second });
    if (!reopened.ok) assert.fail(reopened.message);
    assert.equal(reopened.device.device_id, deviceId);
    assert.ok(createEntityStore(second).get("Roll", roll.id));
    second.close();
  } finally {
    cleanup(path);
  }
});

test("reopen: same schema version and persisted data", () => {
  const path = tmpPath("reopen");
  try {
    const first = createNodeSqliteDriver(path);
    initializeApplication({ openDriver: () => first });
    const version = first.prepare("SELECT MAX(version) AS v FROM schema_migrations").get();
    const roll = makeRoll();
    applyLocalMutation(first, {
      deviceId: TEST_DEVICE_ID,
      operation: "CREATE",
      entity: roll,
      expectedEntityVersion: 0,
    });
    first.close();

    const second = createNodeSqliteDriver(path);
    const result = initializeApplication({ openDriver: () => second });
    assert.equal(result.ok, true);
    const version2 = second.prepare("SELECT MAX(version) AS v FROM schema_migrations").get();
    assert.equal(Number(version?.v), Number(version2?.v));
    assert.ok(createEntityStore(second).get("Roll", roll.id));
    second.close();
  } finally {
    cleanup(path);
  }
});

test("migration failure is reported and existing database is retained", () => {
  const path = tmpPath("fail");
  try {
    const first = createNodeSqliteDriver(path);
    initializeApplication({ openDriver: () => first });
    const roll = makeRoll();
    applyLocalMutation(first, {
      deviceId: TEST_DEVICE_ID,
      operation: "CREATE",
      entity: roll,
      expectedEntityVersion: 0,
    });
    const deviceId = createDeviceStore(first).getOrCreate().device_id;
    first.close();

    const failing: Migration[] = [
      ...MIGRATIONS,
      { version: 99, name: "boom", sql: "THIS IS NOT SQL;" },
    ];
    const second = createNodeSqliteDriver(path);
    const result = initializeApplication({
      openDriver: () => second,
      migrateOptions: { migrations: failing },
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.status, "DATABASE_MIGRATION_FAILED");
      assert.equal(result.retainedExistingDatabase, true);
    }
    assert.ok(createEntityStore(second).get("Roll", roll.id));
    assert.equal(createDeviceStore(second).get()?.device_id, deviceId);
    assert.equal(
      Number(second.prepare("SELECT MAX(version) AS v FROM schema_migrations").get()?.v),
      CURRENT_SCHEMA_VERSION,
    );
    second.close();
  } finally {
    cleanup(path);
  }
});

test("migration retry is safe and deterministic after a transient failure", () => {
  const driver = createNodeSqliteDriver(":memory:");
  let attempts = 0;
  const first = applyMigrations(driver, {
    beforeMigration: () => {
      attempts += 1;
      if (attempts === 1) throw injectedFailure("migration-attempt-1");
    },
  });
  assert.equal(first.ok, false);
  assert.equal(attempts, 1);

  const retry = applyMigrations(driver);
  assert.equal(retry.ok, true);
  if (retry.ok) {
    assert.equal(retry.schemaVersion, CURRENT_SCHEMA_VERSION);
  }
  assert.equal(
    Number(driver.prepare("SELECT MAX(version) AS v FROM schema_migrations").get()?.v),
    CURRENT_SCHEMA_VERSION,
  );
});

test("unsupported schema is reported without wiping the database", () => {
  const driver = createNodeSqliteDriver(":memory:");
  initializeApplication({ openDriver: () => driver });
  driver.exec(
    "INSERT INTO schema_migrations (version, applied_at) VALUES (9999, '2099-01-01T00:00:00.000Z')",
  );
  const result = initializeApplication({ openDriver: () => driver });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, "UNSUPPORTED_SCHEMA");
    assert.equal(result.retainedExistingDatabase, true);
  }
});

test("database open failure is explicit and does not recreate", () => {
  const result = initializeApplication({
    openDriver: () => {
      throw new Error("file locked");
    },
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.status, "DATABASE_OPEN_FAILED");
    assert.equal(result.retainedExistingDatabase, true);
  }
});

test("mobile adapter empty database initializes schema", () => {
  const driver = openRawMobileAdapterDatabase(":memory:");
  const result = initializeApplication({ openDriver: () => driver });
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.schemaVersion, CURRENT_SCHEMA_VERSION);
  }
});
