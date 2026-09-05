import type { SqliteDriver } from "./driver.ts";
import type { PersistenceFaults } from "./faults.ts";
import {
  applyMigrations,
  type MigrateOptions,
  type MigrationOutcome,
} from "./migrate.ts";

/**
 * Apply the crash-safe SQLite pragmas required by ARCH-001 (foreign keys + WAL).
 * WAL is what makes a commit durable across process restart and forced
 * termination; it is not optional for the reopen/recovery contract.
 */
export function initializePragmas(driver: SqliteDriver): void {
  driver.exec("PRAGMA foreign_keys = ON;");
  driver.exec("PRAGMA journal_mode = WAL;");
}

/**
 * Open an already-constructed portable driver: pragmas then migrations.
 * Does not recreate the database on failure; the caller inspects the outcome.
 */
export function prepareDatabase(
  driver: SqliteDriver,
  migrateOptions?: MigrateOptions,
): MigrationOutcome {
  initializePragmas(driver);
  return applyMigrations(driver, migrateOptions);
}

/**
 * Run `fn` inside a single SQLite transaction. On any throw the transaction is
 * rolled back so partial writes are never left durable. Synchronous by design;
 * crash-safe via SQLite's WAL journal.
 *
 * The UI/application layer must not be told a mutation is durably saved until
 * this function returns successfully (COMMIT succeeded).
 */
export function transaction<T>(
  db: SqliteDriver,
  fn: () => T,
  faults?: PersistenceFaults,
): T {
  faults?.beforeBegin?.();
  db.exec("BEGIN IMMEDIATE");
  try {
    const result = fn();
    db.exec("COMMIT");
    faults?.afterCommit?.();
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
