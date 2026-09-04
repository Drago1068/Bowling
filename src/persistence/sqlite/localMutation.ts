import type { DatabaseSync } from "node:sqlite";
import type { CanonicalEntity } from "../../entities.ts";
import {
  buildEnvelope,
  type MutationEnvelope,
  type OperationType,
} from "../../sync/envelope.ts";
import { assertVersionMatch, nextVersion } from "../../versioning.ts";
import { transaction } from "./database.ts";
import { createEntityStore } from "./entityStore.ts";
import type { CanonicalEntityStore } from "../contracts.ts";
import { createOutboxStore } from "./outboxStore.ts";
import type { SyncOutboxStore } from "../contracts.ts";

export type LocalOperation = "CREATE" | "UPDATE" | "DELETE";

export interface LocalMutationInput {
  deviceId: string;
  operation: LocalOperation;
  entity: CanonicalEntity;
  expectedEntityVersion: number;
  submissionId?: string;
  now?: Date;
}

export interface LocalMutationResult {
  envelope: MutationEnvelope;
  entity: CanonicalEntity;
}

/**
 * Apply a local mutation atomically: the canonical entity write and its outbox
 * entry are committed in a single transaction. If either fails, neither becomes
 * durable, so a partially-durable ambiguous state is impossible.
 */
export function applyLocalMutation(
  db: DatabaseSync,
  input: LocalMutationInput,
): LocalMutationResult {
  const entities = createEntityStore(db);
  const outbox = createOutboxStore(db);
  return transaction(db, () => apply(entities, outbox, input));
}

function apply(
  entities: CanonicalEntityStore,
  outbox: SyncOutboxStore,
  input: LocalMutationInput,
): LocalMutationResult {
  const now = input.now ?? new Date();
  const nowIso = now.toISOString();
  const { deviceId, operation, entity } = input;

  let persisted: CanonicalEntity;
  let opType: OperationType;

  if (operation === "CREATE") {
    if (input.expectedEntityVersion !== 0) {
      throw new Error("CREATE mutation requires expectedEntityVersion 0");
    }
    persisted = { ...entity, entity_version: 1, updated_at: nowIso };
    entities.upsert(persisted);
    opType = "CREATE";
  } else {
    const existing = entities.get(entity.entity_type, entity.id);
    if (!existing) {
      throw new Error(`entity not found: ${entity.entity_type}/${entity.id}`);
    }
    assertVersionMatch(input.expectedEntityVersion, existing.entity_version);
    if (operation === "DELETE") {
      persisted = {
        ...existing,
        deleted: true,
        entity_version: nextVersion(existing.entity_version),
        updated_at: nowIso,
      };
      entities.upsert(persisted);
      opType = "DELETE";
    } else {
      persisted = {
        ...entity,
        id: existing.id,
        entity_type: existing.entity_type,
        origin_device_id: existing.origin_device_id,
        created_at: existing.created_at,
        entity_version: nextVersion(existing.entity_version),
        updated_at: nowIso,
      } as CanonicalEntity;
      entities.upsert(persisted);
      opType = "UPDATE";
    }
  }

  const payload = opType === "DELETE" ? { entity_type: entity.entity_type, entity_id: entity.id } : persisted;
  const envelope = buildEnvelope({
    submission_id: input.submissionId,
    device_id: deviceId,
    entity_type: entity.entity_type,
    entity_id: entity.id,
    operation_type: opType,
    expected_entity_version: input.expectedEntityVersion,
    payload,
    created_at: nowIso,
  });

  outbox.enqueue(envelope);
  return { envelope, entity: persisted };
}