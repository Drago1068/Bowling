import type { CanonicalEntity, PinState, Roll } from "../entities.ts";
import { createCorrection } from "../correction.ts";
import { newEntityMetadata } from "../metadata.ts";
import {
  newFrameId,
  newGameId,
  newPinStateId,
  newRollId,
  type GameId,
  type PinStateId,
  type RollId,
} from "../identity/ids.ts";
import { applyCorrection } from "../persistence/sqlite/applyCorrection.ts";
import {
  applyLocalMutation,
  applyLocalMutations,
} from "../persistence/sqlite/localMutation.ts";
import { createCorrectionStore } from "../persistence/sqlite/correctionStore.ts";
import { createConflictStore } from "../persistence/sqlite/conflictStore.ts";
import { createEntityStore } from "../persistence/sqlite/entityStore.ts";
import type { SqliteDriver } from "../persistence/sqlite/driver.ts";
import { deriveGame } from "./derive.ts";
import {
  classifyPinDetail,
  remainingCountBeforeRoll,
  validatePinDetailForSave,
  type PinDetailApplicability,
} from "./pinDetail.ts";
import { loadGameFacts } from "./store.ts";
import { FRAME_COUNT, type GameScores, type RollFact } from "./types.ts";
import { validateNextRoll } from "./validate.ts";

export interface RecordedRollView {
  entity_id: string;
  frame_number: number;
  roll_number: number;
  pinfall: number;
  entity_version: number;
  pin_state_id: string | null;
  standing_pins: number[] | null;
  basis_roll_version: number | null;
  pin_detail_status: PinDetailApplicability;
}

export interface NextRollSlot {
  frame_number: number;
  roll_number: number;
}

export interface ScoringView {
  gameId: string | null;
  gameMissing: boolean;
  sheet: GameScores | null;
  formatted: string;
  next: NextRollSlot | null;
  rolls: RecordedRollView[];
  correctionCount: number;
  canRecord: boolean;
  open_pin_detail_conflicts: number;
}

export interface GameHistoryEntry {
  id: string;
  created_at: string;
  label: string;
}

/** Enriched history row for home metrics / date grouping (derived; not stored). */
export interface GameHistoryDetail extends GameHistoryEntry {
  dateKey: string;
  status: "complete" | "active" | "repair";
  finalTotal: number | null;
  gameNumber: number;
  /** Derived count of recorded roll facts; 0 means the game holds no observations. */
  rollCount: number;
}

export type StandingDetailChoice =
  | { kind: "omit" }
  | { kind: "record"; standing_pins: number[] };

function meta(id: string, deviceId: string) {
  return newEntityMetadata({ id, origin_device_id: deviceId });
}

export function compareGamesNewestFirst(
  a: { id: string; created_at: string },
  b: { id: string; created_at: string },
): number {
  if (a.created_at !== b.created_at) {
    return a.created_at < b.created_at ? 1 : -1;
  }
  if (a.id === b.id) return 0;
  return a.id < b.id ? 1 : -1;
}

export function formatLocalCreationDateTime(createdAt: string): string {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return createdAt;
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function shortGameIdSuffix(id: string): string {
  const compact = id.replace(/-/g, "");
  return compact.slice(-8);
}

export function withHistoryLabels(games: readonly { id: string; created_at: string }[]): GameHistoryEntry[] {
  const ordered = [...games].sort(compareGamesNewestFirst);
  const bases = ordered.map((game) => ({
    id: game.id,
    created_at: game.created_at,
    label: formatLocalCreationDateTime(game.created_at),
  }));
  const counts = new Map<string, number>();
  for (const entry of bases) {
    counts.set(entry.label, (counts.get(entry.label) ?? 0) + 1);
  }
  return bases.map((entry) =>
    (counts.get(entry.label) ?? 0) > 1
      ? { ...entry, label: `${entry.label} · ${shortGameIdSuffix(entry.id)}` }
      : entry,
  );
}

export function listGamesNewestFirst(db: SqliteDriver) {
  const games = createEntityStore(db).list("Game") as Array<{
    id: string;
    created_at: string;
  }>;
  return [...games].sort(compareGamesNewestFirst);
}

export function listGameHistory(db: SqliteDriver): GameHistoryEntry[] {
  return withHistoryLabels(listGamesNewestFirst(db));
}

function localDateKey(createdAt: string): string {
  const d = new Date(createdAt);
  if (Number.isNaN(d.getTime())) return createdAt.slice(0, 10);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Read-only enriched history for home metrics. Does not mutate storage. */
export function listGameHistoryDetailed(db: SqliteDriver): GameHistoryDetail[] {
  const store = createEntityStore(db);
  const games = listGamesNewestFirst(db);
  const labeled = withHistoryLabels(games);
  const byDateAsc = new Map<string, string[]>();
  const chronological = [...games].sort((a, b) => {
    if (a.created_at !== b.created_at) return a.created_at < b.created_at ? -1 : 1;
    return a.id < b.id ? -1 : 1;
  });
  for (const g of chronological) {
    const key = localDateKey(g.created_at);
    const list = byDateAsc.get(key) ?? [];
    list.push(g.id);
    byDateAsc.set(key, list);
  }
  const gameNumberById = new Map<string, number>();
  for (const [, ids] of byDateAsc) {
    ids.forEach((id, index) => gameNumberById.set(id, index + 1));
  }
  return labeled.map((entry) => {
    const facts = loadGameFacts(store, entry.id);
    const sheet = deriveGame(facts);
    let status: GameHistoryDetail["status"] = "active";
    if (sheet.status === "DOMAIN_INVALID_REQUIRING_REPAIR") status = "repair";
    else if (sheet.status === "COMPLETED" && sheet.finalTotal != null) status = "complete";
    return {
      ...entry,
      dateKey: localDateKey(entry.created_at),
      status,
      finalTotal: status === "complete" ? sheet.finalTotal : null,
      gameNumber: gameNumberById.get(entry.id) ?? 1,
      rollCount: facts.length,
    };
  });
}

export function latestGameId(db: SqliteDriver): string | null {
  return listGamesNewestFirst(db)[0]?.id ?? null;
}

export function startGame(db: SqliteDriver, deviceId: string): string {
  const gameId = newGameId() as GameId;
  applyLocalMutation(db, {
    deviceId,
    operation: "CREATE",
    entity: {
      ...meta(gameId, deviceId),
      entity_type: "Game",
      session_id: null,
      bowler_profile_id: null,
      game_number: 1,
    } as unknown as CanonicalEntity,
    expectedEntityVersion: 0,
  });
  for (let frame_number = 1; frame_number <= FRAME_COUNT; frame_number++) {
    const frameId = newFrameId();
    applyLocalMutation(db, {
      deviceId,
      operation: "CREATE",
      entity: {
        ...meta(frameId, deviceId),
        entity_type: "Frame",
        game_id: gameId,
        frame_number,
      } as unknown as CanonicalEntity,
      expectedEntityVersion: 0,
    });
  }
  return gameId;
}

/**
 * Discard an empty game (zero recorded roll facts) via the established
 * soft-delete path: Game plus its frames are archived atomically and DELETE
 * envelopes enter the existing outbox, preserving the audit.
 * A game holding any roll observation is refused — observations are never
 * deleted. Use explicit per-game UI confirmation before calling.
 */
export function discardEmptyGame(
  db: SqliteDriver,
  deviceId: string,
  gameId: string,
): { ok: true } | { ok: false; message: string } {
  const store = createEntityStore(db);
  const game = store.get("Game", gameId) as {
    id: string;
    entity_version: number;
  } | null;
  if (!game) return { ok: false, message: "game not found" };
  if (loadGameFacts(store, gameId).length > 0) {
    return { ok: false, message: "game holds recorded balls and cannot be discarded" };
  }
  try {
    const frames = (
      store.list("Frame") as Array<{
        id: string;
        game_id: string;
        entity_version: number;
      }>
    ).filter((f) => f.game_id === gameId);
    applyLocalMutations(db, [
      ...frames.map((frame) => ({
        deviceId,
        operation: "DELETE" as const,
        entity: frame as unknown as CanonicalEntity,
        expectedEntityVersion: frame.entity_version,
      })),
      {
        deviceId,
        operation: "DELETE" as const,
        entity: game as unknown as CanonicalEntity,
        expectedEntityVersion: game.entity_version,
      },
    ]);
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

export function nextLegalSlot(facts: readonly RollFact[]): NextRollSlot | null {
  const derived = deriveGame(facts);
  if (derived.status === "COMPLETED" || derived.status === "DOMAIN_INVALID_REQUIRING_REPAIR") {
    return null;
  }
  for (let frame_number = 1; frame_number <= FRAME_COUNT; frame_number++) {
    const pins = facts
      .filter((f) => f.frame_number === frame_number)
      .sort((a, b) => a.roll_number - b.roll_number)
      .map((f) => f.pinfall);
    if (frame_number < FRAME_COUNT) {
      if (pins[0] === 10 || pins.length >= 2) continue;
      return { frame_number, roll_number: pins.length + 1 };
    }
    if (pins.length === 0) return { frame_number: 10, roll_number: 1 };
    if (pins.length === 1) return { frame_number: 10, roll_number: 2 };
    if (pins.length === 2 && (pins[0] === 10 || pins[0]! + pins[1]! === 10)) {
      return { frame_number: 10, roll_number: 3 };
    }
  }
  return null;
}

export function pinfallLegal(
  rolls: readonly { frame_number: number; roll_number: number; pinfall: number }[],
  slot: NextRollSlot,
  pinfall: number,
): boolean {
  const facts: RollFact[] = rolls.map((r) => ({
    entity_id: "",
    frame_number: r.frame_number,
    roll_number: r.roll_number,
    pinfall: r.pinfall,
    entity_version: 1,
  }));
  return validateNextRoll(facts, { ...slot, pinfall }).ok;
}

function frameIdFor(db: SqliteDriver, gameId: string, frameNumber: number): string {
  const frames = createEntityStore(db).list("Frame") as Array<{
    id: string;
    game_id: string;
    frame_number: number | null;
  }>;
  const frame = frames.find((f) => f.game_id === gameId && f.frame_number === frameNumber);
  if (!frame) throw new Error(`frame ${frameNumber} missing for game`);
  return frame.id;
}

function listActivePinStates(db: SqliteDriver): PinState[] {
  return (createEntityStore(db).list("PinState") as PinState[]).filter((p) => !p.deleted);
}

export function findActivePinStateForRoll(db: SqliteDriver, rollId: string): PinState | null {
  const matches = listActivePinStates(db).filter((p) => p.roll_id === rollId);
  if (matches.length === 0) return null;
  if (matches.length > 1) return matches[0]!; // caller uses count for CONFLICTING
  return matches[0]!;
}

function priorStandingForSlot(
  db: SqliteDriver,
  facts: readonly RollFact[],
  frameNumber: number,
  rollNumber: number,
): number[] | null {
  if (rollNumber <= 1) return null;
  // Fresh rack cases: do not treat empty post-strike standing as prior identities.
  if (frameNumber === 10 && rollNumber === 2) {
    const first = facts.find((f) => f.frame_number === 10 && f.roll_number === 1);
    if (first?.pinfall === 10) return null;
  }
  if (frameNumber === 10 && rollNumber === 3) {
    const first = facts.find((f) => f.frame_number === 10 && f.roll_number === 1);
    const second = facts.find((f) => f.frame_number === 10 && f.roll_number === 2);
    if (first?.pinfall === 10 && second?.pinfall === 10) return null;
    if (
      first != null &&
      second != null &&
      first.pinfall < 10 &&
      first.pinfall + second.pinfall === 10
    ) {
      return null;
    }
  }
  const prev = facts.find(
    (f) => f.frame_number === frameNumber && f.roll_number === rollNumber - 1,
  );
  if (!prev) return null;
  const ps = findActivePinStateForRoll(db, prev.entity_id);
  if (!ps || ps.standing_pins == null) return null;
  const roll = createEntityStore(db).get("Roll", prev.entity_id) as Roll | null;
  if (!roll) return null;
  if (ps.basis_roll_version !== roll.entity_version) return null;
  return [...ps.standing_pins];
}

function rackOkFor(
  db: SqliteDriver,
  facts: readonly RollFact[],
  roll: Roll,
  frameNumber: number,
  rollNumber: number,
  pinState: PinState,
): boolean | null {
  if (pinState.standing_pins == null) return false;
  const remaining = remainingCountBeforeRoll(facts, frameNumber, rollNumber);
  const prior = priorStandingForSlot(db, facts, frameNumber, rollNumber);
  if (roll.pinfall == null) return null;
  const check = validatePinDetailForSave({
    pinfall: roll.pinfall,
    standingPins: pinState.standing_pins,
    remainingCount: remaining,
    priorStanding: prior,
  });
  return check.ok;
}

export function recordRoll(
  db: SqliteDriver,
  deviceId: string,
  gameId: string,
  pinfall: number,
  detail: StandingDetailChoice = { kind: "omit" },
  ids?: { rollId?: string; pinStateId?: string; rollSubmissionId?: string; pinSubmissionId?: string },
): { ok: true } | { ok: false; message: string } {
  const store = createEntityStore(db);
  const facts = loadGameFacts(store, gameId);
  const slot = nextLegalSlot(facts);
  if (!slot) return { ok: false, message: "no legal next roll (complete or invalid)" };
  const check = validateNextRoll(facts, { ...slot, pinfall });
  if (!check.ok) return { ok: false, message: check.message ?? check.code ?? "illegal roll" };

  const rollId = (ids?.rollId ?? newRollId()) as RollId;
  const rollEntity = {
    ...meta(rollId, deviceId),
    entity_type: "Roll" as const,
    frame_id: frameIdFor(db, gameId, slot.frame_number),
    roll_number: slot.roll_number,
    pinfall,
  };

  const mutations = [
    {
      deviceId,
      operation: "CREATE" as const,
      entity: rollEntity as unknown as CanonicalEntity,
      expectedEntityVersion: 0,
      submissionId: ids?.rollSubmissionId,
    },
  ];

  if (detail.kind === "record") {
    const remaining = remainingCountBeforeRoll(facts, slot.frame_number, slot.roll_number);
    const prior = priorStandingForSlot(db, facts, slot.frame_number, slot.roll_number);
    const detailCheck = validatePinDetailForSave({
      pinfall,
      standingPins: detail.standing_pins,
      remainingCount: remaining,
      priorStanding: prior,
    });
    if (!detailCheck.ok) {
      return { ok: false, message: detailCheck.message ?? "illegal pin detail" };
    }
    if (findActivePinStateForRoll(db, rollId)) {
      return { ok: false, message: "pin detail already recorded for this ball" };
    }
    const pinStateId = (ids?.pinStateId ?? newPinStateId()) as PinStateId;
    mutations.push({
      deviceId,
      operation: "CREATE",
      entity: {
        ...meta(pinStateId, deviceId),
        entity_type: "PinState",
        roll_id: rollId,
        basis_roll_version: 1,
        standing_pins: detail.standing_pins,
      } as unknown as CanonicalEntity,
      expectedEntityVersion: 0,
      submissionId: ids?.pinSubmissionId,
    });
  }

  try {
    applyLocalMutations(db, mutations);
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

export function correctRoll(
  db: SqliteDriver,
  deviceId: string,
  rollId: string,
  pinfall: number,
): { ok: true } | { ok: false; message: string } {
  if (!Number.isInteger(pinfall) || pinfall < 0 || pinfall > 10) {
    return { ok: false, message: "pinfall must be 0..10" };
  }
  const existing = createEntityStore(db).get("Roll", rollId) as Roll | null;
  if (!existing || existing.pinfall == null) return { ok: false, message: "roll not found" };
  try {
    applyCorrection(db, {
      correction: createCorrection({
        target_entity_type: "Roll",
        target_entity_id: rollId,
        prior_entity_version: existing.entity_version,
        corrected_representation: { id: rollId, pinfall },
        change: { pinfall: { from: existing.pinfall, to: pinfall } },
        reason: "score-entry-correction",
        actor: "device-bowler",
        origin_device_id: deviceId,
      }),
      deviceId,
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

/** Correct pinfall and standing together for frame-tap graphical edit. */
export function correctRollWithStanding(
  db: SqliteDriver,
  deviceId: string,
  rollId: string,
  pinfall: number,
  standingPins: number[],
): { ok: true } | { ok: false; message: string } {
  const pinfallResult = correctRoll(db, deviceId, rollId, pinfall);
  if (!pinfallResult.ok) return pinfallResult;
  const existing = findActivePinStateForRoll(db, rollId);
  if (existing) {
    return correctPinDetail(db, deviceId, existing.id, standingPins);
  }
  return addPinDetail(db, deviceId, rollId, standingPins);
}

/** Add pin detail to a previously pinfall-only delivery. */
export function addPinDetail(
  db: SqliteDriver,
  deviceId: string,
  rollId: string,
  standingPins: number[],
  ids?: { pinStateId?: string; submissionId?: string },
): { ok: true } | { ok: false; message: string } {
  const store = createEntityStore(db);
  const roll = store.get("Roll", rollId) as Roll | null;
  if (!roll || roll.pinfall == null) return { ok: false, message: "roll not found" };
  if (findActivePinStateForRoll(db, rollId)) {
    return { ok: false, message: "pin detail already recorded" };
  }
  const gameId = gameIdForRoll(db, roll);
  if (!gameId) return { ok: false, message: "game not found for roll" };
  const facts = loadGameFacts(store, gameId);
  const fact = facts.find((f) => f.entity_id === rollId);
  if (!fact) return { ok: false, message: "roll not in game facts" };
  const remaining = remainingCountBeforeRoll(facts, fact.frame_number, fact.roll_number);
  const prior = priorStandingForSlot(db, facts, fact.frame_number, fact.roll_number);
  const detailCheck = validatePinDetailForSave({
    pinfall: roll.pinfall,
    standingPins,
    remainingCount: remaining,
    priorStanding: prior,
  });
  if (!detailCheck.ok) return { ok: false, message: detailCheck.message ?? "illegal pin detail" };

  try {
    applyLocalMutation(db, {
      deviceId,
      operation: "CREATE",
      entity: {
        ...meta((ids?.pinStateId ?? newPinStateId()) as string, deviceId),
        entity_type: "PinState",
        roll_id: rollId as RollId,
        basis_roll_version: roll.entity_version,
        standing_pins: standingPins,
      } as unknown as CanonicalEntity,
      expectedEntityVersion: 0,
      submissionId: ids?.submissionId,
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

export function correctPinDetail(
  db: SqliteDriver,
  deviceId: string,
  pinStateId: string,
  standingPins: number[],
): { ok: true } | { ok: false; message: string } {
  const store = createEntityStore(db);
  const existing = store.get("PinState", pinStateId) as PinState | null;
  if (!existing || existing.deleted) return { ok: false, message: "pin detail not found" };
  const roll = store.get("Roll", existing.roll_id) as Roll | null;
  if (!roll || roll.pinfall == null) return { ok: false, message: "roll not found" };
  const gameId = gameIdForRoll(db, roll);
  if (!gameId) return { ok: false, message: "game not found" };
  const facts = loadGameFacts(store, gameId);
  const fact = facts.find((f) => f.entity_id === roll.id);
  if (!fact) return { ok: false, message: "roll not in game facts" };
  const remaining = remainingCountBeforeRoll(facts, fact.frame_number, fact.roll_number);
  const prior = priorStandingForSlot(db, facts, fact.frame_number, fact.roll_number);
  const detailCheck = validatePinDetailForSave({
    pinfall: roll.pinfall,
    standingPins,
    remainingCount: remaining,
    priorStanding: prior,
  });
  if (!detailCheck.ok) return { ok: false, message: detailCheck.message ?? "illegal pin detail" };

  try {
    applyCorrection(db, {
      correction: createCorrection({
        target_entity_type: "PinState",
        target_entity_id: pinStateId,
        prior_entity_version: existing.entity_version,
        corrected_representation: {
          id: pinStateId,
          standing_pins: standingPins,
          basis_roll_version: roll.entity_version,
        },
        change: {
          standing_pins: { from: existing.standing_pins, to: standingPins },
          basis_roll_version: { from: existing.basis_roll_version, to: roll.entity_version },
        },
        reason: "pin-detail-correction",
        actor: "device-bowler",
        origin_device_id: deviceId,
      }),
      deviceId,
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

/** Soft-delete active pin detail → not recorded. */
export function removePinDetail(
  db: SqliteDriver,
  deviceId: string,
  rollId: string,
): { ok: true } | { ok: false; message: string } {
  const existing = findActivePinStateForRoll(db, rollId);
  if (!existing) return { ok: false, message: "pin detail not recorded" };
  try {
    applyLocalMutation(db, {
      deviceId,
      operation: "DELETE",
      entity: existing as unknown as CanonicalEntity,
      expectedEntityVersion: existing.entity_version,
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) };
  }
}

/** Re-add after remove: always a new PinState id. */
export function readdPinDetail(
  db: SqliteDriver,
  deviceId: string,
  rollId: string,
  standingPins: number[],
): { ok: true } | { ok: false; message: string } {
  return addPinDetail(db, deviceId, rollId, standingPins);
}

function gameIdForRoll(db: SqliteDriver, roll: Roll): string | null {
  const frame = createEntityStore(db).get("Frame", roll.frame_id) as
    | { game_id: string }
    | null;
  return frame?.game_id ?? null;
}

export function formatScoringView(sheet: GameScores, next: NextRollSlot | null): string {
  const lines = sheet.frames.map((f) => {
    const balls = f.deliveries.length === 0 ? "-" : f.deliveries.join(",");
    const score = f.score === null ? (f.awaitingBonus ? "awaiting" : "-") : String(f.score);
    const kind = f.status ?? (f.deliveries.length === 0 ? "empty" : "partial");
    return `F${f.frame_number} ${balls} | ${score} ${kind}`;
  });
  const total = sheet.finalTotal === null ? "unavailable" : String(sheet.finalTotal);
  const nextText = next ? `next F${next.frame_number} R${next.roll_number}` : "no next roll";
  return [
    ...lines,
    `status: ${sheet.status}`,
    `final: ${total}`,
    nextText,
  ].join("\n");
}

function emptyScoringView(): ScoringView {
  return {
    gameId: null,
    gameMissing: false,
    sheet: null,
    formatted: "no game — create one",
    next: { frame_number: 1, roll_number: 1 },
    rolls: [],
    correctionCount: 0,
    canRecord: false,
    open_pin_detail_conflicts: 0,
  };
}

function missingScoringView(gameId: string): ScoringView {
  return {
    gameId,
    gameMissing: true,
    sheet: null,
    formatted: "Selected game was not found. Another game was not opened in its place.",
    next: null,
    rolls: [],
    correctionCount: 0,
    canRecord: false,
    open_pin_detail_conflicts: 0,
  };
}

export function loadScoringView(db: SqliteDriver, gameId: string | null): ScoringView {
  const store = createEntityStore(db);
  const resolved = gameId ?? latestGameId(db);
  if (!resolved) return emptyScoringView();
  if (!store.get("Game", resolved)) return missingScoringView(resolved);
  const facts = loadGameFacts(store, resolved);
  const sheet = deriveGame(facts);
  const next = nextLegalSlot(facts);
  const activePinStates = listActivePinStates(db);
  const byRoll = new Map<string, PinState[]>();
  for (const ps of activePinStates) {
    const list = byRoll.get(ps.roll_id) ?? [];
    list.push(ps);
    byRoll.set(ps.roll_id, list);
  }

  const rolls: RecordedRollView[] = facts.map((f) => {
    const roll = store.get("Roll", f.entity_id) as Roll;
    const competing = byRoll.get(f.entity_id) ?? [];
    const pinState = competing[0] ?? null;
    const rackOk = pinState
      ? rackOkFor(db, facts, roll, f.frame_number, f.roll_number, pinState)
      : null;
    const status = classifyPinDetail({
      roll,
      pinState,
      competingActiveCount: competing.length,
      rackOk: pinState ? rackOk : true,
    });
    return {
      entity_id: f.entity_id,
      frame_number: f.frame_number,
      roll_number: f.roll_number,
      pinfall: f.pinfall,
      entity_version: f.entity_version,
      pin_state_id: pinState?.id ?? null,
      standing_pins: pinState?.standing_pins ?? null,
      basis_roll_version: pinState?.basis_roll_version ?? null,
      pin_detail_status: competing.length > 1 ? "CONFLICTING_DETAIL" : status,
    };
  });

  let correctionCount = 0;
  const corrections = createCorrectionStore(db);
  for (const roll of rolls) {
    correctionCount += corrections.listForTarget("Roll", roll.entity_id).length;
    if (roll.pin_state_id) {
      correctionCount += corrections.listForTarget("PinState", roll.pin_state_id).length;
    }
  }

  let openConflicts = createConflictStore(db)
    .list()
    .filter((c) => c.status === "OPEN" && c.entity_type === "PinState").length;
  if (openConflicts === 0) {
    openConflicts = rolls.filter((r) => r.pin_detail_status === "CONFLICTING_DETAIL").length;
  }

  return {
    gameId: resolved,
    gameMissing: false,
    sheet,
    formatted: formatScoringView(sheet, next),
    next,
    rolls,
    correctionCount,
    canRecord: next !== null,
    open_pin_detail_conflicts: openConflicts,
  };
}
