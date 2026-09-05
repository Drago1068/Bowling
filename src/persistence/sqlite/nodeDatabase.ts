import { createNodeSqliteDriver } from "./nodeDriver.ts";
import { prepareDatabase } from "./database.ts";
import type { SqliteDriver } from "./driver.ts";

/**
 * Open (or reopen) the SQLite database and apply pending migrations.
 * `:memory:` yields an in-process database (per-session); a filesystem path
 * yields a durable database that survives process restarts.
 *
 * This is the Node public opener used by existing tests. It remains at the
 * portable `SqliteDriver` abstraction — tests must not reach through to
 * `node:sqlite`.
 */
export function openDatabase(filename: string = ":memory:"): SqliteDriver {
  const driver = createNodeSqliteDriver(filename);
  const outcome = prepareDatabase(driver);
  if (!outcome.ok) {
    driver.close();
    throw new Error(`${outcome.code}: ${outcome.message}`);
  }
  return driver;
}
