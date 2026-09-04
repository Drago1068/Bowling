import test from "node:test";
import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  applyLocalMutation,
  createEntityStore,
  createOutboxStore,
  openDatabase,
  uuidv7,
} from "../src/index.ts";
import { TEST_DEVICE_ID, makeRoll } from "./helpers.ts";

test("canonical mutation and outbox entry persist together", () => {
  const db = openDatabase();
  const roll = makeRoll();
  const result = applyLocalMutation(db, {
    deviceId: TEST_DEVICE_ID,
    operation: "CREATE",
    entity: roll,
    expectedEntityVersion: 0,
  });

  const stored = createEntityStore(db).get("Roll", roll.id);
  assert.ok(stored);
  assert.equal(stored.entity_version, 1);

  const entry = createOutboxStore(db).get(result.envelope.submission_id);
  assert.ok(entry);
  assert.equal(entry.envelope.entity_id, roll.id);
  assert.equal(entry.envelope.operation_type, "CREATE");
  assert.equal(entry.state, "QUEUED");
});

test("simulated transaction failure leaves no partial mutation", () => {
  const db = openDatabase();
  const submissionId = uuidv7();

  const roll1 = makeRoll();
  applyLocalMutation(db, {
    deviceId: TEST_DEVICE_ID,
    operation: "CREATE",
    entity: roll1,
    expectedEntityVersion: 0,
    submissionId,
  });
  assert.ok(createEntityStore(db).get("Roll", roll1.id));

  // A second mutation reusing the same submission id violates the UNIQUE
  // constraint on sync_outbox.submission_id, forcing a rollback AFTER the
  // canonical entity write already happened inside the transaction.
  const roll2 = makeRoll();
  assert.throws(
    () =>
      applyLocalMutation(db, {
        deviceId: TEST_DEVICE_ID,
        operation: "CREATE",
        entity: roll2,
        expectedEntityVersion: 0,
        submissionId,
      }),
  );

  // The second entity must NOT be durably reachable (rolled back)...
  assert.equal(createEntityStore(db).get("Roll", roll2.id), null);
  // ...and the first must remain intact, with exactly one pending outbox entry.
  assert.ok(createEntityStore(db).get("Roll", roll1.id));
  const pending = createOutboxStore(db).pending();
  assert.equal(pending.length, 1);
  assert.equal(pending[0]!.envelope.entity_id, roll1.id);
});

test("pending outbox entry survives repository reopen/restart", () => {
  const path = join(tmpdir(), `bowling-outbox-${uuidv7()}.db`);
  try {
    let db = openDatabase(path);
    const roll = makeRoll();
    applyLocalMutation(db, {
      deviceId: TEST_DEVICE_ID,
      operation: "CREATE",
      entity: roll,
      expectedEntityVersion: 0,
    });
    db.close();

    db = openDatabase(path);
    const pending = createOutboxStore(db).pending();
    assert.equal(pending.length, 1);
    assert.equal(pending[0]!.envelope.entity_id, roll.id);
    assert.equal(pending[0]!.state, "QUEUED");
    db.close();
  } finally {
    rmSync(path, { force: true });
  }
});

test("outbox state transitions update the durable entry", () => {
  const db = openDatabase();
  const roll = makeRoll();
  const result = applyLocalMutation(db, {
    deviceId: TEST_DEVICE_ID,
    operation: "CREATE",
    entity: roll,
    expectedEntityVersion: 0,
  });
  const outbox = createOutboxStore(db);
  const sid = result.envelope.submission_id;

  outbox.setState(sid, "SUBMITTED");
  assert.equal(outbox.get(sid)?.state, "SUBMITTED");

  outbox.recordError(sid, "timeout");
  const after = outbox.get(sid)!;
  assert.equal(after.state, "RETRYABLE_ERROR");
  assert.equal(after.retry_count, 1);
  assert.equal(after.last_error, "timeout");
});