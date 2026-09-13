import { openExpoSqliteDriver, MOBILE_DATABASE_NAME } from "./expoSqlite.ts";
import type { SqliteDriver } from "../../../src/portable.ts";

export { MOBILE_DATABASE_NAME };

/**
 * Native database opener. This file is used on iOS/Android.
 * Web uses `openDatabase.web.ts` (sql.js) via Metro platform resolution.
 */
export function openMobileDatabase(
  options: { freshNativeConnection?: boolean } = {},
): SqliteDriver {
  return openExpoSqliteDriver(MOBILE_DATABASE_NAME, options);
}
