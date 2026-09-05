import { getSecureRandomBytes } from "../platform/random.ts";

/**
 * RFC 9562 UUIDv7 with process-local monotonicity (counter method).
 *
 * UUIDv7 is time-ordered (48-bit Unix millisecond timestamp in the high bits)
 * and thus lexicographically sortable by creation time, while remaining
 * offline-generatable and globally unique without a central sequential
 * allocator.
 *
 * Bit layout (128 bits, MSB-first):
 *   [127..80] unix_ts_ms  (48-bit milliseconds)
 *   [79..76]  version     (0111 = 7, fixed)
 *   [75..64]  rand_a      (12 bits, top 12 bits of the monotonic tail)
 *   [63..62]  variant     (10, RFC 4122, fixed)
 *   [61..0]   rand_b      (62 bits, low 62 bits of the monotonic tail)
 *
 * Monotonicity contract (normative for this generator):
 *   - The full 128-bit value never decreases across successive calls in a
 *     process. Version and variant nibbles are constant, so monotonicity is
 *     reduced to a single 74-bit "tail" counter anchored to a non-decreasing
 *     timestamp.
 *   - A higher supplied timestamp advances `lastTs`; a fresh random tail is
 *     seeded so ids are not predictable.
 *   - An equal or REGRESSED (lower) timestamp does NOT move the logical clock
 *     backwards: the tail is incremented instead. If the 74-bit tail would
 *     overflow (equivalent to >2^74 ids in one millisecond — no 12-bit wrap),
 *     the logical timestamp advances by one and the tail resets.
 *   - There is therefore no silent counter wrap and no backwards timestamp.
 */

const VERSION = 7n;
const VARIANT = 2n; // binary 10

const TAIL_BITS = 74n;
const TAIL_MAX = (1n << TAIL_BITS) - 1n;
const TS_MAX = (1n << 48n) - 1n;

let lastTs = -1n;
let lastTail = -1n;

function randomTail(): bigint {
  const buf = getSecureRandomBytes(10);
  let r = 0n;
  for (const b of buf) {
    r = (r << 8n) | BigInt(b);
  }
  return r & TAIL_MAX;
}

function valueToUuid(value: bigint): string {
  const hex = value.toString(16).padStart(32, "0");
  return (
    `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-` +
    `${hex.slice(16, 20)}-${hex.slice(20)}`
  );
}

/**
 * Generate a UUIDv7 string. Accepts an optional millisecond timestamp primarily
 * for deterministic testing; when omitted the current wall clock is used.
 */
export function uuidv7(nowMs: number = Date.now()): string {
  const requested = BigInt(Math.max(0, Math.floor(nowMs)));

  let ts: bigint;
  let tail: bigint;

  if (requested > lastTs) {
    ts = requested;
    tail = randomTail();
  } else {
    ts = lastTs;
    tail = lastTail + 1n;
    if (tail > TAIL_MAX) {
      ts = (lastTs + 1n) > TS_MAX ? TS_MAX : lastTs + 1n;
      tail = 0n;
    }
  }
  lastTs = ts;
  lastTail = tail;

  const value =
    (ts << 80n) |
    (VERSION << 76n) |
    ((tail >> 62n) << 64n) |
    (VARIANT << 62n) |
    (tail & ((1n << 62n) - 1n));

  return valueToUuid(value);
}

/** Reset the process-local monotonic generator state (test/edge use only). */
export function resetUuidv7MonotonicState(): void {
  lastTs = -1n;
  lastTail = -1n;
}

/** True if the string parses as a valid UUIDv7. */
export function isUuidv7(value: string): boolean {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)
  ) {
    return false;
  }
  return (
    value.charAt(14) === "7" &&
    (value.charAt(19) === "8" ||
      value.charAt(19) === "9" ||
      value.charAt(19) === "a" ||
      value.charAt(19) === "b")
  );
}