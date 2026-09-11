/**
 * Thin Slice 4 scoring session: persist Game/Frame/Roll facts and corrections,
 * then project scores via the existing domain engine. This module does not
 * compute bowling scores itself.
 */
import type { CanonicalEntity, Frame, Game, Roll } from "../entities.ts";
import { createCorrection } from "../correction.ts";
import { newEntityMetadata } from "../metadata.ts";
import { newFrameId, newGameId, newRollId, type GameId } from "../identity/ids.ts";
import { applyCorrection } from "../persistence/sqlite/applyCorrection.ts";
import { applyLocalMutation } from "../persistence/sqlite/localMutation.ts";
import { createCorrectionStore } from "../persistence/sqlite/correctionStore.ts";
import { createEntityStore } from "../persistence/sqlite/entityStore.ts";
import type { SqliteDriver } from "../persistence/sqlite/driver.ts";
import { deriveGame } from "./derive.ts";
import { loadGameFacts } from "./store.ts";
import { FRAME_COUNT, type GameScores, type RollFact } from "./types.ts";
import { validateNextRoll } from "./validate.ts";

export interface RecordedRollView {
  entity_id: string;
  frame_number: number;
  roll_number: number;
  pinfall: number;
  entity_version: number;
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
}

export interface GameHistoryEntry {
  id: string;
  created_at: string;
  label: string;
}

export function compareGamesNewestFirst(a: { id: string; created_at: string }, b: { id: string; created_at: string }): number {
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

export function withHistoryLabels(games: readonly Game[]): GameHistoryEntry[] {
  const ordered = [...games].sort(compareGamesNewestFirst);
  const bases = ordered.map((game) => ({
    id: game.id,
    created_at: game.created_at,
    base: formatLocalCreationDateTime(game.created_at),
  }));
  return bases.map((entry) => {
    const duplicate = bases.some((other) => other.id !== entry.id && other.base === entry.base);
    return {
      id: entry.id,
      created_at: entry.created_at,
      label: duplicate ? `${entry.base} · ${shortGameIdSuffix(entry.id)}` : entry.base,
    };
  });
}

function meta(id: string, deviceId: string) {
  return { ...newEntityMetadata({ id, origin_device_id: deviceId }), id };
}

export function listGamesNewestFirst(db: SqliteDriver): Game[] {
  const games = createEntityStore(db).list("Game") as Game[];
  return [...games].sort(compareGamesNewestFirst);
}

export function listGameHistory(db: SqliteDriver): GameHistoryEntry[] {
  return withHistoryLabels(listGamesNewestFirst(db));
}

export function latestGameId(db: SqliteDriver): GameId | null {
  return (listGamesNewestFirst(db)[0]?.id ?? null) as GameId | null;
}

export function startGame(db: SqliteDriver, deviceId: string): GameId {
  const gameId = newGameId();
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
  facts: readonly RollFact[],
  slot: NextRollSlot,
  pinfall: number,
): boolean {
  return validateNextRoll(facts, { ...slot, pinfall }).ok;
}

function frameIdFor(db: SqliteDriver, gameId: string, frameNumber: number): string {
  const frames = createEntityStore(db).list("Frame") as Frame[];
  const frame = frames.find((f) => f.game_id === gameId && f.frame_number === frameNumber);
  if (!frame) throw new Error(`frame ${frameNumber} missing for game`);
  return frame.id;
}

export function recordRoll(
  db: SqliteDriver,
  deviceId: string,
  gameId: string,
  pinfall: number,
): { ok: true } | { ok: false; message: string } {
  const facts = loadGameFacts(createEntityStore(db), gameId);
  const slot = nextLegalSlot(facts);
  if (!slot) return { ok: false, message: "no legal next roll (complete or invalid)" };
  const check = validateNextRoll(facts, { ...slot, pinfall });
  if (!check.ok) return { ok: false, message: check.message ?? check.code ?? "illegal roll" };
  applyLocalMutation(db, {
    deviceId,
    operation: "CREATE",
    entity: {
      ...meta(newRollId(), deviceId),
      entity_type: "Roll",
      frame_id: frameIdFor(db, gameId, slot.frame_number),
      roll_number: slot.roll_number,
      pinfall,
    } as unknown as CanonicalEntity,
    expectedEntityVersion: 0,
  });
  return { ok: true };
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
  const rolls: RecordedRollView[] = facts.map((f) => ({
    entity_id: f.entity_id,
    frame_number: f.frame_number,
    roll_number: f.roll_number,
    pinfall: f.pinfall,
    entity_version: f.entity_version,
  }));
  let correctionCount = 0;
  const corrections = createCorrectionStore(db);
  for (const roll of rolls) {
    correctionCount += corrections.listForTarget("Roll", roll.entity_id).length;
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
  };
}
