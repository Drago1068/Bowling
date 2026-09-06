import type { CanonicalEntity, Correction, EntityType } from "../entities.ts";
import type { MutationEnvelope } from "../sync/envelope.ts";
import type { SyncState } from "../sync/stateMachine.ts";

/**
 * Explicit domain persistence contracts.
 *
 * These are intentionally concrete and domain-specific, not a generic
 * storage framework. Cursor will bind a React Native SQLite driver behind these
 * same interfaces so the domain semantics defined in Slice 1 are not rewritten.
 */

/** Canonical entity persistence, keyed by (entity_type, id -> UUIDv7). */
export interface CanonicalEntityStore {
  get(entityType: EntityType, id: string): CanonicalEntity | null;
  /** Insert-or-replace. Callers are responsible for version advancement. */
  upsert(entity: CanonicalEntity): void;
  markArchived(entityType: EntityType, id: string, archived: boolean): void;
  list(entityType: EntityType): CanonicalEntity[];
}

/** Durable outbox entry: the mutation envelope plus local sync lifecycle. */
export interface OutboxEntry {
  seq: number;
  envelope: MutationEnvelope;
  state: SyncState;
  submitted_at: string | null;
  last_error: string | null;
  retry_count: number;
}

export interface SyncOutboxStore {
  enqueue(envelope: MutationEnvelope, initialState?: SyncState): OutboxEntry;
  get(submissionId: string): OutboxEntry | null;
  /** Entries eligible for (re)submission: QUEUED or RETRYABLE_ERROR. */
  pending(): OutboxEntry[];
  /** In-flight entries (SUBMITTED or ACCEPTED) needing re-drive to CONFIRMED. */
  resumable(): OutboxEntry[];
  setState(submissionId: string, state: SyncState): void;
  markSubmitted(submissionId: string, submittedAt: string): void;
  recordError(submissionId: string, message: string): void;
}

/** A change durably applied from the server (inbox side of reconciliation). */
export interface AppliedChange {
  change_id: string;
  device_id: string;
  entity_type: EntityType;
  entity_id: string;
  entity_version: number;
  payload_hash: string;
  applied_at: string;
}

export interface AppliedChangeStore {
  record(change: AppliedChange): void;
  isApplied(changeId: string): boolean;
  listForEntity(entityType: EntityType, entityId: string): AppliedChange[];
}

export interface SyncCheckpointStore {
  get(key: string): string | null;
  set(key: string, value: string): void;
}

export interface CorrectionStore {
  record(correction: Correction): void;
  get(correctionId: string): Correction | null;
  listForTarget(entityType: EntityType, entityId: string): Correction[];
}

/**
 * A durable server conflict preserved locally. The local observation and the
 * server canonical version are both retained; neither is discarded.
 */
export interface ConflictRecord {
  submission_id: string;
  conflict_id: string;
  entity_type: EntityType;
  entity_id: string;
  expected_entity_version: number;
  canonical_entity_version: number;
  /** The original local observation payload that was rejected as stale. */
  local_payload: unknown;
  status: "OPEN" | "RESOLVED";
  created_at: string;
}

export interface ConflictStore {
  record(conflict: ConflictRecord): void;
  list(): ConflictRecord[];
  listForEntity(entityType: EntityType, entityId: string): ConflictRecord[];
}