import { createHash } from "node:crypto";

/**
 * Deterministic canonical serialization for sync payload hashing.
 *
 * Rules (normative):
 *  1. Objects: keys are sorted lexicographically (code-unit order) at every
 *     nesting level. There is no reliance on arbitrary object-key ordering.
 *  2. Arrays: element order is preserved; arrays are NOT sorted.
 *  3. Strings: emitted verbatim as UTF-8 (unchanged, no escaping beyond JSON).
 *  4. Numbers: emitted using JSON number formatting; only finite numbers are
 *     permitted (see below).
 *  5. Booleans/null: emitted as JSON literal `true` / `false` / `null`.
 *  6. Whitespace is never significant: the canonical form contains no
 *     insignificant whitespace.
 *
 * Invariants:
 *   - same submission_id + same semantic payload -> identical canonical form
 *     -> identical payload hash.
 *   - same submission_id + different semantic payload -> different hash.
 *
 * Rejected input (throws, fails fast rather than silently normalizing):
 *   - undefined (any position), functions, symbols, bigint, NaN, +/-Infinity,
 *   - Date, Map, Set, and other non-plain objects.
 * This ensures two semantically-equal payloads can never produce different
 * hashes due to lossy JSON coercion (e.g. NaN -> null).
 */
export type Canonicalizable = null | boolean | number | string | Canonicalizable[] | { [key: string]: Canonicalizable };

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function assertCanonicalizable(value: unknown, path: string): asserts value is Canonicalizable {
  if (value === null) return;
  const t = typeof value;
  if (t === "boolean" || t === "string") return;
  if (t === "number") {
    if (!Number.isFinite(value)) {
      throw new TypeError(`non-finite number at ${path}`);
    }
    return;
  }
  if (t === "object") {
    if (Array.isArray(value)) return;
    if (isPlainObject(value)) return;
    throw new TypeError(`non-plain object at ${path}`);
  }
  // undefined, function, symbol, bigint
  throw new TypeError(`non-canonicalizable value (${t}) at ${path}`);
}

function sortValue(value: Canonicalizable): Canonicalizable {
  if (Array.isArray(value)) {
    return value.map((v, i) => sortValueAt(v));
  }
  if (isPlainObject(value)) {
    const keys = Object.keys(value).sort();
    const out: { [key: string]: Canonicalizable } = {};
    for (const k of keys) {
      const v = (value as Record<string, Canonicalizable>)[k] as Canonicalizable;
      out[k] = sortValueAt(v);
    }
    return out;
  }
  return value;

  function sortValueAt(v: Canonicalizable): Canonicalizable {
    assertCanonicalizable(v, "payload");
    return sortValue(v);
  }
}

/** Produce the canonical JSON string for a payload. */
export function canonicalize(payload: unknown): string {
  assertCanonicalizable(payload, "payload");
  return JSON.stringify(sortValue(payload));
}

/** SHA-256 (hex) digest of the canonical serialization. */
export function hashCanonicalJson(canonicalJson: string): string {
  return createHash("sha256").update(canonicalJson, "utf8").digest("hex");
}

/** Deterministic payload hash: SHA-256 over the canonical serialization. */
export function hashPayload(payload: unknown): string {
  return hashCanonicalJson(canonicalize(payload));
}