/**
 * Shared PinState association precheck for partial unique index migrations.
 * Fail closed: throw without mutating offending rows.
 */
export class PinStateAssociationPrecheckError extends Error {
  readonly code = "PINSTATE_ASSOCIATION_PRECHECK_FAILED";
  constructor(message: string) {
    super(message);
    this.name = "PinStateAssociationPrecheckError";
  }
}

export interface ActivePinStateRow {
  id: string;
  archived: boolean | number;
  payload: unknown;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function standingPinsMalformed(value: unknown): boolean {
  if (value === null || value === undefined) return true;
  if (!Array.isArray(value)) return true;
  const seen = new Set<number>();
  for (const pin of value) {
    if (typeof pin !== "number" || !Number.isInteger(pin) || pin < 1 || pin > 10) {
      return true;
    }
    if (seen.has(pin)) return true;
    seen.add(pin);
  }
  return false;
}

/**
 * Validate active PinState rows before creating ux_pinstate_active_roll.
 * Does not delete, merge, or rewrite identities.
 */
export function assertActivePinStatesIndexable(
  rows: readonly ActivePinStateRow[],
): void {
  const active = rows.filter((r) => r.archived === false || r.archived === 0);
  const byRoll = new Map<string, string[]>();
  const problems: string[] = [];

  for (const row of active) {
    const payload = typeof row.payload === "string"
      ? (() => {
          try {
            return JSON.parse(row.payload);
          } catch {
            return null;
          }
        })()
      : row.payload;
    const obj = asRecord(payload);
    if (!obj) {
      problems.push(`PinState ${row.id}: malformed payload`);
      continue;
    }
    const rollId = obj.roll_id;
    if (typeof rollId !== "string" || rollId.length === 0) {
      problems.push(`PinState ${row.id}: missing/non-string roll_id`);
      continue;
    }
    if (standingPinsMalformed(obj.standing_pins)) {
      problems.push(`PinState ${row.id}: malformed standing_pins`);
    }
    const list = byRoll.get(rollId) ?? [];
    list.push(row.id);
    byRoll.set(rollId, list);
  }

  for (const [rollId, ids] of byRoll) {
    if (ids.length > 1) {
      problems.push(
        `duplicate active PinState for roll_id=${rollId}: ${ids.join(",")}`,
      );
    }
  }

  if (problems.length > 0) {
    throw new PinStateAssociationPrecheckError(
      `active PinState association precheck failed (${problems.length}): ${problems.join("; ")}`,
    );
  }
}
