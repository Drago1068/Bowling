/**
 * Portable cryptographically-secure random bytes.
 *
 * Uses the Web Crypto `getRandomValues` API, which is available on Node 22+
 * (global `crypto`) and on modern React Native / Expo runtimes. Callers must
 * not fall back to `Math.random()`: UUIDv7 uniqueness depends on CSPRNG
 * quality.
 *
 * This module MUST remain free of `node:crypto` so the mobile bundle can
 * reuse the accepted UUIDv7 implementation without a Node-only import.
 */
export function getSecureRandomBytes(size: number): Uint8Array {
  if (!Number.isInteger(size) || size < 0) {
    throw new RangeError(`random byte length must be a non-negative integer, got ${size}`);
  }
  const out = new Uint8Array(size);
  if (size === 0) return out;
  const cryptoObj = globalThis.crypto;
  if (cryptoObj === undefined || typeof cryptoObj.getRandomValues !== "function") {
    throw new Error(
      "Secure random generator is unavailable on this runtime (crypto.getRandomValues missing)",
    );
  }
  cryptoObj.getRandomValues(out);
  return out;
}

export function assertSecureRandomAvailable(): void {
  getSecureRandomBytes(1);
}
