/**
 * Canonical data-quality semantics.
 *
 * Quality is recorded with each canonical entity and is never silently
 * upgraded: UNKNOWN remains a legitimate, first-class value, and no code may
 * manufacture bowling facts that were not actually observed.
 */
export const DATA_QUALITY_VALUES = [
  "COMPLETE",
  "PARTIAL",
  "CORRECTED",
  "INFERRED",
  "UNKNOWN",
] as const;

export type DataQuality = (typeof DATA_QUALITY_VALUES)[number];

export function isDataQuality(value: unknown): value is DataQuality {
  return (
    typeof value === "string" &&
    (DATA_QUALITY_VALUES as readonly string[]).includes(value)
  );
}