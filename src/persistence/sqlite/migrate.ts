import type { SqliteDriver } from "./driver.ts";
import { MIGRATIONS, type Migration } from "./migrations.ts";

export { MIGRATIONS, type Migration };

export const CURRENT_SCHEMA_VERSION = MIGRATIONS.reduce(
  (max, m) => (m.version > max ? m.version : max),
  0,
);

export type MigrationFailureCode =
  | "DATABASE_MIGRATION_FAILED"
  | "UNSUPPORTED_SCHEMA";

export type MigrationOutcome =
  | {
      ok: true;
      schemaVersion: number;
      appliedVersions: number[];
      initializedEmptySchema: boolean;
    }
  | {
      ok: false;
      code: MigrationFailureCode;
      message: string;
      schemaVersion: number | null;
      retainedExistingDatabase: true;
    };

export interface MigrateOptions {
  /** Override the migration set (tests). Production uses MIGRATIONS. */
  migrations?: readonly Migration[];
  /** Invoked immediately before applying a given version; may throw. */
  beforeMigration?: (version: number) => void;
}

function ensureMigrationTable(driver: SqliteDriver): void {
  driver.exec(
    "CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL)",
  );
}

function readAppliedVersions(driver: SqliteDriver): number[] {
  ensureMigrationTable(driver);
  const rows = driver.prepare("SELECT version FROM schema_migrations ORDER BY version").all();
  return rows.map((row) => Number(row.version));
}

/** Highest applied schema version, or 0 when the database has no migrations yet. */
export function readSchemaVersion(driver: SqliteDriver): number {
  try {
    const applied = readAppliedVersions(driver);
    return applied.reduce((max, v) => (v > max ? v : max), 0);
  } catch {
    return 0;
  }
}

/**
 * Apply pending migrations. Never drops or recreates the database.
 *
 * A failing migration rolls back only that migration's transaction. Previously
 * applied schema and user data are retained. Retrying is safe: applied
 * versions are skipped, and a failed version is attempted again from scratch.
 */
export function applyMigrations(
  driver: SqliteDriver,
  options: MigrateOptions = {},
): MigrationOutcome {
  const migrations = options.migrations ?? MIGRATIONS;
  const knownMax = migrations.reduce((max, m) => (m.version > max ? m.version : max), 0);

  let applied: number[];
  try {
    applied = readAppliedVersions(driver);
  } catch (err) {
    return {
      ok: false,
      code: "DATABASE_MIGRATION_FAILED",
      message: `unable to read schema_migrations: ${err instanceof Error ? err.message : String(err)}`,
      schemaVersion: null,
      retainedExistingDatabase: true,
    };
  }

  const appliedSet = new Set(applied);
  const current = applied.reduce((max, v) => (v > max ? v : max), 0);
  const initializedEmptySchema = applied.length === 0;

  if (current > knownMax) {
    return {
      ok: false,
      code: "UNSUPPORTED_SCHEMA",
      message: `database schema version ${current} is newer than supported version ${knownMax}`,
      schemaVersion: current,
      retainedExistingDatabase: true,
    };
  }

  const insert = driver.prepare(
    "INSERT INTO schema_migrations (version, applied_at) VALUES (?, ?)",
  );
  const newlyApplied: number[] = [];

  for (const migration of migrations) {
    if (appliedSet.has(migration.version)) continue;
    try {
      options.beforeMigration?.(migration.version);
      driver.exec("BEGIN IMMEDIATE");
      try {
        driver.exec(migration.sql);
        insert.run(migration.version, new Date().toISOString());
        driver.exec("COMMIT");
        newlyApplied.push(migration.version);
        appliedSet.add(migration.version);
      } catch (err) {
        try {
          driver.exec("ROLLBACK");
        } catch {
          // Preserve the original error even if rollback itself fails.
        }
        throw err;
      }
    } catch (err) {
      return {
        ok: false,
        code: "DATABASE_MIGRATION_FAILED",
        message: `migration ${migration.version} (${migration.name}) failed: ${err instanceof Error ? err.message : String(err)}`,
        schemaVersion: readSchemaVersion(driver),
        retainedExistingDatabase: true,
      };
    }
  }

  return {
    ok: true,
    schemaVersion: readSchemaVersion(driver),
    appliedVersions: newlyApplied,
    initializedEmptySchema,
  };
}
