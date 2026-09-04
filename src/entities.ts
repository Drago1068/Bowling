import type { EntityMetadata } from "./metadata.ts";
import type {
  UserId,
  BowlerProfileId,
  DeviceId,
  BowlingCenterId,
  LanePairId,
  BowlingSessionId,
  GameId,
  FrameId,
  RollId,
  PinStateId,
  PinLeaveId,
  BowlingBallId,
  BallUsageId,
  OilPatternId,
  DeliveryObservationId,
  CorrectionId,
} from "./identity/ids.ts";

/** Canonical entity kinds. Order is stable and used for serialization. */
export const ENTITY_TYPES = [
  "User",
  "BowlerProfile",
  "Device",
  "BowlingCenter",
  "LanePair",
  "BowlingSession",
  "Game",
  "Frame",
  "Roll",
  "PinState",
  "PinLeave",
  "BowlingBall",
  "BallUsage",
  "OilPattern",
  "DeliveryObservation",
  "Correction",
] as const;

export type EntityType = (typeof ENTITY_TYPES)[number];

export function isEntityType(value: unknown): value is EntityType {
  return (
    typeof value === "string" &&
    (ENTITY_TYPES as readonly string[]).includes(value)
  );
}

/*
 * Canonical entity definitions.
 *
 * Slice 1 establishes identity and canonical cross-references only. Product
 * semantics (scoring rules, recommendations, analytics) are intentionally OUT
 * of scope until a later authorized slice. Fields marked `| null` are genuinely
 * optional or not-yet-observed and MUST NOT be fabricated by any code path.
 */

export interface User extends EntityMetadata<UserId> {
  entity_type: "User";
}

export interface BowlerProfile extends EntityMetadata<BowlerProfileId> {
  entity_type: "BowlerProfile";
  user_id: UserId;
}

export interface Device extends EntityMetadata<DeviceId> {
  entity_type: "Device";
}

export interface BowlingCenter extends EntityMetadata<BowlingCenterId> {
  entity_type: "BowlingCenter";
  name: string | null;
}

export interface LanePair extends EntityMetadata<LanePairId> {
  entity_type: "LanePair";
  center_id: BowlingCenterId;
  lane_number: number | null;
}

export interface BowlingSession extends EntityMetadata<BowlingSessionId> {
  entity_type: "BowlingSession";
  bowler_profile_id: BowlerProfileId;
  center_id: BowlingCenterId | null;
  lane_pair_id: LanePairId | null;
  started_at: string | null;
}

export interface Game extends EntityMetadata<GameId> {
  entity_type: "Game";
  session_id: BowlingSessionId;
  bowler_profile_id: BowlerProfileId;
  game_number: number | null;
}

export interface Frame extends EntityMetadata<FrameId> {
  entity_type: "Frame";
  game_id: GameId;
  frame_number: number | null;
}

export interface Roll extends EntityMetadata<RollId> {
  entity_type: "Roll";
  frame_id: FrameId;
  roll_number: number | null;
  pinfall: number | null;
}

export interface PinState extends EntityMetadata<PinStateId> {
  entity_type: "PinState";
  roll_id: RollId;
  standing_pins: number[] | null;
}

export interface PinLeave extends EntityMetadata<PinLeaveId> {
  entity_type: "PinLeave";
  pin_state_id: PinStateId | null;
  arrangement: number[] | null;
}

export interface BowlingBall extends EntityMetadata<BowlingBallId> {
  entity_type: "BowlingBall";
  bowler_profile_id: BowlerProfileId;
  name: string | null;
}

export interface BallUsage extends EntityMetadata<BallUsageId> {
  entity_type: "BallUsage";
  ball_id: BowlingBallId;
  roll_id: RollId | null;
}

export interface OilPattern extends EntityMetadata<OilPatternId> {
  entity_type: "OilPattern";
  name: string | null;
}

export interface DeliveryObservation extends EntityMetadata<DeliveryObservationId> {
  entity_type: "DeliveryObservation";
  roll_id: RollId;
  ball_speed: number | null;
  rev_rate: number | null;
}

export interface Correction extends EntityMetadata<CorrectionId> {
  entity_type: "Correction";
  target_entity_type: EntityType;
  target_entity_id: string;
  prior_entity_version: number;
  /** Full corrected representation of the target entity. */
  corrected_representation: unknown;
  /** Optional structured delta describing what changed. */
  change: unknown;
  reason: string;
  actor: string;
}

/** The full canonical entity union. */
export type CanonicalEntity =
  | User
  | BowlerProfile
  | Device
  | BowlingCenter
  | LanePair
  | BowlingSession
  | Game
  | Frame
  | Roll
  | PinState
  | PinLeave
  | BowlingBall
  | BallUsage
  | OilPattern
  | DeliveryObservation
  | Correction;