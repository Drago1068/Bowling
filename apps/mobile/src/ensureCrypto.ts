import * as Crypto from "expo-crypto";
import { assertUuidv7RuntimeSupport } from "../../../src/portable.ts";

/**
 * Ensure the accepted UUIDv7 implementation can run: BigInt plus a CSPRNG.
 * Expo provides `getRandomBytes`; we only polyfill `crypto.getRandomValues`
 * when the runtime does not already expose it.
 */
export function ensureMobileCrypto(): void {
  assertUuidv7RuntimeSupport();
  const existing = globalThis.crypto;
  if (existing !== undefined && typeof existing.getRandomValues === "function") {
    return;
  }
  const getRandomValues = <T extends ArrayBufferView>(typedArray: T): T => {
    const bytes = Crypto.getRandomBytes(typedArray.byteLength);
    const view = new Uint8Array(
      typedArray.buffer,
      typedArray.byteOffset,
      typedArray.byteLength,
    );
    view.set(bytes);
    return typedArray;
  };
  Object.defineProperty(globalThis, "crypto", {
    value: { getRandomValues },
    configurable: true,
  });
}
