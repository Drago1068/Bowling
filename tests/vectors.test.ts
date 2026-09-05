import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  INITIAL_ENTITY_VERSION,
  INITIAL_SCHEMA_VERSION,
  SYNC_PRESENTATION_STATUSES,
  SYNC_STATES,
  canonicalize,
  hashPayload,
  isUuidv7,
  sha256Utf8Hex,
  uuidv7,
} from "../src/index.ts";

const dir = dirname(fileURLToPath(import.meta.url));
const vectors = JSON.parse(
  readFileSync(join(dir, "vectors/arch001.json"), "utf8"),
) as {
  uuid_format: { pattern: string };
  canonicalize: Array<{ name: string; a: unknown; b: unknown; canonical: string }>;
  sha256: Array<{ name: string; utf8: string; hex: string }>;
  payload_hash: Array<{ name: string; payload_a: unknown; payload_b: unknown }>;
  entity_metadata: {
    initial_schema_version: number;
    initial_entity_version: number;
    data_quality_values: string[];
  };
  sync_states: string[];
  sync_presentation: string[];
};

test("vector: generated UUIDv7 matches the architecture format", () => {
  const re = new RegExp(vectors.uuid_format.pattern);
  const id = uuidv7();
  assert.match(id, re);
  assert.equal(isUuidv7(id), true);
});

test("vector: canonicalization fixtures are identical across key order", () => {
  for (const row of vectors.canonicalize) {
    assert.equal(canonicalize(row.a), row.canonical, row.name);
    assert.equal(canonicalize(row.b), row.canonical, row.name);
  }
});

test("vector: portable SHA-256 matches published digests", () => {
  for (const row of vectors.sha256) {
    assert.equal(sha256Utf8Hex(row.utf8), row.hex, row.name);
  }
});

test("HASH_PARITY_NODE_MOBILE: portable SHA-256 matches node:crypto", () => {
  const samples = [
    "",
    "abc",
    '{"a":{"c":3,"d":2},"b":1}',
    "Bowling ARCH-001 payload",
    canonicalize({ z: 1, a: [3, 2, 1], nested: { b: true, a: null } }),
  ];
  for (const sample of samples) {
    const nodeHex = createHash("sha256").update(sample, "utf8").digest("hex");
    assert.equal(sha256Utf8Hex(sample), nodeHex, sample);
  }
});

test("vector: payload hashes ignore object key order", () => {
  for (const row of vectors.payload_hash) {
    assert.equal(hashPayload(row.payload_a), hashPayload(row.payload_b), row.name);
  }
});

test("vector: entity metadata constants", () => {
  assert.equal(
    INITIAL_SCHEMA_VERSION,
    vectors.entity_metadata.initial_schema_version,
  );
  assert.equal(
    INITIAL_ENTITY_VERSION,
    vectors.entity_metadata.initial_entity_version,
  );
});

test("vector: sync state and presentation enumerations", () => {
  assert.deepEqual([...SYNC_STATES], vectors.sync_states);
  assert.deepEqual([...SYNC_PRESENTATION_STATUSES], vectors.sync_presentation);
});
