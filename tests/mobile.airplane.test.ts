import test from "node:test";
import assert from "node:assert/strict";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  applyLocalMutation,
  createEntityStore,
  createNodeSqliteDriver,
  createOutboxStore,
  initializeApplication,
  uuidv7,
} from "../src/index.ts";
import { makeRoll } from "./helpers.ts";

function tmpPath(): string {
  return join(tmpdir(), `bowling-airplane-${uuidv7()}.db`);
}

function cleanup(path: string): void {
  rmSync(path, { force: true });
  rmSync(`${path}-wal`, { force: true });
  rmSync(`${path}-shm`, { force: true });
}

test("AIRPLANE_MODE_LOCAL_OPERATION: local recording does not require network", () => {
  const path = tmpPath();
  try {
    const first = createNodeSqliteDriver(path);
    const launched = initializeApplication({
      openDriver: () => first,
      network: "unavailable",
    });
    if (!launched.ok) assert.fail(launched.message);
    assert.ok(launched.statuses.includes("NO_ACTIVE_SESSION"));
    assert.ok(launched.statuses.includes("SYNC_TEMPORARILY_UNAVAILABLE"));
    const deviceId = launched.device.device_id;

    const roll = makeRoll();
    const mutation = applyLocalMutation(first, {
      deviceId,
      operation: "CREATE",
      entity: roll,
      expectedEntityVersion: 0,
    });
    assert.ok(createOutboxStore(first).get(mutation.envelope.submission_id));
    assert.equal(launched.presentation.headline, "saved_locally");
    assert.notEqual(launched.presentation.headline, "synced");
    first.close();

    const second = createNodeSqliteDriver(path);
    const reopened = initializeApplication({
      openDriver: () => second,
      network: "unavailable",
    });
    if (!reopened.ok) assert.fail(reopened.message);
    assert.equal(reopened.device.device_id, deviceId);
    assert.ok(createEntityStore(second).get("Roll", roll.id));
    const pending = createOutboxStore(second).pending();
    assert.equal(pending.length, 1);
    assert.equal(pending[0]!.envelope.submission_id, mutation.envelope.submission_id);
    assert.equal(reopened.localChangesPending, true);
    assert.ok(reopened.statuses.includes("LOCAL_CHANGES_PENDING"));
    assert.ok(reopened.statuses.includes("SYNC_TEMPORARILY_UNAVAILABLE"));
    assert.equal(reopened.presentation.headline, "sync_temporarily_unavailable");
    assert.equal(reopened.presentation.nasAccepted, false);
    assert.notEqual(reopened.presentation.label, "data lost");
    second.close();
  } finally {
    cleanup(path);
  }
});
