import { readFileSync, writeFileSync, existsSync, rmSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { createRequire } from "node:module";
import initSqlJs from "sql.js";
import { createSqlJsDriver } from "../../src/persistence/sqlite/sqlJsDriver.ts";
import { prepareDatabase } from "../../src/persistence/sqlite/database.ts";
import type { SqliteDriver } from "../../src/persistence/sqlite/driver.ts";

const require = createRequire(import.meta.url);

let sqlJsCtor: Awaited<ReturnType<typeof initSqlJs>> | null = null;

async function loadSqlJs() {
  if (sqlJsCtor) return sqlJsCtor;
  const wasmPath = require.resolve("sql.js/dist/sql-wasm.wasm");
  const wasmBinary = new Uint8Array(readFileSync(wasmPath)).buffer;
  sqlJsCtor = await initSqlJs({ wasmBinary });
  return sqlJsCtor;
}

function persistToFile(filename: string, bytes: Uint8Array): void {
  if (filename === ":memory:") return;
  mkdirSync(dirname(filename), { recursive: true });
  writeFileSync(filename, bytes);
}

/**
 * File-backed sql.js driver for Node conformance. Not used by native Expo.
 */
export async function openSqlJsDatabase(filename: string): Promise<SqliteDriver> {
  await loadSqlJs();
  return openSqlJsDatabaseSync(filename);
}

export function openSqlJsDatabaseSync(filename: string): SqliteDriver {
  if (!sqlJsCtor) {
    throw new Error("sql.js is not loaded; call loadSqlJs() first");
  }
  const existing =
    filename !== ":memory:" && existsSync(filename)
      ? readFileSync(filename)
      : undefined;
  const db = existing ? new sqlJsCtor.Database(existing) : new sqlJsCtor.Database();
  const driver = createSqlJsDriver(db, {
    persist: () => persistToFile(filename, db.export()),
  });
  const outcome = prepareDatabase(driver);
  if (!outcome.ok) {
    driver.close();
    throw new Error(`${outcome.code}: ${outcome.message}`);
  }
  return driver;
}

export function removeSqlJsDatabase(filename: string): void {
  if (filename === ":memory:") return;
  rmSync(filename, { force: true });
}

export { loadSqlJs };
