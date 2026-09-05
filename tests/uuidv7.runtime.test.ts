import test from "node:test";
import assert from "node:assert/strict";
import {
  assertSecureRandomAvailable,
  assertUuidv7RuntimeSupport,
  isUuidv7,
  uuidv7,
} from "../src/index.ts";

test("UUIDv7 runtime: BigInt and secure random are available", () => {
  assert.equal(typeof BigInt, "function");
  assertUuidv7RuntimeSupport();
  assertSecureRandomAvailable();
  const id = uuidv7();
  assert.equal(isUuidv7(id), true);
});
