import test from "node:test";
import assert from "node:assert/strict";
import { uuidv7 } from "../src/identity/uuidv7.ts";
import { hashPayload } from "../src/sync/hashing.ts";
import { validatePushRequest } from "../server/validation/validate.ts";

function request(payload: Record<string, unknown>, entityType = "Frame") {
  return {
    protocol_version: 1,
    submission_id: uuidv7(),
    device_id: uuidv7(),
    entity_type: entityType,
    entity_id: uuidv7(),
    operation_type: "CREATE",
    expected_entity_version: 0,
    payload,
    payload_hash: hashPayload(payload),
  };
}

test("server accepts DELETE metadata payload shape", () => {
  const payload = { entity_type: "Roll", entity_id: uuidv7(), schema_version: 1 };
  const result = validatePushRequest({
    ...request(payload, "Roll"),
    operation_type: "DELETE",
    entity_id: payload.entity_id,
  });
  assert.equal(result.ok, true);
});

test("server rejects frame numbers above ten", () => {
  const result = validatePushRequest(request({
    schema_version: 1,
    data_quality: "COMPLETE",
    created_at: new Date().toISOString(),
    frame_number: 11,
  }));
  assert.equal(result.ok, false);
  if (!result.ok && result.kind === "rejected") {
    assert.match(result.message, /1\.\.10/);
  }
});
