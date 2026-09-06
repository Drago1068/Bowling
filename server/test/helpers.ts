import { hashPayload } from "../../src/sync/hashing.ts";
import { uuidv7 } from "../../src/identity/uuidv7.ts";
import { loadConfig } from "../config.ts";
import { buildApplication, type BowlingApplication } from "../application/app.ts";
import { nullLogger } from "../observability/logger.ts";
import { createPool } from "../persistence/postgres/pool.ts";

export function testConfig() {
  return loadConfig({
    DATABASE_URL: process.env.DATABASE_URL ?? "postgresql://bowling:bowling@127.0.0.1:55433/bowling",
  });
}

export async function makeApp(): Promise<BowlingApplication> {
  const app = buildApplication(testConfig(), nullLogger);
  await app.initialize();
  return app;
}

export async function truncateAll(): Promise<void> {
  const pool = createPool(testConfig());
  try {
    await pool.query(
      "TRUNCATE TABLE canonical_entities, devices, submission_idempotency, sync_conflicts, audit_log, change_feed RESTART IDENTITY CASCADE",
    );
  } finally {
    await pool.end();
  }
}

export function rollPayload(
  entityId: string,
  deviceId: string,
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  const now = new Date().toISOString();
  return {
    id: entityId,
    entity_type: "Roll",
    schema_version: 1,
    entity_version: 1,
    data_quality: "COMPLETE",
    origin_device_id: deviceId,
    created_at: now,
    updated_at: now,
    frame_id: uuidv7(),
    roll_number: 1,
    pinfall: 10,
    deleted: false,
    ...overrides,
  };
}

export interface RollCreate {
  request: {
    protocol_version: number;
    submission_id: string;
    device_id: string;
    entity_type: string;
    entity_id: string;
    operation_type: "CREATE";
    expected_entity_version: number;
    payload: Record<string, unknown>;
    payload_hash: string;
  };
  entity_id: string;
  device_id: string;
  submission_id: string;
  created_at: string;
}

export function makeRollCreate(deviceId: string = uuidv7()): RollCreate {
  const entityId = uuidv7();
  const submissionId = uuidv7();
  const payload = rollPayload(entityId, deviceId);
  return {
    entity_id: entityId,
    device_id: deviceId,
    submission_id: submissionId,
    created_at: payload.created_at as string,
    request: {
      protocol_version: 1,
      submission_id: submissionId,
      device_id: deviceId,
      entity_type: "Roll",
      entity_id: entityId,
      operation_type: "CREATE",
      expected_entity_version: 0,
      payload,
      payload_hash: hashPayload(payload),
    },
  };
}

export function makeRollUpdate(
  entityId: string,
  originDeviceId: string,
  createdAt: string,
  submittingDeviceId: string,
  pinfall: number,
  expectedVersion: number,
  submissionId: string = uuidv7(),
): Record<string, unknown> {
  const payload = rollPayload(entityId, originDeviceId, {
    created_at: createdAt,
    pinfall,
  });
  return {
    protocol_version: 1,
    submission_id: submissionId,
    device_id: submittingDeviceId,
    entity_type: "Roll",
    entity_id: entityId,
    operation_type: "UPDATE",
    expected_entity_version: expectedVersion,
    payload,
    payload_hash: hashPayload(payload),
  };
}

export function makeCorrection(
  entityId: string,
  priorVersion: number,
  deviceId: string,
  correctedPinfall: number,
  submissionId: string = uuidv7(),
): Record<string, unknown> {
  const correction = {
    id: uuidv7(),
    entity_type: "Correction",
    schema_version: 1,
    entity_version: 1,
    data_quality: "CORRECTED",
    origin_device_id: deviceId,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    target_entity_type: "Roll",
    target_entity_id: entityId,
    prior_entity_version: priorVersion,
    corrected_representation: { pinfall: correctedPinfall },
    change: { pinfall: { to: correctedPinfall } },
    reason: "recount",
    actor: "bowler",
  };
  return {
    protocol_version: 1,
    submission_id: submissionId,
    device_id: deviceId,
    entity_type: "Roll",
    entity_id: entityId,
    operation_type: "CORRECT",
    expected_entity_version: priorVersion,
    payload: correction,
    payload_hash: hashPayload(correction),
  };
}

export async function query<T extends Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const pool = createPool(testConfig());
  try {
    const { rows } = await pool.query(sql, params);
    return rows as T[];
  } finally {
    await pool.end();
  }
}

export function makeArchive(
  entityId: string,
  submittingDeviceId: string,
  expectedVersion: number,
  submissionId: string = uuidv7(),
): Record<string, unknown> {
  const payload = { entity_type: "Roll", entity_id: entityId };
  return {
    protocol_version: 1,
    submission_id: submissionId,
    device_id: submittingDeviceId,
    entity_type: "Roll",
    entity_id: entityId,
    operation_type: "DELETE",
    expected_entity_version: expectedVersion,
    payload,
    payload_hash: hashPayload(payload),
  };
}

export function makeFrameCreate(
  frameNumber: number,
  deviceId: string = uuidv7(),
): Record<string, unknown> {
  const entityId = uuidv7();
  const payload = {
    id: entityId,
    entity_type: "Frame",
    schema_version: 1,
    entity_version: 1,
    data_quality: "COMPLETE",
    origin_device_id: deviceId,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    game_id: uuidv7(),
    frame_number: frameNumber,
    deleted: false,
  };
  return {
    protocol_version: 1,
    submission_id: uuidv7(),
    device_id: deviceId,
    entity_type: "Frame",
    entity_id: entityId,
    operation_type: "CREATE",
    expected_entity_version: 0,
    payload,
    payload_hash: hashPayload(payload),
  };
}