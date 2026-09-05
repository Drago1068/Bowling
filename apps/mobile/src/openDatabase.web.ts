import { openWebSqlJsDatabase } from "./webSqlJs.ts";
import type { SqliteDriver } from "../../../src/portable.ts";

export const MOBILE_DATABASE_NAME = "bowling-arch001.db";

/**
 * Web preview opener. Metro selects this file on web instead of
 * `openDatabase.ts`, so the native bundle never includes sql.js or WASM.
 */
export async function openMobileDatabase(): Promise<SqliteDriver> {
  return openWebSqlJsDatabase();
}
