export const INITIAL_ENTITY_VERSION = 1;

/** Raised when an inbound mutation targets a stale entity version. */
export class StaleEntityVersionError extends Error {
  readonly expected: number;
  readonly current: number;
  constructor(expected: number, current: number) {
    super(
      `stale entity version: expected ${expected} but current is ${current}`,
    );
    this.name = "StaleEntityVersionError";
    this.expected = expected;
    this.current = current;
  }
}

/** The version assigned to a newly created entity. */
export function initialVersion(): number {
  return INITIAL_ENTITY_VERSION;
}

/**
 * Increment an entity version exactly once. This is the single sanctioned
 * pathway for advancing `entity_version`; callers must invoke it once and only
 * once per accepted semantic mutation.
 */
export function nextVersion(current: number): number {
  return current + 1;
}

/** True when a proposed mutation's base version does not match the current one. */
export function isStale(expected: number, current: number): boolean {
  return expected !== current;
}

/** Throw unless the expected version matches the current version. */
export function assertVersionMatch(expected: number, current: number): void {
  if (isStale(expected, current)) {
    throw new StaleEntityVersionError(expected, current);
  }
}