/**
 * Portable SQLite driver boundary.
 *
 * This contract is platform-neutral: it must not grow Node-specific APIs
 * merely because `node:sqlite` exposes them. Node (tests/reference) and
 * React Native / Expo (mobile) each bind an adapter behind this interface.
 *
 * Observable semantics required by the domain:
 *   - positional `?` placeholders
 *   - `exec` for DDL and explicit BEGIN/COMMIT/ROLLBACK
 *   - prepared statements with get/all/run
 *   - `lastInsertRowid` after INSERT
 *   - `close` so file-backed databases can be reopened
 */
export type SqliteValue = null | number | string | bigint | Uint8Array;
export type SqliteRow = Record<string, unknown>;

export interface SqliteRunResult {
  lastInsertRowid: number | bigint;
  changes: number;
}

export interface SqliteStatement {
  get(...params: SqliteValue[]): SqliteRow | undefined;
  all(...params: SqliteValue[]): SqliteRow[];
  run(...params: SqliteValue[]): SqliteRunResult;
}

export interface SqliteDriver {
  exec(sql: string): void;
  prepare(sql: string): SqliteStatement;
  close(): void;
}
