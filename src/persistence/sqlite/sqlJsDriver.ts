import type { SqliteDriver } from "./driver.ts";
import { createMobileSqliteDriver, type ExpoSqliteBinding } from "./mobileDriver.ts";

type BindValue = string | number | null | Uint8Array;

/**
 * Minimal sql.js Database surface. Defined structurally so this module never
 * imports the `sql.js` package (native must not depend on WASM).
 */
export interface SqlJsStatementLike {
  bind(params: BindValue[]): boolean | void;
  step(): boolean;
  getAsObject(): Record<string, unknown>;
  free(): void;
}

export interface SqlJsDatabaseLike {
  run(sql: string, params?: BindValue[]): void;
  prepare(sql: string): SqlJsStatementLike;
  exec(sql: string): Array<{ values: unknown[][] }>;
  getRowsModified(): number;
  export(): Uint8Array;
  close(): void;
}

export interface SqlJsDriverOptions {
  /** Called after a successful COMMIT or a non-transactional write. */
  persist?: () => void;
}

function lastInsertRowid(db: SqlJsDatabaseLike): number {
  const result = db.exec("SELECT last_insert_rowid() AS id");
  const value = result[0]?.values[0]?.[0];
  return typeof value === "number" ? value : Number(value ?? 0);
}

/**
 * sql.js adapter for the portable SqliteDriver contract.
 *
 * Preview/Node harnesses supply a sql.js Database. Native Expo must not import
 * this module.
 */
export function createSqlJsDriver(
  db: SqlJsDatabaseLike,
  options: SqlJsDriverOptions = {},
): SqliteDriver {
  let inTxn = false;
  const persistIfIdle = (): void => {
    if (!inTxn) options.persist?.();
  };

  const binding: ExpoSqliteBinding = {
    execSync(sql: string): void {
      db.run(sql);
      if (/^\s*BEGIN\b/i.test(sql)) {
        inTxn = true;
        return;
      }
      if (/^\s*ROLLBACK\b/i.test(sql)) {
        inTxn = false;
        return;
      }
      if (/^\s*COMMIT\b/i.test(sql)) {
        inTxn = false;
        options.persist?.();
        return;
      }
      persistIfIdle();
    },
    getFirstSync(sql: string, params: BindValue[] = []) {
      const stmt = db.prepare(sql);
      try {
        if (params.length > 0) stmt.bind(params);
        if (!stmt.step()) return null;
        return stmt.getAsObject();
      } finally {
        stmt.free();
      }
    },
    getAllSync(sql: string, params: BindValue[] = []) {
      const stmt = db.prepare(sql);
      try {
        if (params.length > 0) stmt.bind(params);
        const rows: Record<string, unknown>[] = [];
        while (stmt.step()) rows.push(stmt.getAsObject());
        return rows;
      } finally {
        stmt.free();
      }
    },
    runSync(sql: string, params: BindValue[] = []) {
      if (params.length > 0) db.run(sql, params);
      else db.run(sql);
      persistIfIdle();
      return {
        lastInsertRowid: lastInsertRowid(db),
        changes: db.getRowsModified(),
      };
    },
    closeSync(): void {
      options.persist?.();
      db.close();
    },
  };

  return createMobileSqliteDriver(binding);
}
