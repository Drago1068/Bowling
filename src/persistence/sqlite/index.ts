export type { SqliteDriver, SqliteStatement, SqliteRunResult, SqliteRow, SqliteValue } from "./driver.ts";
export { createMobileSqliteDriver, type ExpoSqliteBinding } from "./mobileDriver.ts";
export { initializePragmas, prepareDatabase, transaction } from "./database.ts";
export {
  applyMigrations,
  readSchemaVersion,
  CURRENT_SCHEMA_VERSION,
  type MigrationOutcome,
  type MigrationFailureCode,
  type MigrateOptions,
} from "./migrate.ts";
export { MIGRATIONS, type Migration } from "./migrations.ts";
export { createEntityStore } from "./entityStore.ts";
export { createDeviceStore } from "./deviceStore.ts";
export { createOutboxStore } from "./outboxStore.ts";
export { createAppliedChangeStore } from "./appliedChangeStore.ts";
export { createCheckpointStore } from "./checkpointStore.ts";
export { createCorrectionStore } from "./correctionStore.ts";
export { createConflictStore } from "./conflictStore.ts";
export {
  applyLocalMutation,
  type LocalMutationInput,
  type LocalMutationResult,
  type LocalOperation,
} from "./localMutation.ts";
export {
  applyCorrection,
  type ApplyCorrectionInput,
  type ApplyCorrectionResult,
} from "./applyCorrection.ts";
export { injectedFailure, type PersistenceFaults } from "./faults.ts";
