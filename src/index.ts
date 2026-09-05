/**
 * Node entry. Re-exports the portable domain and the Node SQLite opener used
 * by existing tests (`openDatabase`). The mobile runtime must import
 * `src/portable.ts` instead of this file.
 */
export * from "./portable.ts";
export { openDatabase } from "./persistence/sqlite/nodeDatabase.ts";
export { createNodeSqliteDriver } from "./persistence/sqlite/nodeDriver.ts";
