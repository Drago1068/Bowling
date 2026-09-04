import test from "node:test";
import assert from "node:assert/strict";
import {
  ENTITY_TYPES,
  applyLocalMutation,
  buildEnvelope,
  createEntityStore,
  isUuidv7,
  newRollId,
  newUserId,
  openDatabase,
  uuidv7,
} from "../src/index.ts";
import { TEST_DEVICE_ID, makeRoll } from "./helpers.ts";

test("offline ID creation produces a well-formed UUIDv7", () => {
  const id = uuidv7();
  assert.match(
    id,
    /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  );
  assert.equal(isUuidv7(id), true);
  assert.equal(uuidv7().charAt(14), "7");
});

test("IDs are globally unique under volume generation", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 5000; i += 1) {
    seen.add(newUserId());
  }
  assert.equal(seen.size, 5000);
});

test("identity survives JSON serialization/deserialization", () => {
  const id = newRollId();
  const roundtrip = JSON.parse(JSON.stringify({ id })) as { id: string };
  assert.equal(roundtrip.id, id);
  assert.equal(typeof roundtrip.id, "string");
});

test("entity identity retained across sync retry (same submission id)", () => {
  const db = openDatabase();
  const roll = makeRoll();
  const submissionId = uuidv7();
  applyLocalMutation(db, {
    deviceId: TEST_DEVICE_ID,
    operation: "CREATE",
    entity: roll,
    expectedEntityVersion: 0,
    submissionId,
  });

  // A retry rebuilds the envelope with the SAME submission id and entity id.
  const retry = buildEnvelope({
    submission_id: submissionId,
    device_id: TEST_DEVICE_ID,
    entity_type: "Roll",
    entity_id: roll.id,
    operation_type: "CREATE",
    expected_entity_version: 0,
    payload: roll,
  });
  assert.equal(retry.submission_id, submissionId);
  assert.equal(retry.entity_id, roll.id);

  // The persisted canonical entity id is unchanged by the retry.
  const stored = createEntityStore(db).get("Roll", roll.id);
  assert.equal(stored?.id, roll.id);
});

test("all 16 canonical entity kinds are declared", () => {
  assert.equal(ENTITY_TYPES.length, 16);
  assert.equal(new Set(ENTITY_TYPES).size, 16);
});