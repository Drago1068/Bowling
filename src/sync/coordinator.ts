import type { CanonicalEntity } from "../entities.ts";
import { hashPayload } from "./hashing.ts";
import type {
  AppliedChangeStore,
  CanonicalEntityStore,
  ConflictStore,
  SyncCheckpointStore,
  SyncOutboxStore,
} from "../persistence/contracts.ts";
import type { SyncTransport, PullChange, PullOutcome, PushOutcome } from "./transport.ts";
import type { SyncState } from "./stateMachine.ts";

export const CHECKPOINT_KEY = "change_cursor";
export const SERVER_RECEIPT_PREFIX = "receipt:";

/** Durable authoritative receipt recorded when the server accepts a submission. */
export interface ServerReceipt {
  entity_version: number;
  server_change_cursor: number;
  server_committed_at: string;
}

export function serverReceiptKey(submissionId: string): string {
  return `${SERVER_RECEIPT_PREFIX}${submissionId}`;
}

export interface SyncFaults {
  /** Throw to simulate a crash before a push request is sent. */
  beforePushSend?: (submissionId: string) => void;
  /** Throw to simulate a crash after the server accepts but before local confirm. */
  afterServerResultBeforeConfirm?: (submissionId: string) => void;
  /** Throw to simulate a crash after a pull page downloads but before local apply. */
  afterPullDownloadBeforeApply?: () => void;
  /** Throw to simulate a crash during local apply, before the checkpoint commit. */
  duringApplyBeforeCommit?: () => void;
  /** Throw to simulate a crash after the apply commit, before the next pull. */
  afterApplyCommitBeforeNext?: () => void;
}

export interface CoordinatorStores {
  outbox: SyncOutboxStore;
  entities: CanonicalEntityStore;
  checkpoint: SyncCheckpointStore;
  applied: AppliedChangeStore;
  conflicts: ConflictStore;
}

export interface CoordinatorOptions {
  transport: SyncTransport;
  stores: CoordinatorStores;
  /** Local transaction boundary; atomically commits apply + checkpoint. */
  withTransaction: (fn: () => void) => void;
  now?: () => Date;
  faults?: SyncFaults;
  pullLimit?: number;
}

export interface PushReport {
  attempted: number;
  confirmed: number;
  conflicts: number;
  rejected: number;
  retryableErrors: number;
  lastServerCursor: number | null;
}

export interface PullReport {
  applied: number;
  skipped: number;
  checkpoint: number;
  retryable: boolean;
}

export interface SyncReport {
  pushed: PushReport;
  pulled: PullReport;
}

export interface SyncCoordinator {
  pushPending(): Promise<PushReport>;
  pull(): Promise<PullReport>;
  syncOnce(): Promise<SyncReport>;
}

function changeKey(change: PullChange): string {
  return String(change.change_seq);
}

/**
 * Applies a single remote change to local canonical state under version rules:
 * never regress the local entity version, and treat an identical/lower version
 * as already applied. DELETE payloads carry `deleted:true` so they soft-archive.
 */
export function applyRemoteChange(entities: CanonicalEntityStore, change: PullChange): boolean {
  if (change.payload === undefined || change.payload === null) return false;
  const incoming = change.payload as CanonicalEntity;
  const existing = entities.get(change.entity_type, change.entity_id);
  if (existing && change.entity_version <= existing.entity_version) {
    return false;
  }
  entities.upsert(incoming);
  return true;
}

export function createSyncCoordinator(options: CoordinatorOptions): SyncCoordinator {
  const {
    transport,
    stores,
    withTransaction,
    faults = {},
    now = () => new Date(),
    pullLimit = 200,
  } = options;

  async function pushPending(): Promise<PushReport> {
    const report: PushReport = {
      attempted: 0,
      confirmed: 0,
      conflicts: 0,
      rejected: 0,
      retryableErrors: 0,
      lastServerCursor: null,
    };

    const candidates = [...stores.outbox.pending(), ...stores.outbox.resumable()];
    for (const entry of candidates) {
      const sid = entry.envelope.submission_id;
      report.attempted += 1;

      if (entry.state === "QUEUED" || entry.state === "RETRYABLE_ERROR") {
        stores.outbox.markSubmitted(sid, now().toISOString());
      }

      faults.beforePushSend?.(sid);
      const outcome: PushOutcome = await transport.push(entry.envelope);

      if (outcome.outcome === "retryable") {
        stores.outbox.recordError(sid, outcome.reason);
        report.retryableErrors += 1;
        continue;
      }

      const result = outcome.result;
      switch (result.status) {
        case "ACCEPTED":
        case "ALREADY_ACCEPTED": {
          // Persist a durable authoritative receipt at ACCEPTED time. On a
          // crash before CONFIRMED, the resumable ACCEPTED entry is re-driven:
          // the same submission_id is replayed (server returns ALREADY_ACCEPTED)
          // and then confirmed. This is the "explicit replay" recovery contract.
          const receipt: ServerReceipt = {
            entity_version: result.entity_version,
            server_change_cursor: result.server_change_cursor,
            server_committed_at: result.server_committed_at,
          };
          stores.outbox.setState(sid, "ACCEPTED");
          stores.checkpoint.set(serverReceiptKey(sid), JSON.stringify(receipt));
          stores.checkpoint.set("last_server_cursor", String(result.server_change_cursor));
          report.lastServerCursor = result.server_change_cursor;
          faults.afterServerResultBeforeConfirm?.(sid);
          stores.outbox.setState(sid, "CONFIRMED");
          report.confirmed += 1;
          break;
        }
        case "CONFLICT": {
          stores.outbox.setState(sid, "CONFLICT");
          stores.conflicts.record({
            conflict_id: result.conflict_id,
            submission_id: sid,
            entity_type: entry.envelope.entity_type,
            entity_id: entry.envelope.entity_id,
            expected_entity_version: result.expected_entity_version,
            canonical_entity_version: result.canonical_entity_version,
            local_payload: entry.envelope.payload,
            status: "OPEN",
            created_at: now().toISOString(),
          });
          report.conflicts += 1;
          break;
        }
        case "REJECTED":
        case "UNSUPPORTED_PROTOCOL":
        case "UNSUPPORTED_SCHEMA": {
          stores.outbox.setState(sid, "REJECTED");
          report.rejected += 1;
          break;
        }
      }
    }
    return report;
  }

  async function pull(): Promise<PullReport> {
    const report: PullReport = { applied: 0, skipped: 0, checkpoint: 0, retryable: false };
    let checkpoint = Number(stores.checkpoint.get(CHECKPOINT_KEY) ?? "0");

    for (;;) {
      const outcome: PullOutcome = await transport.pull(checkpoint, pullLimit);
      if (outcome.outcome === "retryable") {
        report.retryable = true;
        return report;
      }
      const page = outcome.page;
      faults.afterPullDownloadBeforeApply?.();
      if (page.changes.length === 0) {
        if (page.has_more) {
          // Defensive: no changes but claims more exist; advance to avoid a live-lock.
          checkpoint = page.next_cursor;
          continue;
        }
        break;
      }

      withTransaction(() => {
        for (const change of page.changes) {
          const key = changeKey(change);
          if (stores.applied.isApplied(key)) {
            report.skipped += 1;
            continue;
          }
          faults.duringApplyBeforeCommit?.();
          const applied = applyRemoteChange(stores.entities, change);
          stores.applied.record({
            change_id: key,
            device_id: change.origin_device_id ?? "",
            entity_type: change.entity_type,
            entity_id: change.entity_id,
            entity_version: change.entity_version,
            payload_hash: hashPayload(change.payload ?? {}),
            applied_at: now().toISOString(),
          });
          if (applied) report.applied += 1;
        }
        stores.checkpoint.set(CHECKPOINT_KEY, String(page.next_cursor));
      });

      checkpoint = page.next_cursor;
      report.checkpoint = checkpoint;
      faults.afterApplyCommitBeforeNext?.();
      if (!page.has_more) break;
    }

    return report;
  }

  async function syncOnce(): Promise<SyncReport> {
    const pushed = await pushPending();
    const pulled = await pull();
    return { pushed, pulled };
  }

  return { pushPending, pull, syncOnce };
}

export type { SyncState };