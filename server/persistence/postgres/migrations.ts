import type { Pool, PoolClient } from "pg";

export interface Migration {
  version: number;
  name: string;
  sql: string;
}

const V001 = `
CREATE TABLE canonical_entities (
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  schema_version INTEGER NOT NULL,
  entity_version INTEGER NOT NULL CHECK (entity_version >= 1),
  origin_device_id UUID NOT NULL,
  data_quality TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL,
  archived BOOLEAN NOT NULL DEFAULT FALSE,
  payload JSONB NOT NULL,
  payload_hash TEXT NOT NULL,
  PRIMARY KEY (entity_type, entity_id)
);

CREATE TABLE devices (
  device_id UUID PRIMARY KEY,
  first_seen_at TIMESTAMPTZ NOT NULL,
  last_seen_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'SEEN'
);

CREATE TABLE submission_idempotency (
  submission_id UUID PRIMARY KEY,
  device_id UUID NOT NULL,
  payload_hash TEXT NOT NULL,
  operation_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  received_at TIMESTAMPTZ NOT NULL,
  result_status TEXT NOT NULL,
  result_entity_version INTEGER,
  result_change_cursor BIGINT,
  result_committed_at TIMESTAMPTZ,
  result_payload JSONB
);

CREATE TABLE sync_conflicts (
  conflict_id UUID PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  submission_id UUID NOT NULL,
  device_id UUID NOT NULL,
  expected_entity_version INTEGER NOT NULL,
  canonical_entity_version INTEGER NOT NULL,
  incoming_payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL,
  resolution_status TEXT NOT NULL DEFAULT 'OPEN'
);

CREATE TABLE audit_log (
  audit_id UUID PRIMARY KEY,
  happened_at TIMESTAMPTZ NOT NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id UUID,
  submission_id UUID,
  outcome TEXT NOT NULL,
  prior_version INTEGER,
  result_version INTEGER,
  metadata JSONB
);

CREATE TABLE change_feed (
  change_seq BIGSERIAL PRIMARY KEY,
  entity_type TEXT NOT NULL,
  entity_id UUID NOT NULL,
  entity_version INTEGER NOT NULL,
  operation TEXT NOT NULL,
  submission_id UUID NOT NULL,
  committed_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX idx_change_feed_seq ON change_feed(change_seq);
CREATE INDEX idx_conflicts_entity ON sync_conflicts(entity_type, entity_id);
CREATE INDEX idx_idempotency_entity ON submission_idempotency(entity_type, entity_id);
`;

export const MIGRATIONS: readonly Migration[] = [
  { version: 1, name: "sync_foundation", sql: V001 },
];

export async function runMigrations(pool: Pool): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
         version INTEGER PRIMARY KEY,
         name TEXT NOT NULL,
         applied_at TIMESTAMPTZ NOT NULL
       )`,
    );
    const { rows } = await client.query<{ version: number }>(
      "SELECT version FROM schema_migrations",
    );
    const applied = new Set(rows.map((r) => r.version));
    for (const m of MIGRATIONS) {
      if (applied.has(m.version)) continue;
      await withClientTransaction(client, async () => {
        await client.query(m.sql);
        await client.query(
          "INSERT INTO schema_migrations (version, name, applied_at) VALUES ($1, $2, now())",
          [m.version, m.name],
        );
      });
    }
  } finally {
    client.release();
  }
}

export async function withClientTransaction<T>(
  client: PoolClient,
  fn: () => Promise<T>,
): Promise<T> {
  await client.query("BEGIN");
  try {
    const result = await fn();
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
}

export async function withTransaction<T>(
  pool: Pool,
  fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
  const client = await pool.connect();
  try {
    return await withClientTransaction(client, () => fn(client));
  } finally {
    client.release();
  }
}