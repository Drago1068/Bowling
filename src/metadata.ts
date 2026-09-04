import type { DataQuality } from "./quality.ts";

/**
 * Metadata common to every synchronized canonical entity.
 *
 * `entity_version` is the optimistic concurrency token. It is NOT a timestamp:
 * it is a monotonically increasing integer that increments exactly once per
 * accepted semantic mutation.
 */
export interface EntityMetadata<ID extends string = string> {
  id: ID;
  /** Version of the JSON schema/representation for this entity kind. */
  schema_version: number;
  /** Optimistic concurrency version; 1 on creation. */
  entity_version: number;
  /** ISO-8601 UTC creation timestamp. */
  created_at: string;
  /** ISO-8601 UTC last-update timestamp. */
  updated_at: string;
  /** Device that created/owns this entity (UUIDv7 device id). */
  origin_device_id: string;
  data_quality: DataQuality;
  /** Soft-archive marker. Presence/false means "active". */
  deleted?: boolean;
}

export const INITIAL_SCHEMA_VERSION = 1;
export const INITIAL_ENTITY_VERSION = 1;

export interface NewEntityMetadataOptions<ID extends string = string> {
  id: ID;
  origin_device_id: string;
  data_quality?: DataQuality;
  schema_version?: number;
  now?: Date;
}

/**
 * Build the initial metadata block for a brand-new canonical entity.
 * `entity_version` is always 1; `created_at` equals `updated_at`.
 */
export function newEntityMetadata<ID extends string = string>(
  options: NewEntityMetadataOptions<ID>,
): EntityMetadata<ID> {
  const now = options.now ?? new Date();
  const iso = now.toISOString();
  return {
    id: options.id,
    schema_version: options.schema_version ?? INITIAL_SCHEMA_VERSION,
    entity_version: INITIAL_ENTITY_VERSION,
    created_at: iso,
    updated_at: iso,
    origin_device_id: options.origin_device_id,
    data_quality: options.data_quality ?? "UNKNOWN",
  };
}