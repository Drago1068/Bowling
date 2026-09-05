import { DatabaseSync } from "node:sqlite";
import type {
  SqliteDriver,
  SqliteRow,
  SqliteRunResult,
  SqliteStatement,
  SqliteValue,
} from "./driver.ts";

/**
 * Node test/reference adapter.
 *
 * Binds `node:sqlite` behind the portable `SqliteDriver` contract. This module
 * is Node-only: the mobile runtime must never import it.
 */
export function createNodeSqliteDriver(filename: string): SqliteDriver {
  const db = new DatabaseSync(filename);
  return {
    exec(sql: string): void {
      db.exec(sql);
    },
    prepare(sql: string): SqliteStatement {
      const stmt = db.prepare(sql);
      return {
        get(...params: SqliteValue[]): SqliteRow | undefined {
          const row = stmt.get(...params);
          return row === undefined || row === null
            ? undefined
            : (row as SqliteRow);
        },
        all(...params: SqliteValue[]): SqliteRow[] {
          return stmt.all(...params) as SqliteRow[];
        },
        run(...params: SqliteValue[]): SqliteRunResult {
          const result = stmt.run(...params);
          return {
            lastInsertRowid: result.lastInsertRowid,
            changes: Number(result.changes),
          };
        },
      };
    },
    close(): void {
      db.close();
    },
  };
}
