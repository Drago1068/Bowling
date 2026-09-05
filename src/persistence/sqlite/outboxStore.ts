import type { EntityType } from "../../entities.ts";
import type { SqliteDriver } from "./driver.ts";
import type { MutationEnvelope, OperationType } from "../../sync/envelope.ts";
import type { SyncState } from "../../sync/stateMachine.ts";
import { isSyncState } from "../../sync/stateMachine.ts";
import type { OutboxEntry, SyncOutboxStore } from "../contracts.ts";

interface OutboxRow {
  seq: number;
  submission_id: string;
  protocol_version: number;
  device_id: string;
  entity_type: string;
  entity_id: string;
  operation_type: string;
  expected_entity_version: number;
  payload: string;
  payload_hash: string;
  created_at: string;
  state: string;
  submitted_at: string | null;
  last_error: string | null;
  retry_count: number;
}

function entryFromRow(row: OutboxRow): OutboxEntry {
  const envelope: MutationEnvelope = {
    protocol_version: row.protocol_version,
    submission_id: row.submission_id,
    device_id: row.device_id,
    entity_type: row.entity_type as EntityType,
    entity_id: row.entity_id,
    operation_type: row.operation_type as OperationType,
    expected_entity_version: row.expected_entity_version,
    payload: JSON.parse(row.payload),
    payload_hash: row.payload_hash,
    created_at: row.created_at,
  };
  const state = row.state;
  return {
    seq: row.seq,
    envelope,
    state: state as SyncState,
    submitted_at: row.submitted_at,
    last_error: row.last_error,
    retry_count: row.retry_count,
  };
}

export function createOutboxStore(db: SqliteDriver): SyncOutboxStore {
  const insertStmt = db.prepare(
    `INSERT INTO sync_outbox
       (submission_id, protocol_version, device_id, entity_type, entity_id,
        operation_type, expected_entity_version, payload, payload_hash,
        created_at, state)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  const getStmt = db.prepare("SELECT * FROM sync_outbox WHERE submission_id = ?");
  const pendingStmt = db.prepare(
    "SELECT * FROM sync_outbox WHERE state IN ('QUEUED','RETRYABLE_ERROR') ORDER BY seq",
  );
  const setStateStmt = db.prepare(
    "UPDATE sync_outbox SET state = ? WHERE submission_id = ?",
  );
  const markSubmittedStmt = db.prepare(
    "UPDATE sync_outbox SET submitted_at = ?, state = 'SUBMITTED' WHERE submission_id = ?",
  );
  const recordErrorStmt = db.prepare(
    "UPDATE sync_outbox SET last_error = ?, retry_count = retry_count + 1, state = 'RETRYABLE_ERROR' WHERE submission_id = ?",
  );

  return {
    enqueue(envelope: MutationEnvelope, initialState: SyncState = "QUEUED"): OutboxEntry {
      if (!isSyncState(initialState)) {
        throw new Error(`invalid initial outbox state: ${initialState}`);
      }
      const result = insertStmt.run(
        envelope.submission_id,
        envelope.protocol_version,
        envelope.device_id,
        envelope.entity_type,
        envelope.entity_id,
        envelope.operation_type,
        envelope.expected_entity_version,
        JSON.stringify(envelope.payload),
        envelope.payload_hash,
        envelope.created_at,
        initialState,
      );
      return {
        seq: Number(result.lastInsertRowid),
        envelope,
        state: initialState,
        submitted_at: null,
        last_error: null,
        retry_count: 0,
      };
    },
    get(submissionId: string): OutboxEntry | null {
      const row = getStmt.get(submissionId) as OutboxRow | undefined;
      return row ? entryFromRow(row) : null;
    },
    pending(): OutboxEntry[] {
      const rows = pendingStmt.all() as unknown as OutboxRow[];
      return rows.map(entryFromRow);
    },
    setState(submissionId: string, state: SyncState): void {
      setStateStmt.run(state, submissionId);
    },
    markSubmitted(submissionId: string, submittedAt: string): void {
      markSubmittedStmt.run(submittedAt, submissionId);
    },
    recordError(submissionId: string, message: string): void {
      recordErrorStmt.run(message, submissionId);
    },
  };
}