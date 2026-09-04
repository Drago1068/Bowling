/**
 * SQLite baseline migrations. The TypeScript array is the authoritative source
 * of truth for the runtime schema; `migrations/001_baseline.sql` is a
 * human-readable copy for review and Cursor integration.
 */
export interface Migration {
  version: number;
  name: string;
  sql: string;
}

const V001_BASELINE = `
CREATE TABLE IF NOT EXISTS device_identity (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  device_id TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS canonical_entities (
  id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_version INTEGER NOT NULL,
  schema_version INTEGER NOT NULL,
  data_quality TEXT NOT NULL,
  origin_device_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  archived INTEGER NOT NULL DEFAULT 0,
  payload TEXT NOT NULL,
  PRIMARY KEY (entity_type, id)
);
CREATE INDEX IF NOT EXISTS idx_entities_created ON canonical_entities(created_at);

CREATE TABLE IF NOT EXISTS sync_outbox (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  submission_id TEXT NOT NULL UNIQUE,
  protocol_version INTEGER NOT NULL,
  device_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  operation_type TEXT NOT NULL,
  expected_entity_version INTEGER NOT NULL,
  payload TEXT NOT NULL,
  payload_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  state TEXT NOT NULL,
  submitted_at TEXT,
  last_error TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_outbox_state ON sync_outbox(state);

CREATE TABLE IF NOT EXISTS applied_changes (
  change_id TEXT PRIMARY KEY,
  device_id TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  entity_version INTEGER NOT NULL,
  payload_hash TEXT NOT NULL,
  applied_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_applied_entity ON applied_changes(entity_type, entity_id);

CREATE TABLE IF NOT EXISTS sync_checkpoint (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS corrections (
  id TEXT PRIMARY KEY,
  target_entity_type TEXT NOT NULL,
  target_entity_id TEXT NOT NULL,
  prior_entity_version INTEGER NOT NULL,
  corrected_representation TEXT NOT NULL,
  change TEXT,
  reason TEXT NOT NULL,
  actor TEXT NOT NULL,
  entity_version INTEGER NOT NULL,
  schema_version INTEGER NOT NULL,
  data_quality TEXT NOT NULL,
  origin_device_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_corrections_target ON corrections(target_entity_type, target_entity_id);
`;

export const MIGRATIONS: readonly Migration[] = [
  { version: 1, name: "baseline", sql: V001_BASELINE },
];