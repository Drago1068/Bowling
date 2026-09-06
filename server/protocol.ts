import { SYNC_PROTOCOL_VERSION } from "../src/sync/envelope.ts";

/** Protocol/schema compatibility surface for the sync API. */
export const SERVER_SYNC_PROTOCOL_VERSION: number = SYNC_PROTOCOL_VERSION;

/** Canonical entity representation schema versions accepted by this server. */
export const SUPPORTED_SCHEMA_VERSIONS: readonly number[] = [1];

export function isSupportedSchemaVersion(version: number): boolean {
  return SUPPORTED_SCHEMA_VERSIONS.includes(version);
}

export function isSupportedProtocolVersion(version: number): boolean {
  return version === SERVER_SYNC_PROTOCOL_VERSION;
}