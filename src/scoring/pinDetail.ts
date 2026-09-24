/**
 * Pin-detail observation validation and reader applicability (ADR-007 / ADR-008).
 */
import type { PinState, Roll } from "../entities.ts";
import type { RollFact } from "./types.ts";

export type PinDetailApplicability =
  | "NOT_RECORDED"
  | "MISSING_DEPENDENCY"
  | "EFFECTIVE"
  | "STALE_DETAIL"
  | "INVALID_OBSERVATION"
  | "CONFLICTING_DETAIL"
  | "ARCHIVED";

export interface StandingPinsValidation {
  ok: boolean;
  message?: string;
}

const FULL_RACK = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] as const;

export function validateStandingPinsShape(
  standingPins: number[] | null | undefined,
): StandingPinsValidation {
  if (standingPins === null || standingPins === undefined) {
    return { ok: false, message: "standing_pins must be an array (null forbidden on write)" };
  }
  if (!Array.isArray(standingPins)) {
    return { ok: false, message: "standing_pins must be an array" };
  }
  const seen = new Set<number>();
  for (const pin of standingPins) {
    if (typeof pin !== "number" || !Number.isInteger(pin) || pin < 1 || pin > 10) {
      return { ok: false, message: "standing pins must be distinct integers 1..10" };
    }
    if (seen.has(pin)) {
      return { ok: false, message: "standing pins must be distinct" };
    }
    seen.add(pin);
  }
  return { ok: true };
}

/** Pins knocked down = priorStanding length - standing length when identities known. */
export function validateAgainstKnownPrior(
  priorStanding: readonly number[],
  standingAfter: readonly number[],
  pinfall: number,
): StandingPinsValidation {
  const prior = new Set(priorStanding);
  for (const p of standingAfter) {
    if (!prior.has(p)) {
      return { ok: false, message: "standing pins must be a subset of prior standing set" };
    }
  }
  const expectedPinfall = priorStanding.length - standingAfter.length;
  if (pinfall !== expectedPinfall) {
    return {
      ok: false,
      message: `pinfall ${pinfall} inconsistent with standing change (expected ${expectedPinfall})`,
    };
  }
  return { ok: true };
}

export function validateAgainstKnownCount(
  remainingCountBefore: number,
  standingAfter: readonly number[],
  pinfall: number,
): StandingPinsValidation {
  if (standingAfter.length > remainingCountBefore) {
    return { ok: false, message: "more standing pins than remaining count" };
  }
  if (pinfall + standingAfter.length !== remainingCountBefore) {
    return {
      ok: false,
      message: `pinfall ${pinfall} + standing ${standingAfter.length} != remaining ${remainingCountBefore}`,
    };
  }
  if (pinfall < 0 || pinfall > remainingCountBefore) {
    return { ok: false, message: "pinfall outside remaining count" };
  }
  return { ok: true };
}

/**
 * Derive pre-delivery remaining pin count for a roll from ordered facts
 * (ADR-003 / validate.ts tenth rules). Identities unknown unless prior PinState.
 */
export function remainingCountBeforeRoll(
  facts: readonly RollFact[],
  frameNumber: number,
  rollNumber: number,
): number | null {
  if (frameNumber >= 1 && frameNumber <= 9) {
    if (rollNumber === 1) return 10;
    if (rollNumber === 2) {
      const first = facts.find(
        (f) => f.frame_number === frameNumber && f.roll_number === 1,
      );
      if (!first || first.pinfall == null) return null;
      if (first.pinfall === 10) return null; // no second ball
      return 10 - first.pinfall;
    }
    return null;
  }
  if (frameNumber !== 10) return null;
  const r1 = facts.find((f) => f.frame_number === 10 && f.roll_number === 1);
  const r2 = facts.find((f) => f.frame_number === 10 && f.roll_number === 2);
  if (rollNumber === 1) return 10;
  if (rollNumber === 2) {
    if (!r1 || r1.pinfall == null) return null;
    return r1.pinfall === 10 ? 10 : 10 - r1.pinfall;
  }
  if (rollNumber === 3) {
    if (!r1 || !r2 || r1.pinfall == null || r2.pinfall == null) return null;
    if (r1.pinfall === 10 && r2.pinfall === 10) return 10;
    if (r1.pinfall === 10 && r2.pinfall < 10) return 10 - r2.pinfall;
    if (r1.pinfall < 10 && r1.pinfall + r2.pinfall === 10) return 10;
    return null;
  }
  return null;
}

export function fullRack(): number[] {
  return [...FULL_RACK];
}

export type CaptureRollFact = {
  frame_number: number;
  roll_number: number;
  pinfall: number;
  standing_pins: number[] | null;
  pin_detail_status?: string | null;
};

/**
 * Identity rack for graphical capture (selected = standing).
 * Fresh 10-pin racks use 1..10. Later balls use prior EFFECTIVE standing when known.
 * Returns null when only a remaining count is known (do not invent identities).
 */
export function resolveCaptureRack(
  facts: readonly CaptureRollFact[],
  frameNumber: number,
  rollNumber: number,
): number[] | null {
  const remaining = remainingCountBeforeRoll(
    facts.map((f) => ({
      entity_id: `${f.frame_number}-${f.roll_number}`,
      frame_number: f.frame_number,
      roll_number: f.roll_number,
      pinfall: f.pinfall,
      entity_version: 1,
    })),
    frameNumber,
    rollNumber,
  );
  if (remaining == null) return null;
  if (remaining === 10) return fullRack();
  if (rollNumber <= 1) return null;

  const prev = facts.find(
    (f) => f.frame_number === frameNumber && f.roll_number === rollNumber - 1,
  );
  if (!prev?.standing_pins) return null;
  const status = prev.pin_detail_status;
  if (status != null && status !== "EFFECTIVE") return null;
  return [...prev.standing_pins].sort((a, b) => a - b);
}

export function classifyPinDetail(input: {
  roll: Roll | null;
  pinState: PinState | null;
  competingActiveCount: number;
  rackOk: boolean | null;
}): PinDetailApplicability {
  if (input.competingActiveCount > 1) return "CONFLICTING_DETAIL";
  if (input.pinState?.deleted) return "ARCHIVED";
  if (!input.pinState) {
    return input.roll ? "NOT_RECORDED" : "MISSING_DEPENDENCY";
  }
  if (!input.roll) return "MISSING_DEPENDENCY";
  const basis = input.pinState.basis_roll_version;
  if (basis == null || !Number.isInteger(basis)) return "STALE_DETAIL";
  if (basis !== input.roll.entity_version) return "STALE_DETAIL";
  if (input.rackOk === false) return "INVALID_OBSERVATION";
  if (input.rackOk == null) return "MISSING_DEPENDENCY";
  return "EFFECTIVE";
}

export function validatePinDetailForSave(input: {
  pinfall: number;
  standingPins: number[];
  remainingCount: number | null;
  priorStanding: number[] | null;
}): StandingPinsValidation {
  const shape = validateStandingPinsShape(input.standingPins);
  if (!shape.ok) return shape;
  if (input.priorStanding) {
    return validateAgainstKnownPrior(
      input.priorStanding,
      input.standingPins,
      input.pinfall,
    );
  }
  if (input.remainingCount == null) {
    return { ok: false, message: "cannot validate pin detail: remaining rack unknown" };
  }
  return validateAgainstKnownCount(
    input.remainingCount,
    input.standingPins,
    input.pinfall,
  );
}
