/**
 * Portable domain + persistence surface.
 *
 * Safe for the mobile runtime: no `node:sqlite`, `node:crypto`, `node:fs`,
 * or other Node-only modules. Node tests import `src/index.ts`, which adds
 * the Node SQLite opener on top of this module.
 */
export type { DataQuality } from "./quality.ts";
export { DATA_QUALITY_VALUES, isDataQuality } from "./quality.ts";
export type { EntityMetadata } from "./metadata.ts";
export {
  INITIAL_SCHEMA_VERSION,
  INITIAL_ENTITY_VERSION,
  newEntityMetadata,
} from "./metadata.ts";
export {
  ENTITY_TYPES,
  isEntityType,
  type EntityType,
  type CanonicalEntity,
  type User,
  type BowlerProfile,
  type Device,
  type BowlingCenter,
  type LanePair,
  type BowlingSession,
  type Game,
  type Frame,
  type Roll,
  type PinState,
  type PinLeave,
  type BowlingBall,
  type BallUsage,
  type OilPattern,
  type DeliveryObservation,
  type Correction,
} from "./entities.ts";
export {
  initialVersion,
  nextVersion,
  isStale,
  assertVersionMatch,
  StaleEntityVersionError,
} from "./versioning.ts";
export {
  createCorrection,
  TargetEntityNotFoundError,
  DuplicateCorrectionError,
  type CorrectionOptions,
} from "./correction.ts";
export * from "./identity/index.ts";
export type { DeviceIdentity, DeviceIdentityStore } from "./identity/device.ts";
export { createDeviceIdentity } from "./identity/device.ts";
export * from "./sync/envelope.ts";
export * from "./sync/hashing.ts";
export * from "./sync/stateMachine.ts";
export {
  SYNC_PRESENTATION_STATUSES,
  deriveSyncPresentation,
  presentationForOutboxState,
  labelFor,
  type SyncPresentationStatus,
  type SyncPresentationSnapshot,
  type NetworkAvailability,
  type PresentationOptions,
} from "./sync/presentation.ts";
export * from "./persistence/contracts.ts";
export * from "./persistence/sqlite/index.ts";
export {
  initializeApplication,
  recoverFromOpenDatabase,
  STARTUP_STATUSES,
  type ApplicationInitResult,
  type SuccessfulInitResult,
  type FailedInitResult,
  type StartupStatus,
  type StartupFailureStatus,
  type InitializeOptions,
  type RecoveredDomainState,
} from "./persistence/startup.ts";
export {
  recoverAfterLifecycle,
  LIFECYCLE_EVENTS,
  type LifecycleEvent,
  type LifecycleRecoveryInput,
} from "./persistence/lifecycle.ts";
export { getSecureRandomBytes, assertSecureRandomAvailable } from "./platform/random.ts";
export { sha256Utf8Hex, sha256Bytes } from "./platform/sha256.ts";
