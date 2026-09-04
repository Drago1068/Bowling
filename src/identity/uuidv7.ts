import { randomBytes } from "node:crypto";

/**
 * RFC 9562 UUIDv7.
 *
 * UUIDv7 is time-ordered (48-bit Unix millisecond timestamp in the high bits)
 * and thus lexicographically sortable by creation time, while remaining
 * offline-generatable and globally unique. This satisfies the ARCH-001 identity
 * requirement without relying on a central sequential allocator such as
 * PostgreSQL serials.
 *
 * Layout (128 bits):
 *   [0..47]  unix_ts_ms  (big-endian milliseconds)
 *   [48..51] version (0111 = 7)
 *   [52..63] rand_a      (12-bit, monotonic-within-millisecond counter seeded randomly)
 *   [64..65] variant (10, RFC 4122)
 *   [66..127] rand_b      (62-bit random)
 */

const VERSION: number = 0x7;

let lastTsMs = -1;
let randA = 0;

function nextRandA(ts: number): number {
  if (ts === lastTsMs) {
    randA = (randA + 1) & 0xfff;
  } else {
    lastTsMs = ts;
    // Seed with a fresh random value so ids within a new millisecond are not
    // predictable from the previous second's counter.
    randA = randomBytes(2).readUInt16BE(0) & 0xfff;
  }
  return randA;
}

function format(bytes: Uint8Array): string {
  const hex = Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return (
    `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-` +
    `${hex.slice(16, 20)}-${hex.slice(20)}`
  );
}

/**
 * Generate a UUIDv7 string. Accepts an optional millisecond timestamp for
 * deterministic testing; defaults to the current wall clock.
 */
export function uuidv7(nowMs: number = Date.now()): string {
  const ts = Math.max(0, nowMs);

  const bytes = new Uint8Array(16);
  // 48-bit big-endian timestamp.
  let t = ts;
  for (let i = 5; i >= 0; i -= 1) {
    bytes[i] = t & 0xff;
    t = Math.floor(t / 256);
  }

  const ra = nextRandA(ts);
  bytes[6] = (VERSION << 4) | ((ra >>> 8) & 0x0f);
  bytes[7] = ra & 0xff;

  bytes.set(randomBytes(8), 8);
  // Set RFC 4122 variant bits: top two bits of byte 8 = 10.
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;

  return format(bytes);
}

/** True if the string parses as a valid UUIDv7. */
export function isUuidv7(value: string): boolean {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(value)) {
    return false;
  }
  return value.charAt(14) === "7" && (value.charAt(19) === "8" || value.charAt(19) === "9" || value.charAt(19) === "a" || value.charAt(19) === "b");
}