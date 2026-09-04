import { DatabaseSync } from "node:sqlite";
import { MIGRATIONS } from "./migrations.ts";

/**
 * Open (or reopen) the SQLite database and apply pending migrations.
 * `:memory:` yields an in-process database (per-session); a filesystem path
 * yields a durable database that survives process restarts.
 */
export function openDatabase(filename: string = ":memory:"): DatabaseSync {
  const db = new DatabaseSync(filename);
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec("PRAGMA journal_mode = WAL;");
  migrate(db);
  return db;
}

function migrate(db: DatabaseSync): void {
  db.exec(
    "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)",
  );
  const applied = new Set<number>();
  const rows = db.prepare("SELECT version FROM schema_migrations").all();
  for (const row of rows as Array<{ version: number }>) {
    applied.add(row.version);
  }
  const insert = db.prepare(
    "INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)",
  );
  for (const migration of MIGRATIONS) {
    if (applied.has(migration.version)) continue;
    db.exec("BEGIN IMMEDIATE");
    try {
      db.exec(migration.sql);
      insert.run(migration.version, new Date().toISOString());
      db.exec("COMMIT");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  }
}

/**
 * Run `fn` inside a single SQLite transaction. On any throw the transaction is
 * rolled back so partial writes are never left durable. Synchronous by design
 * (node:sqlite); crash-safe via SQLite's WAL journal.
 */
export function transaction<T>(db: DatabaseSync, fn: () => T): T {
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    return result;
  } catch (err) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // Preserve the original error even if rollback itself fails.
    }
    throw err;
  }
}