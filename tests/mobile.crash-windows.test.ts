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
  createEntityStore,
  createOutboxStore,
  injectedFailure,
  openDatabase,
  uuidv7,
  type SqliteDriver,
} from "../src/index.ts";
import { openMobileAdapterDatabase } from "./support/nodeExpoBinding.ts";
import { TEST_DEVICE_ID, makeRoll } from "./helpers.ts";

function tmpPath(label: string): string {
  return join(tmpdir(), `bowling-crash-${label}-${uuidv7()}.db`);
}

function cleanup(path: string): void {
  rmSync(path, { force: true });
  rmSync(`${path}-wal`, { force: true });
  rmSync(`${path}-shm`, { force: true });
}

function assertAbsent(db: SqliteDriver, entityId: string): void {
  assert.equal(createEntityStore(db).get("Roll", entityId), null);
  assert.equal(createOutboxStore(db).pending().length, 0);
}

function runWindows(label: string, open: (filename: string) => SqliteDriver): void {
  test(`${label} crash window A: failure before BEGIN writes nothing`, () => {
    const db = open(":memory:");
    const roll = makeRoll();
    assert.throws(() =>
      applyLocalMutation(
        db,
        {
          deviceId: TEST_DEVICE_ID,
          operation: "CREATE",
          entity: roll,
          expectedEntityVersion: 0,
        },
        { beforeBegin: () => { throw injectedFailure("before_begin"); } },
      ),
    );
    assertAbsent(db, roll.id);
    db.close();
  });

  test(`${label} crash window B: failure after canonical write rolls back both`, () => {
    const db = open(":memory:");
    const roll = makeRoll();
    assert.throws(() =>
      applyLocalMutation(
        db,
        {
          deviceId: TEST_DEVICE_ID,
          operation: "CREATE",
          entity: roll,
          expectedEntityVersion: 0,
        },
        { afterCanonicalWrite: () => { throw injectedFailure("after_canonical"); } },
      ),
    );
    assertAbsent(db, roll.id);
    db.close();
  });

  test(`${label} crash window C: failure after outbox insert rolls back both`, () => {
    const db = open(":memory:");
    const roll = makeRoll();
    assert.throws(() =>
      applyLocalMutation(
        db,
        {
          deviceId: TEST_DEVICE_ID,
          operation: "CREATE",
          entity: roll,
          expectedEntityVersion: 0,
        },
        { afterOutboxInsert: () => { throw injectedFailure("after_outbox"); } },
      ),
    );
    assertAbsent(db, roll.id);
    db.close();
  });

  test(`${label} crash window D: commit then simulated termination survives reopen`, () => {
    const path = tmpPath(label);
    try {
      let db = open(path);
      const roll = makeRoll();
      let committed = false;
      const result = applyLocalMutation(
        db,
        {
          deviceId: TEST_DEVICE_ID,
          operation: "CREATE",
          entity: roll,
          expectedEntityVersion: 0,
        },
        { afterCommit: () => { committed = true; } },
      );
      assert.equal(committed, true);
      const submissionId = result.envelope.submission_id;
      db.close();

      db = open(path);
      const stored = createEntityStore(db).get("Roll", roll.id);
      assert.ok(stored);
      const entry = createOutboxStore(db).get(submissionId);
      assert.ok(entry);
      assert.equal(entry.envelope.submission_id, submissionId);
      db.close();
    } finally {
      cleanup(path);
    }
  });

  test(`${label} crash window E: correction audit failure rolls back everything`, () => {
    const db = open(":memory:");
    const roll = makeRoll();
    applyLocalMutation(db, {
      deviceId: TEST_DEVICE_ID,
      operation: "CREATE",
      entity: roll,
      expectedEntityVersion: 0,
    });
    const before = createEntityStore(db).get("Roll", roll.id)!;
    const pendingBefore = createOutboxStore(db).pending().length;
    const correction = createCorrection({
      target_entity_type: "Roll",
      target_entity_id: roll.id,
      prior_entity_version: 1,
      corrected_representation: { pinfall: 3 },
      reason: "injected",
      actor: "test",
      origin_device_id: TEST_DEVICE_ID,
    });
    assert.throws(() =>
      applyCorrection(
        db,
        { correction, deviceId: TEST_DEVICE_ID },
        { afterCorrectionRecord: () => { throw injectedFailure("after_correction"); } },
      ),
    );
    assert.equal(createCorrectionStore(db).get(correction.id), null);
    const after = createEntityStore(db).get("Roll", roll.id)!;
    assert.equal(after.entity_version, before.entity_version);
    assert.equal((after as { pinfall: number }).pinfall, (before as { pinfall: number }).pinfall);
    assert.equal(createOutboxStore(db).pending().length, pendingBefore);
    db.close();
  });
}

runWindows("node-driver", (filename) => openDatabase(filename));
runWindows("mobile-adapter", (filename) => openMobileAdapterDatabase(filename));
