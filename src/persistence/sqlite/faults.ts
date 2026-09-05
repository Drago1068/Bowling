/**
 * Deterministic persistence fault injection.
 *
 * Used to exercise crash windows A–E without depending on a particular
 * SQLite vendor API. Hooks run inside the same control flow as production
 * mutations; throwing from a hook is the injected failure.
 */
export interface PersistenceFaults {
  /** Window A: throw before BEGIN. */
  beforeBegin?: () => void;
  /** Window B: throw after canonical write, before outbox insert (in txn). */
  afterCanonicalWrite?: () => void;
  /** Window C: throw after outbox insert, before COMMIT (in txn). */
  afterOutboxInsert?: () => void;
  /** Window D: invoked after successful COMMIT (simulates imminent termination). */
  afterCommit?: () => void;
  /** Window E: throw after correction audit insert, before canonical/outbox. */
  afterCorrectionRecord?: () => void;
}

export function injectedFailure(window: string): Error {
  return new Error(`injected persistence failure: ${window}`);
}
