import type { Pool } from "pg";
import { hashPayload } from "../../src/sync/hashing.ts";
import { uuidv7 } from "../../src/identity/uuidv7.ts";
import { isDataQuality } from "../../src/quality.ts";
import type { ValidatedPushRequest } from "../domain/pushRequest.ts";
import type {
  AcceptedResult,
  ConflictResult,
  PushResult,
  RejectedResult,
} from "../domain/outcomes.ts";
import { REASON_CODES } from "../domain/outcomes.ts";
import { withTransaction } from "../persistence/postgres/migrations.ts";
import {
  auditRepo,
  changeFeedRepo,
  conflictRepo,
  deviceRepo,
  entityRepo,
  idempotencyRepo,
  type CanonicalEntityRow,
} from "../persistence/postgres/repositories.ts";
import type { Logger } from "../observability/logger.ts";
import { nullLogger } from "../observability/logger.ts";

type PlainObj = { [key: string]: unknown };
type Tx = import("pg").PoolClient;

function isRecord(v: unknown): v is PlainObj {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function iso(d: Date): string {
  return d.toISOString();
}

function replay(result_payload: PlainObj | null): PushResult {
  if (!result_payload) {
    return { status: "REJECTED", reason_code: REASON_CODES.INTERNAL_ERROR, message: "missing prior result", submission_id: null };
  }
  if (result_payload.status === "ACCEPTED" || result_payload.status === "ALREADY_ACCEPTED") {
    return {
      status: "ALREADY_ACCEPTED",
      submission_id: String(result_payload.submission_id),
      entity_id: String(result_payload.entity_id),
      entity_version: Number(result_payload.entity_version),
      server_change_cursor: Number(result_payload.server_change_cursor),
      server_committed_at: String(result_payload.server_committed_at),
    };
  }
  return result_payload as unknown as PushResult;
}

export interface PushContext {
  pool: Pool;
  logger?: Logger;
}

/**
 * Apply a single validated push command atomically: canonical write,
 * idempotency record, audit entry, and change-feed entry commit together.
 * Returns ACCEPTED only after all of that is durably committed.
 */
export async function executePush(ctx: PushContext, req: ValidatedPushRequest): Promise<PushResult> {
  const log = ctx.logger ?? nullLogger;
  return withTransaction(ctx.pool, async (tx): Promise<PushResult> => {
    const now = new Date();
    const incomingHash = hashPayload(req.payload);

    const existing = await idempotencyRepo.getForUpdate(tx, req.submission_id);
    if (existing) {
      if (existing.payload_hash === incomingHash) {
        const result = replay(existing.result_payload);
        log.info("submission_already_accepted", {
          submission_id: req.submission_id, device_id: req.device_id,
          entity_type: req.entity_type, entity_id: req.entity_id, outcome: result.status,
        });
        return result;
      }
      await auditRepo.insert(tx, {
        audit_id: uuidv7(), happened_at: now, actor: req.device_id, action: "push",
        entity_type: req.entity_type, entity_id: req.entity_id, submission_id: req.submission_id,
        outcome: "REJECTED", prior_version: null, result_version: null,
        metadata: { reason: REASON_CODES.SUBMISSION_ID_COLLISION, stored_hash: existing.payload_hash, incoming_hash: incomingHash },
      });
      log.warn("submission_id_collision", {
        submission_id: req.submission_id, device_id: req.device_id,
        entity_type: req.entity_type, entity_id: req.entity_id, outcome: "REJECTED",
      });
      return {
        status: "REJECTED", reason_code: REASON_CODES.SUBMISSION_ID_COLLISION,
        message: "submission_id reused with a different payload", submission_id: req.submission_id,
      };
    }

    await deviceRepo.upsert(tx, req.device_id, now);

    switch (req.operation_type) {
      case "CREATE":
        return applyCreate(tx, req, now, incomingHash, log);
      case "UPDATE":
        return applyUpdate(tx, req, now, incomingHash, log);
      case "CORRECT":
        return applyCorrect(tx, req, now, incomingHash, log);
      case "DELETE":
        return applyArchive(tx, req, now, incomingHash, log);
      default: {
        const r: RejectedResult = {
          status: "REJECTED", reason_code: REASON_CODES.UNKNOWN_OPERATION,
          message: "unsupported operation", submission_id: req.submission_id,
        };
        return r;
      }
    }
  });
}

function applyCreate(tx: Tx, req: ValidatedPushRequest, now: Date, incomingHash: string, log: Logger): Promise<PushResult> {
  return (async () => {
    const existing = await entityRepo.getForUpdate(tx, req.entity_type, req.entity_id);
    if (existing) {
      return recordConflict(tx, req, existing, now, incomingHash, log, "CREATE target already exists");
    }

    const payload = req.payload as PlainObj;
    const nowIso = iso(now);
    const fullPayload: PlainObj = {
      ...payload, id: req.entity_id, entity_type: req.entity_type,
      origin_device_id: req.device_id, schema_version: Number(payload.schema_version),
      entity_version: 1, data_quality: String(payload.data_quality),
      created_at: payload.created_at as string, updated_at: nowIso, deleted: false,
    };
    await entityRepo.insert(tx, {
      entity_type: req.entity_type, entity_id: req.entity_id,
      schema_version: Number(payload.schema_version), entity_version: 1,
      origin_device_id: req.device_id, data_quality: String(payload.data_quality),
      created_at: new Date(payload.created_at as string), updated_at: now,
      archived: false, payload: fullPayload, payload_hash: hashPayload(fullPayload),
    });
    await auditRepo.insert(tx, {
      audit_id: uuidv7(), happened_at: now, actor: req.device_id, action: "push",
      entity_type: req.entity_type, entity_id: req.entity_id, submission_id: req.submission_id,
      outcome: "ACCEPTED", prior_version: null, result_version: 1, metadata: null,
    });
    const result = await finalizeAcceptedTx(tx, req, now, 1, fullPayload, incomingHash);
    log.info("accepted", { submission_id: req.submission_id, device_id: req.device_id, entity_type: req.entity_type, entity_id: req.entity_id, entity_version: 1 });
    return result;
  })();
}

function applyUpdate(tx: Tx, req: ValidatedPushRequest, now: Date, incomingHash: string, log: Logger): Promise<PushResult> {
  return (async () => {
    const existing = await entityRepo.getForUpdate(tx, req.entity_type, req.entity_id);
    if (!existing) return rejectMissing(req, log);
    if (existing.entity_version !== req.expected_entity_version) {
      return recordConflict(tx, req, existing, now, incomingHash, log, "stale version");
    }
    const immutableIssue = checkImmutable(req.payload as PlainObj, existing, req);
    if (immutableIssue) {
      await auditRepo.insert(tx, {
        audit_id: uuidv7(), happened_at: now, actor: req.device_id, action: "push",
        entity_type: req.entity_type, entity_id: req.entity_id, submission_id: req.submission_id,
        outcome: "REJECTED", prior_version: existing.entity_version, result_version: null,
        metadata: { reason: immutableIssue },
      });
      return { status: "REJECTED", reason_code: REASON_CODES.IMMUTABLE_FIELD_CHANGED, message: immutableIssue, submission_id: req.submission_id } satisfies RejectedResult;
    }

    const payload = req.payload as PlainObj;
    const nextVersion = existing.entity_version + 1;
    const nowIso = iso(now);
    const fullPayload: PlainObj = {
      ...(existing.payload as PlainObj), ...payload,
      id: req.entity_id, entity_type: req.entity_type, origin_device_id: existing.origin_device_id,
      created_at: iso(existing.created_at), schema_version: Number(payload.schema_version),
      entity_version: nextVersion,
      data_quality: isDataQuality(payload.data_quality) ? payload.data_quality : existing.data_quality,
      updated_at: nowIso, deleted: existing.archived,
    };
    await entityRepo.update(tx, {
      entity_type: req.entity_type, entity_id: req.entity_id,
      schema_version: Number(fullPayload.schema_version), entity_version: nextVersion,
      origin_device_id: existing.origin_device_id, data_quality: String(fullPayload.data_quality),
      created_at: existing.created_at, updated_at: now, archived: existing.archived,
      payload: fullPayload, payload_hash: hashPayload(fullPayload),
    });
    await auditRepo.insert(tx, {
      audit_id: uuidv7(), happened_at: now, actor: req.device_id, action: "push",
      entity_type: req.entity_type, entity_id: req.entity_id, submission_id: req.submission_id,
      outcome: "ACCEPTED", prior_version: existing.entity_version, result_version: nextVersion, metadata: null,
    });
    const result = await finalizeAcceptedTx(tx, req, now, nextVersion, fullPayload, incomingHash);
    log.info("accepted", { submission_id: req.submission_id, device_id: req.device_id, entity_type: req.entity_type, entity_id: req.entity_id, entity_version: nextVersion });
    return result;
  })();
}

function applyCorrect(tx: Tx, req: ValidatedPushRequest, now: Date, incomingHash: string, log: Logger): Promise<PushResult> {
  return (async () => {
    const existing = await entityRepo.getForUpdate(tx, req.entity_type, req.entity_id);
    if (!existing) return rejectMissing(req, log);
    if (existing.entity_version !== req.expected_entity_version) {
      return recordConflict(tx, req, existing, now, incomingHash, log, "stale version");
    }
    const correction = req.payload as PlainObj;
    const corrected = isRecord(correction.corrected_representation) ? correction.corrected_representation : {};
    const nextVersion = existing.entity_version + 1;
    const nowIso = iso(now);
    const fullPayload: PlainObj = {
      ...(existing.payload as PlainObj), ...corrected,
      id: req.entity_id, entity_type: req.entity_type, origin_device_id: existing.origin_device_id,
      created_at: iso(existing.created_at),
      schema_version: Number((existing.payload as PlainObj).schema_version),
      entity_version: nextVersion, data_quality: "CORRECTED", updated_at: nowIso,
      deleted: existing.archived,
    };
    await entityRepo.update(tx, {
      entity_type: req.entity_type, entity_id: req.entity_id,
      schema_version: Number(fullPayload.schema_version), entity_version: nextVersion,
      origin_device_id: existing.origin_device_id, data_quality: "CORRECTED",
      created_at: existing.created_at, updated_at: now, archived: existing.archived,
      payload: fullPayload, payload_hash: hashPayload(fullPayload),
    });
    await auditRepo.insert(tx, {
      audit_id: uuidv7(), happened_at: now, actor: req.device_id, action: "CORRECT",
      entity_type: req.entity_type, entity_id: req.entity_id, submission_id: req.submission_id,
      outcome: "ACCEPTED", prior_version: existing.entity_version, result_version: nextVersion,
      metadata: { correction, corrected_representation: corrected, reason: correction.reason, actor: correction.actor },
    });
    const result = await finalizeAcceptedTx(tx, req, now, nextVersion, fullPayload, incomingHash);
    log.info("accepted", { submission_id: req.submission_id, device_id: req.device_id, entity_type: req.entity_type, entity_id: req.entity_id, entity_version: nextVersion, operation: "CORRECT" });
    return result;
  })();
}

function applyArchive(tx: Tx, req: ValidatedPushRequest, now: Date, incomingHash: string, log: Logger): Promise<PushResult> {
  return (async () => {
    const existing = await entityRepo.getForUpdate(tx, req.entity_type, req.entity_id);
    if (!existing) return rejectMissing(req, log);
    if (existing.entity_version !== req.expected_entity_version) {
      return recordConflict(tx, req, existing, now, incomingHash, log, "stale version");
    }
    const nextVersion = existing.entity_version + 1;
    const nowIso = iso(now);
    const fullPayload: PlainObj = {
      ...(existing.payload as PlainObj),
      id: existing.entity_id,
      entity_type: existing.entity_type,
      origin_device_id: existing.origin_device_id,
      created_at: iso(existing.created_at),
      entity_version: nextVersion,
      updated_at: nowIso,
      deleted: true,
    };
    await entityRepo.update(tx, {
      entity_type: req.entity_type, entity_id: req.entity_id,
      schema_version: existing.schema_version, entity_version: nextVersion,
      origin_device_id: existing.origin_device_id, data_quality: existing.data_quality,
      created_at: existing.created_at, updated_at: now, archived: true,
      payload: fullPayload, payload_hash: hashPayload(fullPayload),
    });
    await auditRepo.insert(tx, {
      audit_id: uuidv7(), happened_at: now, actor: req.device_id, action: "ARCHIVE",
      entity_type: req.entity_type, entity_id: req.entity_id, submission_id: req.submission_id,
      outcome: "ACCEPTED", prior_version: existing.entity_version, result_version: nextVersion, metadata: null,
    });
    const result = await finalizeAcceptedTx(tx, req, now, nextVersion, fullPayload, incomingHash);
    log.info("accepted", { submission_id: req.submission_id, device_id: req.device_id, entity_type: req.entity_type, entity_id: req.entity_id, entity_version: nextVersion, operation: "ARCHIVE" });
    return result;
  })();
}

function checkImmutable(payload: PlainObj, existing: CanonicalEntityRow, req: ValidatedPushRequest): string | null {
  if (payload.id !== undefined && payload.id !== req.entity_id) return "payload id does not match entity_id";
  if (payload.entity_type !== undefined && payload.entity_type !== existing.entity_type) return "entity_type is immutable";
  if (payload.origin_device_id !== undefined && payload.origin_device_id !== existing.origin_device_id) return "origin_device_id is immutable";
  if (payload.created_at !== undefined && payload.created_at !== iso(existing.created_at)) return "created_at is immutable";
  return null;
}

function rejectMissing(req: ValidatedPushRequest, log: Logger): RejectedResult {
  log.warn("rejected", { submission_id: req.submission_id, outcome: "REJECTED", reason: "target not found" });
  return { status: "REJECTED", reason_code: REASON_CODES.INVALID_CORRECTION, message: "target entity not found", submission_id: req.submission_id };
}

async function recordConflict(
  tx: Tx, req: ValidatedPushRequest, existing: CanonicalEntityRow,
  now: Date, incomingHash: string, log: Logger, reason: string,
): Promise<ConflictResult> {
  const conflictId = uuidv7();
  await conflictRepo.insert(tx, {
    conflict_id: conflictId, entity_type: req.entity_type, entity_id: req.entity_id,
    submission_id: req.submission_id, device_id: req.device_id,
    expected_entity_version: req.expected_entity_version, canonical_entity_version: existing.entity_version,
    incoming_payload: req.payload as PlainObj, created_at: now, resolution_status: "OPEN",
  });
  await auditRepo.insert(tx, {
    audit_id: uuidv7(), happened_at: now, actor: req.device_id, action: "push",
    entity_type: req.entity_type, entity_id: req.entity_id, submission_id: req.submission_id,
    outcome: "CONFLICT", prior_version: existing.entity_version, result_version: null,
    metadata: { reason },
  });
  const result: ConflictResult = {
    status: "CONFLICT", conflict_id: conflictId, submission_id: req.submission_id,
    entity_id: req.entity_id, canonical_entity_version: existing.entity_version,
    expected_entity_version: req.expected_entity_version,
  };
  await idempotencyRepo.insert(tx, {
    submission_id: req.submission_id, device_id: req.device_id,
    payload_hash: incomingHash, operation_type: req.operation_type,
    entity_type: req.entity_type, entity_id: req.entity_id, received_at: now,
    result_status: "CONFLICT", result_entity_version: existing.entity_version,
    result_change_cursor: null, result_committed_at: now,
    result_payload: result as unknown as PlainObj,
  });
  log.warn("conflict", { submission_id: req.submission_id, device_id: req.device_id, entity_type: req.entity_type, entity_id: req.entity_id, outcome: "CONFLICT" });
  return result;
}

async function finalizeAcceptedTx(
  tx: Tx, req: ValidatedPushRequest, now: Date, entityVersion: number,
  entityPayload: PlainObj, incomingHash: string,
): Promise<AcceptedResult> {
  const cursor = await changeFeedRepo.insert(tx, {
    entity_type: req.entity_type, entity_id: req.entity_id, entity_version: entityVersion,
    operation: req.operation_type, submission_id: req.submission_id, committed_at: now,
  });
  const result: AcceptedResult = {
    status: "ACCEPTED", submission_id: req.submission_id, entity_id: req.entity_id,
    entity_version: entityVersion, server_change_cursor: cursor, server_committed_at: iso(now),
  };
  await idempotencyRepo.insert(tx, {
    submission_id: req.submission_id, device_id: req.device_id, payload_hash: incomingHash,
    operation_type: req.operation_type, entity_type: req.entity_type, entity_id: req.entity_id,
    received_at: now, result_status: "ACCEPTED", result_entity_version: entityVersion,
    result_change_cursor: String(cursor), result_committed_at: now,
    result_payload: result as unknown as PlainObj,
  });
  return result;
}