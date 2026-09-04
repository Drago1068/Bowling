import test from "node:test";
import assert from "node:assert/strict";
import { createDeviceStore, openDatabase } from "../src/index.ts";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { rmSync } from "node:fs";
import { uuidv7 } from "../src/index.ts";

test("device ID is created once and reused on subsequent loads", () => {
  const db = openDatabase();
  const store = createDeviceStore(db);
  const first = store.getOrCreate();
  const second = store.getOrCreate();
  assert.equal(first.device_id, second.device_id);
  assert.equal(first.device_id, store.get()?.device_id);
});

test("device ID survives process restart (database reopen)", () => {
  const path = join(tmpdir(), `bowling-device-${uuidv7()}.db`);
  try {
    let db = openDatabase(path);
    const original = createDeviceStore(db).getOrCreate().device_id;
    db.close();

    db = openDatabase(path);
    const reloaded = createDeviceStore(db).getOrCreate().device_id;
    assert.equal(reloaded, original);
    db.close();
  } finally {
    rmSync(path, { force: true });
  }
});