import type { EntityType } from "../entities.ts";
import { uuidv7 } from "../identity/uuidv7.ts";
import { canonicalize, hashCanonicalJson, hashPayload } from "./hashing.ts";

/** Version of the mutation-envelope wire/durability format. */
export const SYNC_PROTOCOL_VERSION = 1;

/**
 * Mutation operation types.
 *
 * `expected_entity_version` semantics:
 *   CREATE  -> the version before the entity exists (conventionally 0).
 *   UPDATE  -> the entity_version the mutation is based on.
 *   DELETE  -> the entity_version being archived.
 *   CORRECT -> the prior_entity_version being corrected (see Correction).
 */
export const OPERATION_TYPES = ["CREATE", "UPDATE", "DELETE", "CORRECT"] as const;
export type OperationType = (typeof OPERATION_TYPES)[number];

/**
 * Versioned canonical mutation envelope.
 *
 * `submission_id` is globally unique and generated client-side. The SAME
 * logical mutation MUST retain the SAME `submission_id` across retries;
 * producing a new id on retry would break idempotent reconciliation.
 */
export interface MutationEnvelope {
  protocol_version: number;
  submission_id: string;
  device_id: string;
  entity_type: EntityType;
  entity_id: string;
  operation_type: OperationType;
  expected_entity_version: number;
  payload: unknown;
  payload_hash: string;
  created_at: string;
}

export interface EnvelopeOptions {
  submission_id?: string;
  device_id: string;
  entity_type: EntityType;
  entity_id: string;
  operation_type: OperationType;
  expected_entity_version: number;
  payload: unknown;
  created_at?: string;
  protocol_version?: number;
}

/**
 * Build a mutation envelope, generating a fresh submission_id when none is
 * supplied. Supplying an existing submission_id (e.g. on retry) preserves
 * identity and yields the same payload_hash for an unchanged payload.
 */
export function buildEnvelope(options: EnvelopeOptions): MutationEnvelope {
  const submission_id = options.submission_id ?? uuidv7();
  return {
    protocol_version: options.protocol_version ?? SYNC_PROTOCOL_VERSION,
    submission_id,
    device_id: options.device_id,
    entity_type: options.entity_type,
    entity_id: options.entity_id,
    operation_type: options.operation_type,
    expected_entity_version: options.expected_entity_version,
    payload: options.payload,
    payload_hash: hashPayload(options.payload),
    created_at: options.created_at ?? new Date().toISOString(),
  };
}

/** Recompute the canonical hash of an envelope's payload. */
export function hashEnvelopePayload(envelope: MutationEnvelope): string {
  return hashPayload(envelope.payload);
}

/** True if the stored payload_hash matches the payload's canonical hash. */
export function verifyEnvelopeHash(envelope: MutationEnvelope): boolean {
  return envelope.payload_hash === hashCanonicalJson(canonicalize(envelope.payload));
}