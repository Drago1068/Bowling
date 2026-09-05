import test from "node:test";
import assert from "node:assert/strict";
import {
  deriveSyncPresentation,
  labelFor,
  presentationForOutboxState,
  type OutboxEntry,
} from "../src/index.ts";

function entry(state: OutboxEntry["state"]): OutboxEntry {
  return {
    seq: 1,
    envelope: {
      protocol_version: 1,
      submission_id: "sub",
      device_id: "dev",
      entity_type: "Roll",
      entity_id: "ent",
      operation_type: "CREATE",
      expected_entity_version: 0,
      payload: {},
      payload_hash: "abc",
      created_at: "2026-01-01T00:00:00.000Z",
    },
    state,
    submitted_at: null,
    last_error: null,
    retry_count: 0,
  };
}

test("queued local mutations present as waiting to sync when network is up", () => {
  const snap = deriveSyncPresentation([entry("QUEUED")], { network: "available" });
  assert.equal(snap.headline, "waiting_to_sync");
  assert.equal(snap.label, "Waiting to sync");
  assert.equal(snap.nasAccepted, false);
});

test("network unavailable is never represented as data lost", () => {
  const snap = deriveSyncPresentation([entry("QUEUED")], { network: "unavailable" });
  assert.equal(snap.headline, "sync_temporarily_unavailable");
  assert.equal(snap.label, "Sync temporarily unavailable");
  assert.notEqual(snap.label.toLowerCase().includes("lost"), true);
});

test("synced is not emitted without a real NAS acceptance", () => {
  const empty = deriveSyncPresentation([], { network: "available" });
  assert.equal(empty.headline, "saved_locally");
  assert.equal(empty.nasAccepted, false);
  const fake = deriveSyncPresentation([], { network: "available", nasAccepted: true });
  assert.equal(fake.headline, "synced");
});

test("conflict and rejection presentation statuses", () => {
  assert.equal(
    deriveSyncPresentation([entry("CONFLICT")]).headline,
    "conflict_requires_resolution",
  );
  assert.equal(
    deriveSyncPresentation([entry("REJECTED")]).headline,
    "rejected_invalid_mutation",
  );
  assert.equal(labelFor("syncing"), "Syncing");
  assert.equal(presentationForOutboxState("SUBMITTED", "available"), "syncing");
  assert.equal(presentationForOutboxState("LOCAL_ONLY", "unavailable"), "saved_locally");
});
