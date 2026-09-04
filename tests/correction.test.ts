import test from "node:test";
import assert from "node:assert/strict";
import {
  applyLocalMutation,
  createCorrection,
  createCorrectionStore,
  createEntityStore,
  openDatabase,
  type Roll,
  uuidv7,
} from "../src/index.ts";
import { TEST_DEVICE_ID, makeRoll } from "./helpers.ts";

test("correction records explicit target/version relationship", () => {
  const db = openDatabase();
  const store = createCorrectionStore(db);
  const targetId = uuidv7();

  const correction = createCorrection({
    target_entity_type: "Roll",
    target_entity_id: targetId,
    prior_entity_version: 1,
    corrected_representation: { id: targetId, pinfall: 9 },
    change: { pinfall: { from: 10, to: 9 } },
    reason: "observer miscount",
    actor: "bowler-001",
    origin_device_id: TEST_DEVICE_ID,
  });

  store.record(correction);
  const got = store.get(correction.id);
  assert.ok(got);
  assert.equal(got.target_entity_type, "Roll");
  assert.equal(got.target_entity_id, targetId);
  assert.equal(got.prior_entity_version, 1);
  assert.equal(got.reason, "observer miscount");
  assert.equal(got.actor, "bowler-001");
});

test("correction preserves the original entity (no delete/overwrite)", () => {
  const db = openDatabase();
  const entities = createEntityStore(db);
  const corrections = createCorrectionStore(db);

  const roll = makeRoll();
  applyLocalMutation(db, {
    deviceId: TEST_DEVICE_ID,
    operation: "CREATE",
    entity: roll,
    expectedEntityVersion: 0,
  });

  // Record a correction against the v1 entity without mutating it.
  corrections.record(
    createCorrection({
      target_entity_type: "Roll",
      target_entity_id: roll.id,
      prior_entity_version: 1,
      corrected_representation: { id: roll.id, pinfall: 7 },
      change: { pinfall: { from: 10, to: 7 } },
      reason: "recount",
      actor: "bowler-001",
      origin_device_id: TEST_DEVICE_ID,
    }),
  );

  // The original v1 entity is still present and unchanged.
  const original = entities.get("Roll", roll.id) as Roll | null;
  assert.ok(original);
  assert.equal(original.entity_version, 1);
  assert.equal(original.pinfall, 10);

  // The correction is traceable back to its target and prior version.
  const listed = corrections.listForTarget("Roll", roll.id);
  assert.equal(listed.length, 1);
  assert.equal(listed[0]!.prior_entity_version, 1);
  assert.equal(listed[0]!.target_entity_id, roll.id);
});

test("corrections are append-only (multiple corrections retain lineage)", () => {
  const db = openDatabase();
  const corrections = createCorrectionStore(db);
  const targetId = uuidv7();

  corrections.record(
    createCorrection({
      target_entity_type: "Roll",
      target_entity_id: targetId,
      prior_entity_version: 1,
      corrected_representation: { pinfall: 8 },
      change: null,
      reason: "first correction",
      actor: "a",
      origin_device_id: TEST_DEVICE_ID,
    }),
  );
  corrections.record(
    createCorrection({
      target_entity_type: "Roll",
      target_entity_id: targetId,
      prior_entity_version: 2,
      corrected_representation: { pinfall: 9 },
      change: null,
      reason: "second correction",
      actor: "b",
      origin_device_id: TEST_DEVICE_ID,
    }),
  );

  const listed = corrections.listForTarget("Roll", targetId);
  assert.equal(listed.length, 2);
  assert.equal(listed[0]!.prior_entity_version, 1);
  assert.equal(listed[1]!.prior_entity_version, 2);
});