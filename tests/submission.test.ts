import test from "node:test";
import assert from "node:assert/strict";
import { buildEnvelope, uuidv7 } from "../src/index.ts";
import { TEST_DEVICE_ID, makeRoll } from "./helpers.ts";

const roll = () => makeRoll();

test("retry retains the same submission id", () => {
  const submissionId = uuidv7();
  const entity = roll();
  const base = {
    device_id: TEST_DEVICE_ID,
    entity_type: "Roll" as const,
    entity_id: entity.id,
    operation_type: "CREATE" as const,
    expected_entity_version: 0,
    payload: entity,
  };

  const first = buildEnvelope({ ...base, submission_id: submissionId });
  const retry = buildEnvelope({ ...base, submission_id: submissionId });

  assert.equal(first.submission_id, submissionId);
  assert.equal(retry.submission_id, submissionId);
  assert.equal(first.submission_id, retry.submission_id);
});

test("same submission id + same semantic payload -> identical hash", () => {
  const submissionId = uuidv7();
  const entity = roll();
  const e1 = buildEnvelope({
    submission_id: submissionId,
    device_id: TEST_DEVICE_ID,
    entity_type: "Roll",
    entity_id: entity.id,
    operation_type: "CREATE",
    expected_entity_version: 0,
    payload: { ...entity },
  });
  const e2 = buildEnvelope({
    submission_id: submissionId,
    device_id: TEST_DEVICE_ID,
    entity_type: "Roll",
    entity_id: entity.id,
    operation_type: "CREATE",
    expected_entity_version: 0,
    payload: { ...entity },
  });
  assert.equal(e1.payload_hash, e2.payload_hash);
});

test("same submission id + different semantic payload -> different hash", () => {
  const submissionId = uuidv7();
  const entity = roll();
  const e1 = buildEnvelope({
    submission_id: submissionId,
    device_id: TEST_DEVICE_ID,
    entity_type: "Roll",
    entity_id: entity.id,
    operation_type: "CREATE",
    expected_entity_version: 0,
    payload: entity,
  });
  const e2 = buildEnvelope({
    submission_id: submissionId,
    device_id: TEST_DEVICE_ID,
    entity_type: "Roll",
    entity_id: entity.id,
    operation_type: "CREATE",
    expected_entity_version: 0,
    payload: { ...entity, pinfall: 7 },
  });
  assert.notEqual(e1.payload_hash, e2.payload_hash);
});

test("two distinct submissions have distinct submission ids", () => {
  const entity = roll();
  const opts = {
    device_id: TEST_DEVICE_ID,
    entity_type: "Roll" as const,
    entity_id: entity.id,
    operation_type: "CREATE" as const,
    expected_entity_version: 0,
    payload: entity,
  };
  assert.notEqual(buildEnvelope(opts).submission_id, buildEnvelope(opts).submission_id);
});