import test from "node:test";
import assert from "node:assert/strict";
import { canonicalize, hashPayload } from "../src/index.ts";

test("deterministic ordering: object key order is irrelevant", () => {
  const a = canonicalize({ b: 1, a: { d: 2, c: 3 } });
  const b = canonicalize({ a: { c: 3, d: 2 }, b: 1 });
  assert.equal(a, b);
  assert.equal(a, '{"a":{"c":3,"d":2},"b":1}');
});

test("identical semantic payload -> identical hash", () => {
  const h1 = hashPayload({ x: 1, y: [1, 2] });
  const h2 = hashPayload({ y: [1, 2], x: 1 });
  assert.equal(h1, h2);
});

test("changed semantic payload -> changed hash", () => {
  assert.notEqual(hashPayload({ x: 1 }), hashPayload({ x: 2 }));
  assert.notEqual(hashPayload({ x: 1 }), hashPayload({ x: 1, y: 2 }));
});

test("array element order is preserved (and affects the hash)", () => {
  assert.notEqual(hashPayload([1, 2]), hashPayload([2, 1]));
  assert.equal(hashPayload([1, 2]), hashPayload([1, 2]));
});

test("non-canonicalizable values are rejected, not silently coerced", () => {
  assert.throws(() => hashPayload({ x: undefined }), TypeError);
  assert.throws(() => hashPayload({ x: Number.NaN }), TypeError);
  assert.throws(() => hashPayload({ x: Number.POSITIVE_INFINITY }), TypeError);
  assert.throws(() => hashPayload(new Date()), TypeError);
});

test("nested ordering is fully recursive", () => {
  const a = { z: { m: 1, a: [{ b: 2, a: 1 }] }, y: 0 };
  const b = { y: 0, z: { a: [{ a: 1, b: 2 }], m: 1 } };
  assert.equal(canonicalize(a), canonicalize(b));
});