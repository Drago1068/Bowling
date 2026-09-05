import type { OutboxEntry } from "../persistence/contracts.ts";
import type { SyncState } from "./stateMachine.ts";

/**
 * Presentation-layer sync status.
 *
 * NAS push/pull is NOT authorized in this slice. Consequently:
 *   - "Synced" is never emitted from local-only operation
 *   - network unavailability is never represented as data loss
 *   - QUEUED local mutations present as saved locally / waiting to sync
 */
export const SYNC_PRESENTATION_STATUSES = [
  "saved_locally",
  "waiting_to_sync",
  "syncing",
  "synced",
  "sync_temporarily_unavailable",
  "conflict_requires_resolution",
  "rejected_invalid_mutation",
] as const;

export type SyncPresentationStatus = (typeof SYNC_PRESENTATION_STATUSES)[number];

export type NetworkAvailability = "available" | "unavailable";

export interface SyncPresentationSnapshot {
  headline: SyncPresentationStatus;
  label: string;
  network: NetworkAvailability;
  pendingCount: number;
  hasConflict: boolean;
  hasRejection: boolean;
  /** True when a real NAS acceptance has been recorded. Always false until sync exists. */
  nasAccepted: boolean;
  entries: Array<{
    submissionId: string;
    state: SyncState;
    presentation: SyncPresentationStatus;
  }>;
}

const LABELS: Record<SyncPresentationStatus, string> = {
  saved_locally: "Saved locally",
  waiting_to_sync: "Waiting to sync",
  syncing: "Syncing",
  synced: "Synced",
  sync_temporarily_unavailable: "Sync temporarily unavailable",
  conflict_requires_resolution: "Conflict requires resolution",
  rejected_invalid_mutation: "Rejected/invalid mutation",
};

export function labelFor(status: SyncPresentationStatus): string {
  return LABELS[status];
}

/**
 * Map a durable outbox state onto a presentation status.
 *
 * Until a real NAS response exists, SUBMITTED/ACCEPTED/CONFIRMED cannot be
 * honestly produced by local operation. If such a state is somehow present it
 * is still mapped, but `deriveSyncPresentation` will not promote the headline
 * to `synced` without `nasAccepted`.
 */
export function presentationForOutboxState(
  state: SyncState,
  network: NetworkAvailability,
): SyncPresentationStatus {
  switch (state) {
    case "LOCAL_ONLY":
      return "saved_locally";
    case "QUEUED":
      return network === "unavailable"
        ? "sync_temporarily_unavailable"
        : "waiting_to_sync";
    case "RETRYABLE_ERROR":
      return network === "unavailable"
        ? "sync_temporarily_unavailable"
        : "waiting_to_sync";
    case "SUBMITTED":
      return "syncing";
    case "ACCEPTED":
    case "CONFIRMED":
      return "synced";
    case "CONFLICT":
      return "conflict_requires_resolution";
    case "REJECTED":
      return "rejected_invalid_mutation";
  }
}

export interface PresentationOptions {
  network?: NetworkAvailability;
  /**
   * Only set true when a real accepted NAS response has been durably recorded.
   * Local mutation success must never set this.
   */
  nasAccepted?: boolean;
}

export function deriveSyncPresentation(
  pendingOrKnown: readonly OutboxEntry[],
  options: PresentationOptions = {},
): SyncPresentationSnapshot {
  const network: NetworkAvailability = options.network ?? "unavailable";
  const nasAccepted = options.nasAccepted === true;
  const entries = pendingOrKnown.map((entry) => ({
    submissionId: entry.envelope.submission_id,
    state: entry.state,
    presentation: presentationForOutboxState(entry.state, network),
  }));

  const hasConflict = pendingOrKnown.some((e) => e.state === "CONFLICT");
  const hasRejection = pendingOrKnown.some((e) => e.state === "REJECTED");
  const pendingCount = pendingOrKnown.filter(
    (e) => e.state === "QUEUED" || e.state === "RETRYABLE_ERROR" || e.state === "LOCAL_ONLY",
  ).length;

  let headline: SyncPresentationStatus;
  if (hasConflict) {
    headline = "conflict_requires_resolution";
  } else if (hasRejection && pendingCount === 0) {
    headline = "rejected_invalid_mutation";
  } else if (pendingCount > 0) {
    headline =
      network === "unavailable"
        ? "sync_temporarily_unavailable"
        : "waiting_to_sync";
  } else if (nasAccepted) {
    headline = "synced";
  } else {
    headline = "saved_locally";
  }

  return {
    headline,
    label: LABELS[headline],
    network,
    pendingCount,
    hasConflict,
    hasRejection,
    nasAccepted,
    entries,
  };
}
