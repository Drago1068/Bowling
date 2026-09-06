/**
 * Explicit push-command outcomes. There is no generic success/failure; each
 * outcome carries enough information for deterministic mobile behavior.
 */

export type PushStatus =
  | "ACCEPTED"
  | "ALREADY_ACCEPTED"
  | "CONFLICT"
  | "REJECTED"
  | "UNSUPPORTED_PROTOCOL"
  | "UNSUPPORTED_SCHEMA";

export interface AcceptedResult {
  status: "ACCEPTED";
  submission_id: string;
  entity_id: string;
  entity_version: number;
  server_change_cursor: number;
  server_committed_at: string;
}

export interface AlreadyAcceptedResult {
  status: "ALREADY_ACCEPTED";
  submission_id: string;
  entity_id: string;
  entity_version: number;
  server_change_cursor: number;
  server_committed_at: string;
}

export interface ConflictResult {
  status: "CONFLICT";
  conflict_id: string;
  submission_id: string;
  entity_id: string;
  canonical_entity_version: number;
  expected_entity_version: number;
}

export interface RejectedResult {
  status: "REJECTED";
  reason_code: string;
  message: string;
  submission_id: string | null;
}

export interface UnsupportedProtocolResult {
  status: "UNSUPPORTED_PROTOCOL";
  supported: number;
  received: number;
}

export interface UnsupportedSchemaResult {
  status: "UNSUPPORTED_SCHEMA";
  entity_type: string;
  supported: number[];
  received: number;
}

export type PushResult =
  | AcceptedResult
  | AlreadyAcceptedResult
  | ConflictResult
  | RejectedResult
  | UnsupportedProtocolResult
  | UnsupportedSchemaResult;

/** Stable machine-readable rejection reason codes. */
export const REASON_CODES = {
  INVALID_UUID: "INVALID_UUID",
  UNKNOWN_ENTITY_TYPE: "UNKNOWN_ENTITY_TYPE",
  UNKNOWN_OPERATION: "UNKNOWN_OPERATION",
  INVALID_VERSION: "INVALID_VERSION",
  INVALID_EXPECTED_VERSION: "INVALID_EXPECTED_VERSION",
  MISSING_METADATA: "MISSING_METADATA",
  IMMUTABLE_FIELD_CHANGED: "IMMUTABLE_FIELD_CHANGED",
  ENTITY_ID_MISMATCH: "ENTITY_ID_MISMATCH",
  ENTITY_TYPE_MISMATCH: "ENTITY_TYPE_MISMATCH",
  ENTITY_NOT_FOUND: "ENTITY_NOT_FOUND",
  PAYLOAD_HASH_MISMATCH: "PAYLOAD_HASH_MISMATCH",
  MALFORMED_PAYLOAD: "MALFORMED_PAYLOAD",
  INVALID_CORRECTION: "INVALID_CORRECTION",
  INVALID_BOWLING_FACTS: "INVALID_BOWLING_FACTS",
  SUBMISSION_ID_COLLISION: "SUBMISSION_ID_COLLISION",
  INTERNAL_ERROR: "INTERNAL_ERROR",
} as const;

export type ReasonCode = (typeof REASON_CODES)[keyof typeof REASON_CODES];