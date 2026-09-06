import type { EntityType } from "../../src/entities.ts";
import type { OperationType } from "../../src/sync/envelope.ts";

/**
 * Wire shape accepted by the push endpoint. `payload_hash` is client-supplied
 * and always recomputed server-side; it is never trusted.
 */
export interface PushRequest {
  protocol_version: number;
  submission_id: string;
  device_id: string;
  entity_type: EntityType;
  entity_id: string;
  operation_type: OperationType;
  expected_entity_version: number;
  payload: unknown;
  payload_hash: string;
}

/** The same request after server-side structural validation has passed. */
export type ValidatedPushRequest = PushRequest & { validated: true };

export type ValidationFailure =
  | { kind: "unsupported_protocol"; supported: number; received: number }
  | { kind: "unsupported_schema"; entity_type: string; supported: number[]; received: number }
  | { kind: "rejected"; reason_code: string; message: string; submission_id: string | null };

export type ValidationOutcome =
  | { ok: true; request: ValidatedPushRequest }
  | ({ ok: false } & ValidationFailure);