import test from "node:test";
import assert from "node:assert/strict";
import {
  applyCorrection,
  applyLocalMutation,
  createCorrection,
  createEntityStore,
  newBowlingBallId,
  newRollId,
  openDatabase,
  type Roll,
} from "../src/index.ts";
import { TEST_DEVICE_ID, makeRoll } from "./helpers.ts";

test("UPDATE cannot change immutable entity id/type/origin/created_at", () => {
  const db = openDatabase();
  const roll = makeRoll();
  applyLocalMutation(db, {
    deviceId: TEST_DEVICE_ID,
    operation: "CREATE",
    entity: roll,
    expectedEntityVersion: 0,
  });

  const original = createEntityStore(db).get("Roll", roll.id) as Roll;

  // Attempt an UPDATE whose payload tampered with immutable identity fields.
  // id and entity_type are the primary key / discriminator used for lookup and
  // can never be changed; origin_device_id and created_at must be preserved.
  const tampered = {
    ...original,
    origin_device_id: "evil-device",
    created_at: "2000-01-01T00:00:00.000Z",
    pinfall: 5,
  } as Roll;

  const result = applyLocalMutation(db, {
    deviceId: "attacker-device",
    operation: "UPDATE",
    entity: tampered,
    expectedEntityVersion: 1,
  });

  const updated = createEntityStore(db).get("Roll", roll.id) as Roll;
  assert.equal(updated.id, original.id);
  assert.equal(updated.entity_type, "Roll");
  assert.equal(updated.origin_device_id, original.origin_device_id);
  assert.equal(updated.created_at, original.created_at);
  assert.equal(updated.pinfall, 5);
  assert.equal(result.entity.id, original.id);
});

test("UPDATE keyed by a different entity id is treated as not-found (id immutable)", () => {
  const db = openDatabase();
  const roll = makeRoll();
  applyLocalMutation(db, {
    deviceId: TEST_DEVICE_ID,
    operation: "CREATE",
    entity: roll,
    expectedEntityVersion: 0,
  });

  const ghost = { ...roll, id: newRollId() } as Roll;
  assert.throws(() =>
    applyLocalMutation(db, {
      deviceId: TEST_DEVICE_ID,
      operation: "UPDATE",
      entity: ghost,
      expectedEntityVersion: 1,
    }),
  );
  // Original remains untouched.
  assert.equal(
    (createEntityStore(db).get("Roll", roll.id) as Roll).entity_version,
    1,
  );
});

test("correction cannot change immutable entity id/type/origin/created_at", () => {
  const db = openDatabase();
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
    // Tampered: attempt to rewrite id/type/origin/created_at via correction.
    corrected_representation: {
      id: newBowlingBallId(),
      entity_type: "Game",
      origin_device_id: "evil-device",
      created_at: "1999-01-01T00:00:00.000Z",
      pinfall: 4,
    },
    change: null,
    reason: "tamper attempt",
    actor: "attacker",
    origin_device_id: "attacker-device",
  });

  const result = applyCorrection(db, { correction, deviceId: "attacker-device" });
  const updated = createEntityStore(db).get("Roll", roll.id) as Roll;

  assert.equal(updated.id, roll.id);
  assert.equal(updated.entity_type, "Roll");
  assert.equal(updated.origin_device_id, TEST_DEVICE_ID);
  assert.equal(updated.created_at, roll.created_at);
  assert.equal(updated.pinfall, 4);
  assert.equal(result.entity.id, roll.id);
});