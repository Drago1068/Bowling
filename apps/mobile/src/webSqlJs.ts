import initSqlJs from "sql.js";
import { createSqlJsDriver } from "../../../src/persistence/sqlite/sqlJsDriver.ts";
import type { SqliteDriver } from "../../../src/portable.ts";

const STORAGE_KEY = "bowling-arch001.sqljs";

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Browser host for the portable sql.js adapter.
 * Native Expo must not import this module.
 */
export async function openWebSqlJsDatabase(): Promise<SqliteDriver> {
  const SQL = await initSqlJs({
    locateFile: () => "/sql-wasm.wasm",
  });
  const saved = globalThis.localStorage.getItem(STORAGE_KEY);
  const db = saved
    ? new SQL.Database(base64ToBytes(saved))
    : new SQL.Database();
  return createSqlJsDriver(db, {
    persist: () => {
      globalThis.localStorage.setItem(STORAGE_KEY, bytesToBase64(db.export()));
    },
  });
}
