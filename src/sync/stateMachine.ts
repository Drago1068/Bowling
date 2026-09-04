/**
 * Local synchronization state machine.
 *
 * Distinction made explicit per ARCH-001: NAS ("server") acceptance and client
 * acknowledgement are NOT the same thing. ACCEPTED means the NAS durably
 * accepted the mutation; CONFIRMED means the client has durably acknowledged
 * the accepted server outcome. CONFLICT is a recoverable state resolved by
 * correction or re-submission, not by silent overwrite.
 */
export const SYNC_STATES = [
  "LOCAL_ONLY",
  "QUEUED",
  "SUBMITTED",
  "ACCEPTED",
  "CONFIRMED",
  "RETRYABLE_ERROR",
  "CONFLICT",
  "REJECTED",
] as const;

export type SyncState = (typeof SYNC_STATES)[number];

export function isSyncState(value: unknown): value is SyncState {
  return (
    typeof value === "string" &&
    (SYNC_STATES as readonly string[]).includes(value)
  );
}

/**
 * Legal one-step transitions.
 *
 *   LOCAL_ONLY       -> QUEUED, REJECTED
 *   QUEUED           -> SUBMITTED, REJECTED
 *   SUBMITTED        -> ACCEPTED, RETRYABLE_ERROR, CONFLICT, REJECTED
 *   ACCEPTED         -> CONFIRMED, RETRYABLE_ERROR
 *   RETRYABLE_ERROR  -> QUEUED, REJECTED
 *   CONFLICT         -> QUEUED, REJECTED
 *   CONFIRMED        -> (terminal)
 *   REJECTED         -> (terminal)
 */
const TRANSITIONS: Readonly<Record<SyncState, readonly SyncState[]>> = {
  LOCAL_ONLY: ["QUEUED", "REJECTED"],
  QUEUED: ["SUBMITTED", "REJECTED"],
  SUBMITTED: ["ACCEPTED", "RETRYABLE_ERROR", "CONFLICT", "REJECTED"],
  ACCEPTED: ["CONFIRMED", "RETRYABLE_ERROR"],
  CONFIRMED: [],
  RETRYABLE_ERROR: ["QUEUED", "REJECTED"],
  CONFLICT: ["QUEUED", "REJECTED"],
  REJECTED: [],
};

export const TERMINAL_STATES: ReadonlySet<SyncState> = new Set([
  "CONFIRMED",
  "REJECTED",
]);

export class InvalidStateTransitionError extends Error {
  readonly from: SyncState;
  readonly to: SyncState;
  constructor(from: SyncState, to: SyncState) {
    super(`illegal sync state transition: ${from} -> ${to}`);
    this.name = "InvalidStateTransitionError";
    this.from = from;
    this.to = to;
  }
}

export function canTransition(from: SyncState, to: SyncState): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Return `to` when the transition is legal; otherwise throw. */
export function transition(from: SyncState, to: SyncState): SyncState {
  if (!canTransition(from, to)) {
    throw new InvalidStateTransitionError(from, to);
  }
  return to;
}

export function isTerminal(state: SyncState): boolean {
  return TERMINAL_STATES.has(state);
}