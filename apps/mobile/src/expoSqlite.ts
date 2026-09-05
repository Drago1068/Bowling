import * as SQLite from "expo-sqlite";
import {
  createMobileSqliteDriver,
  type SqliteDriver,
  type SqliteRow,
  type SqliteValue,
} from "../../../src/portable.ts";

export const MOBILE_DATABASE_NAME = "bowling-arch001.db";

type ExpoBindValue = string | number | null | Uint8Array;

function toExpoParams(params: SqliteValue[] = []): ExpoBindValue[] {
  return params.map((value) => {
    if (typeof value === "bigint") return Number(value);
    return value;
  });
}

/** Native Expo SQLite adapter. File-backed unless name is `:memory:`. */
export function openExpoSqliteDriver(databaseName: string): SqliteDriver {
  const db = SQLite.openDatabaseSync(databaseName);
  return createMobileSqliteDriver({
    execSync(sql) {
      db.execSync(sql);
    },
    getFirstSync(sql, params = []) {
      const row = db.getFirstSync(sql, toExpoParams(params));
      return row ? (row as SqliteRow) : null;
    },
    getAllSync(sql, params = []) {
      return (db.getAllSync(sql, toExpoParams(params)) ?? []) as SqliteRow[];
    },
    runSync(sql, params = []) {
      const result = db.runSync(sql, toExpoParams(params));
      return {
        lastInsertRowid: result.lastInsertRowId,
        changes: result.changes,
      };
    },
    closeSync() {
      db.closeSync();
    },
  });
}

export function deleteExpoSqliteDatabase(databaseName: string): void {
  try {
    SQLite.deleteDatabaseSync(databaseName);
  } catch {
    // Missing files are not a failure.
  }
}
