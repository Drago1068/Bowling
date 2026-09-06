import { isEntityType } from "../../src/entities.ts";
import { OPERATION_TYPES } from "../../src/sync/envelope.ts";
import { hashPayload } from "../../src/sync/hashing.ts";
import { isUuidv7 } from "../../src/identity/uuidv7.ts";
import { isDataQuality } from "../../src/quality.ts";
import {
  isSupportedProtocolVersion,
  isSupportedSchemaVersion,
  SUPPORTED_SCHEMA_VERSIONS,
} from "../protocol.ts";
import { REASON_CODES } from "../domain/outcomes.ts";
import type { PushRequest, ValidationOutcome } from "../domain/pushRequest.ts";

type PlainObj = { [key: string]: unknown };

function isPlainObj(value: unknown): value is PlainObj {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function reject(
  reason_code: string,
  message: string,
  submission_id: string | null,
): ValidationOutcome {
  return { ok: false, kind: "rejected", reason_code, message, submission_id };
}

function validateBowlingFacts(entity_type: string, payload: PlainObj): string | null {
  if (entity_type === "Roll") {
    if (payload.pinfall !== undefined && payload.pinfall !== null) {
      if (
        typeof payload.pinfall !== "number" ||
        !Number.isInteger(payload.pinfall) ||
        payload.pinfall < 0 ||
        payload.pinfall > 10
      ) {
        return "Roll.pinfall must be an integer 0..10 or null";
      }
    }
  }
  if (entity_type === "Frame") {
    if (payload.frame_number !== undefined && payload.frame_number !== null) {
      if (
        typeof payload.frame_number !== "number" ||
        !Number.isInteger(payload.frame_number) ||
        payload.frame_number < 1 ||
        payload.frame_number > 10
      ) {
        return "Frame.frame_number must be an integer 1..10 or null";
      }
    }
  }
  if (entity_type === "Game") {
    if (payload.game_number !== undefined && payload.game_number !== null) {
      if (
        typeof payload.game_number !== "number" ||
        !Number.isInteger(payload.game_number) ||
        payload.game_number < 1
      ) {
        return "Game.game_number must be a positive integer or null";
      }
    }
  }
  return null;
}

function validateSchemaVersion(payload: PlainObj): string | null {
  const sv = payload.schema_version;
  if (sv === undefined) return "missing schema_version";
  if (typeof sv !== "number" || !isSupportedSchemaVersion(sv)) {
    return `unsupported schema_version ${String(sv)}`;
  }
  return null;
}

export function validatePushRequest(raw: unknown): ValidationOutcome {
  if (!isPlainObj(raw)) {
    return reject(REASON_CODES.MALFORMED_PAYLOAD, "request body must be an object", null);
  }
  const req = raw as unknown as PushRequest;

  if (typeof req.protocol_version !== "number" || !isSupportedProtocolVersion(req.protocol_version)) {
    return {
      ok: false,
      kind: "unsupported_protocol",
      supported: 1,
      received: typeof req.protocol_version === "number" ? req.protocol_version : NaN,
    };
  }

  const sid = req.submission_id;
  const did = req.device_id;
  const eid = req.entity_id;
  if (typeof sid !== "string" || !isUuidv7(sid)) {
    return reject(REASON_CODES.INVALID_UUID, "submission_id must be a valid UUIDv7", typeof sid === "string" ? sid : null);
  }
  if (typeof did !== "string" || !isUuidv7(did)) {
    return reject(REASON_CODES.INVALID_UUID, "device_id must be a valid UUIDv7", sid);
  }
  if (typeof eid !== "string" || !isUuidv7(eid)) {
    return reject(REASON_CODES.INVALID_UUID, "entity_id must be a valid UUIDv7", sid);
  }

  if (typeof req.entity_type !== "string" || !isEntityType(req.entity_type)) {
    return reject(REASON_CODES.UNKNOWN_ENTITY_TYPE, `unknown entity_type ${String(req.entity_type)}`, sid);
  }
  if (typeof req.operation_type !== "string" || !(OPERATION_TYPES as readonly string[]).includes(req.operation_type)) {
    return reject(REASON_CODES.UNKNOWN_OPERATION, `unknown operation_type ${String(req.operation_type)}`, sid);
  }

  const exp = req.expected_entity_version;
  if (typeof exp !== "number" || !Number.isInteger(exp) || exp < 0) {
    return reject(REASON_CODES.INVALID_EXPECTED_VERSION, "expected_entity_version must be a non-negative integer", sid);
  }

  if (typeof req.payload_hash !== "string") {
    return reject(REASON_CODES.PAYLOAD_HASH_MISMATCH, "missing payload_hash", sid);
  }

  // Recompute independently; never trust the client hash.
  let recomputed: string;
  try {
    recomputed = hashPayload(req.payload);
  } catch {
    return reject(REASON_CODES.MALFORMED_PAYLOAD, "payload is not canonically serializable", sid);
  }
  if (recomputed !== req.payload_hash) {
    return reject(REASON_CODES.PAYLOAD_HASH_MISMATCH, "payload_hash does not match canonical payload", sid);
  }

  if (!isPlainObj(req.payload)) {
    return reject(REASON_CODES.MALFORMED_PAYLOAD, "payload must be an object", sid);
  }

  if (req.operation_type === "CORRECT") {
    return validateCorrection(req);
  }

  const p = req.payload;
  if (req.operation_type !== "DELETE") {
    const schemaIssue = validateSchemaVersion(p);
    if (schemaIssue) {
      if (typeof p.schema_version === "number") {
        return {
          ok: false,
          kind: "unsupported_schema",
          entity_type: req.entity_type,
          supported: [...SUPPORTED_SCHEMA_VERSIONS],
          received: p.schema_version as number,
        };
      }
      return reject(REASON_CODES.MISSING_METADATA, schemaIssue, sid);
    }
  }

  if (req.operation_type === "CREATE") {
    if (typeof p.data_quality !== "string" || !isDataQuality(p.data_quality)) {
      return reject(REASON_CODES.MISSING_METADATA, "CREATE payload must include a valid data_quality", sid);
    }
    if (typeof p.created_at !== "string") {
      return reject(REASON_CODES.MISSING_METADATA, "CREATE payload must include created_at", sid);
    }
    if (p.id !== undefined && p.id !== req.entity_id) {
      return reject(REASON_CODES.ENTITY_ID_MISMATCH, "payload id does not match request entity_id", sid);
    }
  }

  const bowlingIssue = validateBowlingFacts(req.entity_type, p);
  if (bowlingIssue) {
    return reject(REASON_CODES.INVALID_BOWLING_FACTS, bowlingIssue, sid);
  }

  return { ok: true, request: req as PushRequest & { validated: true } };
}

function validateCorrection(req: PushRequest): ValidationOutcome {
  const c = req.payload as PlainObj;
  const targetType = c.target_entity_type;
  const targetId = c.target_entity_id;
  const priorVersion = c.prior_entity_version;

  if (typeof targetType !== "string" || !isEntityType(targetType)) {
    return reject(REASON_CODES.INVALID_CORRECTION, "correction target_entity_type invalid", req.submission_id);
  }
  if (typeof targetId !== "string" || !isUuidv7(targetId)) {
    return reject(REASON_CODES.INVALID_CORRECTION, "correction target_entity_id invalid", req.submission_id);
  }
  if (targetId !== req.entity_id || targetType !== req.entity_type) {
    return reject(REASON_CODES.INVALID_CORRECTION, "correction target must match requested entity", req.submission_id);
  }
  if (typeof priorVersion !== "number" || !Number.isInteger(priorVersion) || priorVersion < 1) {
    return reject(REASON_CODES.INVALID_CORRECTION, "correction prior_entity_version invalid", req.submission_id);
  }
  if (c.corrected_representation === undefined) {
    return reject(REASON_CODES.INVALID_CORRECTION, "correction missing corrected_representation", req.submission_id);
  }
  if (priorVersion !== req.expected_entity_version) {
    return reject(REASON_CODES.INVALID_CORRECTION, "correction prior_entity_version must equal expected_entity_version", req.submission_id);
  }
  return { ok: true, request: req as PushRequest & { validated: true } };
}