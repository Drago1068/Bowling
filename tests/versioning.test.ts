import test from "node:test";
import assert from "node:assert/strict";
import {
  applyLocalMutation,
  assertVersionMatch,
  createEntityStore,
  initialVersion,
  isStale,
  nextVersion,
  openDatabase,
  StaleEntityVersionError,
} from "../src/index.ts";
import { TEST_DEVICE_ID, makeRoll } from "./helpers.ts";

test("initial entity version is 1", () => {
  assert.equal(initialVersion(), 1);
});

test("semantic update increments version exactly once", () => {
  const db = openDatabase();
  const roll = makeRoll();

  applyLocalMutation(db, {
    deviceId: TEST_DEVICE_ID,
    operation: "CREATE",
    entity: roll,
    expectedEntityVersion: 0,
  });
  const v1 = createEntityStore(db).get("Roll", roll.id);
  assert.equal(v1?.entity_version, 1);

  const r2 = applyLocalMutation(db, {
    deviceId: TEST_DEVICE_ID,
    operation: "UPDATE",
    entity: v1!,
    expectedEntityVersion: 1,
  });
  assert.equal(r2.entity.entity_version, 2);

  const r3 = applyLocalMutation(db, {
    deviceId: TEST_DEVICE_ID,
    operation: "UPDATE",
    entity: r2.entity,
    expectedEntityVersion: 2,
  });
  assert.equal(r3.entity.entity_version, 3);
});

test("stale expected version is detectable", () => {
  assert.equal(isStale(1, 2), true);
  assert.equal(isStale(2, 2), false);
  assert.throws(() => assertVersionMatch(1, 2), StaleEntityVersionError);
});

test("nextVersion increments by one", () => {
  assert.equal(nextVersion(1), 2);
  assert.equal(nextVersion(41), 42);
});

test("stale mutation is rejected end-to-end", () => {
  const db = openDatabase();
  const roll = makeRoll();
  applyLocalMutation(db, {
    deviceId: TEST_DEVICE_ID,
    operation: "CREATE",
    entity: roll,
    expectedEntityVersion: 0,
  });
  const v1 = createEntityStore(db).get("Roll", roll.id)!;
  // First update succeeds (1 -> 2).
  const r2 = applyLocalMutation(db, {
    deviceId: TEST_DEVICE_ID,
    operation: "UPDATE",
    entity: v1,
    expectedEntityVersion: 1,
  });
  // A second update based on the now-stale v1 must throw.
  assert.throws(
    () =>
      applyLocalMutation(db, {
        deviceId: TEST_DEVICE_ID,
        operation: "UPDATE",
        entity: v1,
        expectedEntityVersion: 1,
      }),
    StaleEntityVersionError,
  );
  // The entity remains at the correct version 2.
  assert.equal(createEntityStore(db).get("Roll", roll.id)?.entity_version, 2);
  void r2;
});