import { uuidv7 } from "./uuidv7.ts";

/**
 * Branded ("newtype") identity wrappers.
 *
 * Canonical entity identities are UUIDv7 strings, but the domain distinguishes
 * them by entity kind so a GameId cannot silently be used where a UserId is
 * required. The brand is erased at runtime: a branded id serializes as its
 * underlying string and survives JSON round-trips unchanged.
 */
declare const idBrand: unique symbol;
export type Branded<T, B> = T & { readonly [idBrand]: B };

export type UserId = Branded<string, "User">;
export type BowlerProfileId = Branded<string, "BowlerProfile">;
export type DeviceId = Branded<string, "Device">;
export type BowlingCenterId = Branded<string, "BowlingCenter">;
export type LanePairId = Branded<string, "LanePair">;
export type BowlingSessionId = Branded<string, "BowlingSession">;
export type GameId = Branded<string, "Game">;
export type FrameId = Branded<string, "Frame">;
export type RollId = Branded<string, "Roll">;
export type PinStateId = Branded<string, "PinState">;
export type PinLeaveId = Branded<string, "PinLeave">;
export type BowlingBallId = Branded<string, "BowlingBall">;
export type BallUsageId = Branded<string, "BallUsage">;
export type OilPatternId = Branded<string, "OilPattern">;
export type DeliveryObservationId = Branded<string, "DeliveryObservation">;
export type CorrectionId = Branded<string, "Correction">;

/**
 * Generate a brand-new, offline-generatable canonical identity for an entity.
 * The brand is a compile-time-only tag; no runtime metadata is attached.
 */
export function newUserId(nowMs?: number): UserId {
  return uuidv7(nowMs) as UserId;
}
export function newBowlerProfileId(nowMs?: number): BowlerProfileId {
  return uuidv7(nowMs) as BowlerProfileId;
}
export function newDeviceId(nowMs?: number): DeviceId {
  return uuidv7(nowMs) as DeviceId;
}
export function newBowlingCenterId(nowMs?: number): BowlingCenterId {
  return uuidv7(nowMs) as BowlingCenterId;
}
export function newLanePairId(nowMs?: number): LanePairId {
  return uuidv7(nowMs) as LanePairId;
}
export function newBowlingSessionId(nowMs?: number): BowlingSessionId {
  return uuidv7(nowMs) as BowlingSessionId;
}
export function newGameId(nowMs?: number): GameId {
  return uuidv7(nowMs) as GameId;
}
export function newFrameId(nowMs?: number): FrameId {
  return uuidv7(nowMs) as FrameId;
}
export function newRollId(nowMs?: number): RollId {
  return uuidv7(nowMs) as RollId;
}
export function newPinStateId(nowMs?: number): PinStateId {
  return uuidv7(nowMs) as PinStateId;
}
export function newPinLeaveId(nowMs?: number): PinLeaveId {
  return uuidv7(nowMs) as PinLeaveId;
}
export function newBowlingBallId(nowMs?: number): BowlingBallId {
  return uuidv7(nowMs) as BowlingBallId;
}
export function newBallUsageId(nowMs?: number): BallUsageId {
  return uuidv7(nowMs) as BallUsageId;
}
export function newOilPatternId(nowMs?: number): OilPatternId {
  return uuidv7(nowMs) as OilPatternId;
}
export function newDeliveryObservationId(nowMs?: number): DeliveryObservationId {
  return uuidv7(nowMs) as DeliveryObservationId;
}
export function newCorrectionId(nowMs?: number): CorrectionId {
  return uuidv7(nowMs) as CorrectionId;
}