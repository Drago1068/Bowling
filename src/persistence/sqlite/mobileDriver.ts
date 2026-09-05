import type {
  SqliteDriver,
  SqliteRow,
  SqliteRunResult,
  SqliteStatement,
  SqliteValue,
} from "./driver.ts";

/**
 * The subset of the Expo SQLite synchronous API this adapter depends on.
 *
 * Kept as an explicit binding so:
 *   - the mobile app can pass a real `expo-sqlite` database
 *   - Node conformance tests can pass an Expo-shaped facade over `node:sqlite`
 *     without importing `expo-sqlite` into the portable domain
 *
 * Required transaction semantics: the binding must honor `exec("BEGIN
 * IMMEDIATE")` / `COMMIT` / `ROLLBACK` against a single connection, matching
 * the portable driver. If a future Expo release cannot do that synchronously,
 * stop and file an architecture finding — do not silently switch to async
 * or to a non-transactional write path.
 */
export interface ExpoSqliteBinding {
  execSync(sql: string): void;
  getFirstSync(
    sql: string,
    params?: SqliteValue[],
  ): SqliteRow | null | undefined;
  getAllSync(sql: string, params?: SqliteValue[]): SqliteRow[];
  runSync(
    sql: string,
    params?: SqliteValue[],
  ): { lastInsertRowid: number | bigint; changes: number };
  closeSync(): void;
}

/**
 * React Native / Expo-compatible SQLite adapter satisfying `SqliteDriver`.
 *
 * Does not import `expo-sqlite` (or any Node builtin). The host runtime
 * supplies the binding.
 */
export function createMobileSqliteDriver(binding: ExpoSqliteBinding): SqliteDriver {
  return {
    exec(sql: string): void {
      binding.execSync(sql);
    },
    prepare(sql: string): SqliteStatement {
      return {
        get(...params: SqliteValue[]): SqliteRow | undefined {
          const row = binding.getFirstSync(sql, params);
          return row === undefined || row === null ? undefined : row;
        },
        all(...params: SqliteValue[]): SqliteRow[] {
          return binding.getAllSync(sql, params) ?? [];
        },
        run(...params: SqliteValue[]): SqliteRunResult {
          const result = binding.runSync(sql, params);
          return {
            lastInsertRowid: result.lastInsertRowid,
            changes: Number(result.changes),
          };
        },
      };
    },
    close(): void {
      binding.closeSync();
    },
  };
}
