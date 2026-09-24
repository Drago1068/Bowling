import test from "node:test";
import assert from "node:assert/strict";
import { hashPayload } from "../../src/sync/hashing.ts";
import { uuidv7 } from "../../src/identity/uuidv7.ts";
import { makeApp, truncateAll } from "./helpers.ts";

function makePinStateCreate(rollId: string, deviceId = uuidv7()) {
  const entityId = uuidv7();
  const submissionId = uuidv7();
  const now = new Date().toISOString();
  const payload = {
    id: entityId,
    entity_type: "PinState",
    schema_version: 1,
    entity_version: 1,
    data_quality: "COMPLETE",
    origin_device_id: deviceId,
    created_at: now,
    updated_at: now,
    roll_id: rollId,
    basis_roll_version: 1,
    standing_pins: [10],
    deleted: false,
  };
  return {
    request: {
      protocol_version: 1,
      submission_id: submissionId,
      device_id: deviceId,
      entity_type: "PinState",
      entity_id: entityId,
      operation_type: "CREATE" as const,
      expected_entity_version: 0,
      payload,
      payload_hash: hashPayload(payload),
    },
    entity_id: entityId,
    device_id: deviceId,
    submission_id: submissionId,
  };
}

test("PinState competing CREATE for same roll_id conflicts with preserved payload", async () => {
  await truncateAll();
  const app = await makeApp();
  try {
    const rollId = uuidv7();
    const a = makePinStateCreate(rollId);
    const first = await app.push(a.request);
    assert.equal(first.status, "ACCEPTED");

    const b = makePinStateCreate(rollId);
    const second = await app.push(b.request);
    assert.equal(second.status, "CONFLICT");
    if (second.status === "CONFLICT") {
      assert.ok(second.conflict_id);
    }

    const replay = await app.push(b.request);
    assert.equal(replay.status, "CONFLICT");
  } finally {
    await app.close();
  }
});

test("PinState CREATE without Roll is accepted (missing dependency elsewhere)", async () => {
  await truncateAll();
  const app = await makeApp();
  try {
    const created = makePinStateCreate(uuidv7());
    const result = await app.push(created.request);
    assert.equal(result.status, "ACCEPTED");
  } finally {
    await app.close();
  }
});
