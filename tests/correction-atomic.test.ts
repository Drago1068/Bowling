import test from "node:test";
import assert from "node:assert/strict";
import {
  DuplicateCorrectionError,
  StaleEntityVersionError,
  TargetEntityNotFoundError,
  applyCorrection,
  applyLocalMutation,
  createCorrection,
  createCorrectionStore,
  createEntityStore,
  createOutboxStore,
  openDatabase,
  type Roll,
} from "../src/index.ts";
import { TEST_DEVICE_ID, makeRoll } from "./helpers.ts";

function seed(db: ReturnType<typeof openDatabase>) {
  const roll = makeRoll();
  applyLocalMutation(db, {
    deviceId: TEST_DEVICE_ID,
    operation: "CREATE",
    entity: roll,
    expectedEntityVersion: 0,
  });
  return roll;
}

function correctionFor(roll: Roll) {
  return createCorrection({
    target_entity_type: "Roll",
    target_entity_id: roll.id,
    prior_entity_version: 1,
    corrected_representation: { pinfall: 7 },
    change: { pinfall: { from: 10, to: 7 } },
    reason: "recount",
    actor: "bowler-001",
    origin_device_id: TEST_DEVICE_ID,
  });
}

test("correction audit + canonical update succeed together", () => {
  const db = openDatabase();
  const roll = seed(db);
  const correction = correctionFor(roll);
  applyCorrection(db, { correction, deviceId: TEST_DEVICE_ID });

  assert.ok(createCorrectionStore(db).get(correction.id));
  const updated = createEntityStore(db).get("Roll", roll.id) as Roll;
  assert.equal(updated.pinfall, 7);
});

test("correction increments target version exactly once", () => {
  const db = openDatabase();
  const roll = seed(db);
  const correction = correctionFor(roll);
  const result = applyCorrection(db, { correction, deviceId: TEST_DEVICE_ID });
  assert.equal(result.entity.entity_version, 2);
  assert.equal(
    (createEntityStore(db).get("Roll", roll.id) as Roll).entity_version,
    2,
  );
});

test("corrected canonical entity contains the corrected value and quality", () => {
  const db = openDatabase();
  const roll = seed(db);
  applyCorrection(db, { correction: correctionFor(roll), deviceId: TEST_DEVICE_ID });
  const updated = createEntityStore(db).get("Roll", roll.id) as Roll;
  assert.equal(updated.pinfall, 7);
  assert.equal(updated.data_quality, "CORRECTED");
});

test("prior state remains reconstructable via the correction audit", () => {
  const db = openDatabase();
  const roll = seed(db);
  const correction = correctionFor(roll);
  applyCorrection(db, { correction, deviceId: TEST_DEVICE_ID });

  const recorded = createCorrectionStore(db).get(correction.id)!;
  assert.equal(recorded.prior_entity_version, 1);
  assert.deepEqual(recorded.change, { pinfall: { from: 10, to: 7 } });
  assert.deepEqual(recorded.corrected_representation, { pinfall: 7 });
  // Original value (10) is reconstructable from the change delta.
  const change = recorded.change as { pinfall: { from: number; to: number } };
  assert.equal(change.pinfall.from, 10);
});

test("outbox contains a CORRECT mutation", () => {
  const db = openDatabase();
  const roll = seed(db);
  const result = applyCorrection(db, {
    correction: correctionFor(roll),
    deviceId: TEST_DEVICE_ID,
  });
  const entry = createOutboxStore(db).get(result.envelope.submission_id)!;
  assert.equal(entry.envelope.operation_type, "CORRECT");
  assert.equal(entry.envelope.entity_id, roll.id);
  assert.equal(entry.envelope.expected_entity_version, 1);
});

test("correction + entity + outbox roll back together on failure", () => {
  const db = openDatabase();
  const roll = seed(db);
  // Occupy the outbox with an existing submission id so the CORRECT enqueue
  // fails after the correction record and entity write already happened.
  const collisionId = "reused-submission-id";
  const existingCorrection = correctionFor(roll);
  applyCorrection(db, {
    correction: existingCorrection,
    deviceId: TEST_DEVICE_ID,
    submissionId: collisionId,
  });

  const roll2 = seed(db);
  const before = (createEntityStore(db).get("Roll", roll2.id) as Roll).entity_version;
  assert.throws(() =>
    applyCorrection(db, {
      correction: correctionFor(roll2),
      deviceId: TEST_DEVICE_ID,
      submissionId: collisionId,
    }),
  );

  // No partial state: entity unchanged, and no new correction recorded.
  assert.equal((createEntityStore(db).get("Roll", roll2.id) as Roll).entity_version, before);
  assert.equal(createCorrectionStore(db).listForTarget("Roll", roll2.id).length, 0);
});

test("stale prior_entity_version is rejected", () => {
  const db = openDatabase();
  const roll = seed(db);
  const stale = createCorrection({
    target_entity_type: "Roll",
    target_entity_id: roll.id,
    prior_entity_version: 0,
    corrected_representation: { pinfall: 7 },
    change: null,
    reason: "bad version",
    actor: "bowler",
    origin_device_id: TEST_DEVICE_ID,
  });
  assert.throws(
    () => applyCorrection(db, { correction: stale, deviceId: TEST_DEVICE_ID }),
    StaleEntityVersionError,
  );
  assert.equal((createEntityStore(db).get("Roll", roll.id) as Roll).entity_version, 1);
});

test("nonexistent target is rejected", () => {
  const db = openDatabase();
  const correction = correctionFor(makeRoll());
  assert.throws(
    () => applyCorrection(db, { correction, deviceId: TEST_DEVICE_ID }),
    TargetEntityNotFoundError,
  );
});

test("repeated correction IDs cannot silently overwrite a prior correction", () => {
  const db = openDatabase();
  const roll = seed(db);
  const correction = correctionFor(roll);
  applyCorrection(db, { correction, deviceId: TEST_DEVICE_ID });

  assert.throws(
    () => applyCorrection(db, { correction, deviceId: TEST_DEVICE_ID }),
    DuplicateCorrectionError,
  );

  const listed = createCorrectionStore(db).listForTarget("Roll", roll.id);
  assert.equal(listed.length, 1);
  assert.equal((createEntityStore(db).get("Roll", roll.id) as Roll).entity_version, 2);
});