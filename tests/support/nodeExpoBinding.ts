import { DatabaseSync } from "node:sqlite";
import {
  createMobileSqliteDriver,
  prepareDatabase,
  type ExpoSqliteBinding,
  type SqliteDriver,
  type SqliteRow,
  type SqliteValue,
} from "../../src/portable.ts";

/**
 * Expo-shaped synchronous SQLite facade backed by `node:sqlite`.
 *
 * Lets Node tests execute the mobile adapter mapping without importing
 * `expo-sqlite`. Observable SQL behavior is real SQLite; only the host API
 * shape is simulated.
 */
export function createNodeBackedExpoBinding(
  filename: string,
): ExpoSqliteBinding {
  const db = new DatabaseSync(filename);
  return {
    execSync(sql: string): void {
      db.exec(sql);
    },
    getFirstSync(
      sql: string,
      params: SqliteValue[] = [],
    ): SqliteRow | null {
      const row = db.prepare(sql).get(...params);
      return row === undefined || row === null ? null : (row as SqliteRow);
    },
    getAllSync(sql: string, params: SqliteValue[] = []): SqliteRow[] {
      return db.prepare(sql).all(...params) as SqliteRow[];
    },
    runSync(sql: string, params: SqliteValue[] = []) {
      const result = db.prepare(sql).run(...params);
      return {
        lastInsertRowid: result.lastInsertRowid,
        changes: Number(result.changes),
      };
    },
    closeSync(): void {
      db.close();
    },
  };
}

export function openMobileAdapterDatabase(
  filename: string = ":memory:",
): SqliteDriver {
  const driver = createMobileSqliteDriver(
    createNodeBackedExpoBinding(filename),
  );
  const outcome = prepareDatabase(driver);
  if (!outcome.ok) {
    driver.close();
    throw new Error(`${outcome.code}: ${outcome.message}`);
  }
  return driver;
}

export function openRawMobileAdapterDatabase(
  filename: string = ":memory:",
): SqliteDriver {
  return createMobileSqliteDriver(createNodeBackedExpoBinding(filename));
}
