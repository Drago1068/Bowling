import type { CanonicalEntity, Correction } from "../../entities.ts";
import {
  DuplicateCorrectionError,
  TargetEntityNotFoundError,
} from "../../correction.ts";
import {
  buildEnvelope,
  type MutationEnvelope,
} from "../../sync/envelope.ts";
import { assertVersionMatch, nextVersion } from "../../versioning.ts";
import { transaction } from "./database.ts";
import { createEntityStore } from "./entityStore.ts";
import type { CanonicalEntityStore } from "../contracts.ts";
import { createOutboxStore } from "./outboxStore.ts";
import type { SyncOutboxStore } from "../contracts.ts";
import { createCorrectionStore } from "./correctionStore.ts";
import type { CorrectionStore } from "../contracts.ts";
import type { SqliteDriver } from "./driver.ts";
import type { PersistenceFaults } from "./faults.ts";

export interface ApplyCorrectionInput {
  correction: Correction;
  deviceId: string;
  submissionId?: string;
  now?: Date;
}

export interface ApplyCorrectionResult {
  envelope: MutationEnvelope;
  correction: Correction;
  entity: CanonicalEntity;
}

/**
 * Apply a correction atomically.
 *
 * The entire operation — append the immutable correction record, apply the
 * corrected canonical representation, advance the target version exactly once,
 * mark it CORRECTED, and enqueue the CORRECT outbox mutation — commits as one
 * transaction. Any failure rolls the whole thing back, so no partial correction
 * can become durable.
 */
export function applyCorrection(
  db: SqliteDriver,
  input: ApplyCorrectionInput,
  faults?: PersistenceFaults,
): ApplyCorrectionResult {
  const entities = createEntityStore(db);
  const outbox = createOutboxStore(db);
  const corrections = createCorrectionStore(db);
  return transaction(
    db,
    () => apply(entities, corrections, outbox, input, faults),
    faults,
  );
}

function apply(
  entities: CanonicalEntityStore,
  corrections: CorrectionStore,
  outbox: SyncOutboxStore,
  input: ApplyCorrectionInput,
  faults?: PersistenceFaults,
): ApplyCorrectionResult {
  const now = input.now ?? new Date();
  const nowIso = now.toISOString();
  const { correction } = input;

  if (corrections.get(correction.id) !== null) {
    throw new DuplicateCorrectionError(correction.id);
  }

  const existing = entities.get(
    correction.target_entity_type,
    correction.target_entity_id,
  );
  if (!existing) {
    throw new TargetEntityNotFoundError(
      correction.target_entity_type,
      correction.target_entity_id,
    );
  }

  assertVersionMatch(correction.prior_entity_version, existing.entity_version);

  const corrected = (correction.corrected_representation ?? {}) as Partial<
    CanonicalEntity
  > & Record<string, unknown>;

  const next: CanonicalEntity = {
    ...(existing as unknown as Record<string, unknown>),
    ...(corrected as Record<string, unknown>),
    id: existing.id,
    entity_type: existing.entity_type,
    origin_device_id: existing.origin_device_id,
    created_at: existing.created_at,
    entity_version: nextVersion(existing.entity_version),
    updated_at: nowIso,
    data_quality: "CORRECTED",
    deleted: existing.deleted ?? false,
  } as CanonicalEntity;

  corrections.record(correction);
  faults?.afterCorrectionRecord?.();
  entities.upsert(next);

  const envelope = buildEnvelope({
    submission_id: input.submissionId,
    device_id: input.deviceId,
    entity_type: correction.target_entity_type,
    entity_id: correction.target_entity_id,
    operation_type: "CORRECT",
    expected_entity_version: correction.prior_entity_version,
    payload: correction,
    created_at: nowIso,
  });
  outbox.enqueue(envelope);

  return { envelope, correction, entity: next };
}
