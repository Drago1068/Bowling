import test from "node:test";
import assert from "node:assert/strict";
import { isUuidv7, resetUuidv7MonotonicState, uuidv7 } from "../src/index.ts";

const SAME_MS = 1_000_000;

test("5000 IDs from the SAME millisecond are unique and valid", () => {
  resetUuidv7MonotonicState();
  const seen = new Set<string>();
  for (let i = 0; i < 5000; i += 1) {
    const id = uuidv7(SAME_MS);
    seen.add(id);
    assert.equal(isUuidv7(id), true, `id ${i} invalid: ${id}`);
  }
  assert.equal(seen.size, 5000);
});

test("5000 same-millisecond IDs are lexically monotonic (no wrap regression)", () => {
  resetUuidv7MonotonicState();
  let prev = uuidv7(SAME_MS);
  for (let i = 1; i < 5000; i += 1) {
    const curr = uuidv7(SAME_MS);
    assert.ok(curr > prev, `ordering regressed at index ${i}`);
    prev = curr;
  }
});

test("exceeding 4096 same-millisecond IDs does not wrap the counter", () => {
  resetUuidv7MonotonicState();
  // Generate well beyond the previous 12-bit counter capacity.
  const ids: string[] = [];
  for (let i = 0; i < 9000; i += 1) {
    ids.push(uuidv7(SAME_MS));
  }
  assert.equal(new Set(ids).size, 9000);
  for (let i = 1; i < ids.length; i += 1) {
    assert.ok(ids[i]! > ids[i - 1]!, `non-monotonic at ${i}`);
  }
});

test("wall-clock regression does not move the sequence backwards", () => {
  resetUuidv7MonotonicState();
  const t1001 = uuidv7(1001);
  const t1000 = uuidv7(1000);
  const t999 = uuidv7(999);
  assert.ok(t1000 > t1001, "t=1000 must not move below t=1001");
  assert.ok(t999 > t1000, "t=999 must not move below t=1000");
  assert.equal(isUuidv7(t1001), true);
  assert.equal(isUuidv7(t1000), true);
  assert.equal(isUuidv7(t999), true);
});

test("repeated identical timestamp input stays strictly increasing", () => {
  resetUuidv7MonotonicState();
  const a = uuidv7(42);
  const b = uuidv7(42);
  const c = uuidv7(42);
  assert.ok(b > a);
  assert.ok(c > b);
});