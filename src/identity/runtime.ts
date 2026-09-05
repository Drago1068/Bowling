export function assertUuidv7RuntimeSupport(): void {
  if (typeof BigInt !== "function") {
    throw new Error("UUIDv7 requires BigInt, which is unavailable on this runtime");
  }
  const probe = 1n << 74n;
  if (probe <= 1n) {
    throw new Error("UUIDv7 requires functional BigInt shift semantics");
  }
}
