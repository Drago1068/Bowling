import type { Db } from "./pool.ts";

export interface CanonicalEntityRow {
  entity_type: string;
  entity_id: string;
  schema_version: number;
  entity_version: number;
  origin_device_id: string;
  data_quality: string;
  created_at: Date;
  updated_at: Date;
  archived: boolean;
  payload: Record<string, unknown>;
  payload_hash: string;
}

export interface IdempotencyRow {
  submission_id: string;
  device_id: string;
  payload_hash: string;
  operation_type: string;
  entity_type: string;
  entity_id: string;
  received_at: Date;
  result_status: string;
  result_entity_version: number | null;
  result_change_cursor: string | null;
  result_committed_at: Date | null;
  result_payload: Record<string, unknown> | null;
}

export interface ChangeFeedRow {
  change_seq: string;
  entity_type: string;
  entity_id: string;
  entity_version: number;
  operation: string;
  submission_id: string;
  committed_at: Date;
  payload: Record<string, unknown> | null;
  origin_device_id: string | null;
}

export interface InsertEntity {
  entity_type: string;
  entity_id: string;
  schema_version: number;
  entity_version: number;
  origin_device_id: string;
  data_quality: string;
  created_at: Date;
  updated_at: Date;
  archived: boolean;
  payload: Record<string, unknown>;
  payload_hash: string;
}

export interface InsertIdempotency {
  submission_id: string;
  device_id: string;
  payload_hash: string;
  operation_type: string;
  entity_type: string;
  entity_id: string;
  received_at: Date;
  result_status: string;
  result_entity_version: number | null;
  result_change_cursor: string | null;
  result_committed_at: Date | null;
  result_payload: Record<string, unknown> | null;
}

export interface InsertConflict {
  conflict_id: string;
  entity_type: string;
  entity_id: string;
  submission_id: string;
  device_id: string;
  expected_entity_version: number;
  canonical_entity_version: number;
  incoming_payload: Record<string, unknown>;
  created_at: Date;
  resolution_status: string;
}

export interface AuditRecord {
  audit_id: string;
  happened_at: Date;
  actor: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  submission_id: string | null;
  outcome: string;
  prior_version: number | null;
  result_version: number | null;
  metadata: Record<string, unknown> | null;
}

export interface ChangeRecord {
  entity_type: string;
  entity_id: string;
  entity_version: number;
  operation: string;
  submission_id: string;
  committed_at: Date;
}

function mapEntityRow(r: {
  [k: string]: unknown;
}): CanonicalEntityRow {
  return {
    entity_type: String(r.entity_type),
    entity_id: String(r.entity_id),
    schema_version: Number(r.schema_version),
    entity_version: Number(r.entity_version),
    origin_device_id: String(r.origin_device_id),
    data_quality: String(r.data_quality),
    created_at: r.created_at as Date,
    updated_at: r.updated_at as Date,
    archived: Boolean(r.archived),
    payload: (r.payload ?? {}) as Record<string, unknown>,
    payload_hash: String(r.payload_hash),
  };
}

export const entityRepo = {
  async get(db: Db, entityType: string, entityId: string): Promise<CanonicalEntityRow | null> {
    const { rows } = await db.query(
      "SELECT * FROM canonical_entities WHERE entity_type = $1 AND entity_id = $2",
      [entityType, entityId],
    );
    return rows[0] ? mapEntityRow(rows[0] as Record<string, unknown>) : null;
  },
  async getForUpdate(db: Db, entityType: string, entityId: string): Promise<CanonicalEntityRow | null> {
    const { rows } = await db.query(
      "SELECT * FROM canonical_entities WHERE entity_type = $1 AND entity_id = $2 FOR UPDATE",
      [entityType, entityId],
    );
    return rows[0] ? mapEntityRow(rows[0] as Record<string, unknown>) : null;
  },
  async insert(db: Db, e: InsertEntity): Promise<void> {
    await db.query(
      `INSERT INTO canonical_entities
         (entity_type, entity_id, schema_version, entity_version, origin_device_id,
          data_quality, created_at, updated_at, archived, payload, payload_hash)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        e.entity_type,
        e.entity_id,
        e.schema_version,
        e.entity_version,
        e.origin_device_id,
        e.data_quality,
        e.created_at,
        e.updated_at,
        e.archived,
        e.payload,
        e.payload_hash,
      ],
    );
  },
  async update(db: Db, e: InsertEntity): Promise<void> {
    await db.query(
      `UPDATE canonical_entities SET
         schema_version = $3, entity_version = $4, data_quality = $5,
         updated_at = $6, archived = $7, payload = $8, payload_hash = $9
       WHERE entity_type = $1 AND entity_id = $2`,
      [
        e.entity_type,
        e.entity_id,
        e.schema_version,
        e.entity_version,
        e.data_quality,
        e.updated_at,
        e.archived,
        e.payload,
        e.payload_hash,
      ],
    );
  },
};

export const idempotencyRepo = {
  async getForUpdate(db: Db, submissionId: string): Promise<IdempotencyRow | null> {
    const { rows } = await db.query(
      "SELECT * FROM submission_idempotency WHERE submission_id = $1 FOR UPDATE",
      [submissionId],
    );
    if (!rows[0]) return null;
    const r = rows[0] as Record<string, unknown>;
    return {
      submission_id: String(r.submission_id),
      device_id: String(r.device_id),
      payload_hash: String(r.payload_hash),
      operation_type: String(r.operation_type),
      entity_type: String(r.entity_type),
      entity_id: String(r.entity_id),
      received_at: r.received_at as Date,
      result_status: String(r.result_status),
      result_entity_version: r.result_entity_version === null ? null : Number(r.result_entity_version),
      result_change_cursor: r.result_change_cursor === null ? null : String(r.result_change_cursor),
      result_committed_at: r.result_committed_at === null ? null : (r.result_committed_at as Date),
      result_payload: (r.result_payload ?? null) as Record<string, unknown> | null,
    };
  },
  async insert(db: Db, x: InsertIdempotency): Promise<void> {
    await db.query(
      `INSERT INTO submission_idempotency
         (submission_id, device_id, payload_hash, operation_type, entity_type, entity_id,
          received_at, result_status, result_entity_version, result_change_cursor, result_committed_at, result_payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        x.submission_id,
        x.device_id,
        x.payload_hash,
        x.operation_type,
        x.entity_type,
        x.entity_id,
        x.received_at,
        x.result_status,
        x.result_entity_version,
        x.result_change_cursor,
        x.result_committed_at,
        x.result_payload,
      ],
    );
  },
};

export const deviceRepo = {
  async upsert(db: Db, deviceId: string, now: Date): Promise<void> {
    await db.query(
      `INSERT INTO devices (device_id, first_seen_at, last_seen_at, status)
       VALUES ($1, $2, $2, 'SEEN')
       ON CONFLICT (device_id) DO UPDATE SET last_seen_at = EXCLUDED.last_seen_at`,
      [deviceId, now],
    );
  },
};

export const conflictRepo = {
  async insert(db: Db, c: InsertConflict): Promise<void> {
    await db.query(
      `INSERT INTO sync_conflicts
         (conflict_id, entity_type, entity_id, submission_id, device_id,
          expected_entity_version, canonical_entity_version, incoming_payload,
          created_at, resolution_status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        c.conflict_id,
        c.entity_type,
        c.entity_id,
        c.submission_id,
        c.device_id,
        c.expected_entity_version,
        c.canonical_entity_version,
        c.incoming_payload,
        c.created_at,
        c.resolution_status,
      ],
    );
  },
};

export const auditRepo = {
  async insert(db: Db, a: AuditRecord): Promise<void> {
    await db.query(
      `INSERT INTO audit_log
         (audit_id, happened_at, actor, action, entity_type, entity_id, submission_id,
          outcome, prior_version, result_version, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        a.audit_id,
        a.happened_at,
        a.actor,
        a.action,
        a.entity_type,
        a.entity_id,
        a.submission_id,
        a.outcome,
        a.prior_version,
        a.result_version,
        a.metadata,
      ],
    );
  },
};

export const changeFeedRepo = {
  async insert(db: Db, c: ChangeRecord): Promise<number> {
    const { rows } = await db.query<{ change_seq: string }>(
      `INSERT INTO change_feed
         (entity_type, entity_id, entity_version, operation, submission_id, committed_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING change_seq`,
      [c.entity_type, c.entity_id, c.entity_version, c.operation, c.submission_id, c.committed_at],
    );
    return Number(rows[0]!.change_seq);
  },
  async listAfter(db: Db, afterCursor: number, limit: number): Promise<ChangeFeedRow[]> {
    const { rows } = await db.query(
      `SELECT cf.change_seq, cf.entity_type, cf.entity_id, cf.entity_version,
              cf.operation, cf.submission_id, cf.committed_at,
              ce.payload AS payload, ce.origin_device_id AS origin_device_id
       FROM change_feed cf
       LEFT JOIN canonical_entities ce
         ON ce.entity_type = cf.entity_type AND ce.entity_id = cf.entity_id
       WHERE cf.change_seq > $1 ORDER BY cf.change_seq ASC LIMIT $2`,
      [afterCursor, limit],
    );
    return (rows as Array<Record<string, unknown>>).map((r) => ({
      change_seq: String(r.change_seq),
      entity_type: String(r.entity_type),
      entity_id: String(r.entity_id),
      entity_version: Number(r.entity_version),
      operation: String(r.operation),
      submission_id: String(r.submission_id),
      committed_at: r.committed_at as Date,
      payload: (r.payload ?? null) as Record<string, unknown> | null,
      origin_device_id: (r.origin_device_id ?? null) as string | null,
    }));
  },
  async countAfter(db: Db, afterCursor: number): Promise<number> {
    const { rows } = await db.query<{ n: string }>(
      "SELECT count(*)::text AS n FROM change_feed WHERE change_seq > $1",
      [afterCursor],
    );
    return Number(rows[0]!.n);
  },
};