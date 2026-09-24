/**
 * B1 sequential entry / Fix default / completion-metrics gates.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { openDatabase } from "../src/index.ts";
import {
  correctRollWithStanding,
  listGameHistoryDetailed,
  loadScoringView,
  recordRoll,
  startGame,
} from "../src/scoring/session.ts";
import {
  remainingCountBeforeRoll,
  fullRack,
  resolveCaptureRack,
} from "../src/scoring/pinDetail.ts";
import {
  computeHomeMetrics,
  defaultFixRollId,
  spareControlEnabled,
  strikeControlEnabled,
} from "../src/shellPresentation.ts";
import { TEST_DEVICE_ID } from "./helpers.ts";

describe("B1 sequential gutter / fix / metrics", () => {
  it("gutter on first ball advances to ball 2 with full remaining rack and spare legal", () => {
    const db = openDatabase();
    const gameId = startGame(db, TEST_DEVICE_ID);
    const rack = fullRack();
    const saved = recordRoll(db, TEST_DEVICE_ID, gameId, 0, {
      kind: "record",
      standing_pins: rack,
    });
    assert.equal(saved.ok, true);
    const view = loadScoringView(db, gameId);
    assert.equal(view.next?.frame_number, 1);
    assert.equal(view.next?.roll_number, 2);
    const facts = view.rolls.map((r) => ({
      frame_number: r.frame_number,
      roll_number: r.roll_number,
      pinfall: r.pinfall,
      standing_pins: r.standing_pins,
      pin_detail_status: r.pin_detail_status,
    }));
    const nextRack = resolveCaptureRack(facts, 1, 2);
    assert.ok(nextRack);
    assert.equal(nextRack!.length, 10);
    assert.equal(
      remainingCountBeforeRoll(
        view.rolls.map((r) => ({
          entity_id: r.entity_id,
          frame_number: r.frame_number,
          roll_number: r.roll_number,
          pinfall: r.pinfall,
          entity_version: r.entity_version,
        })),
        1,
        2,
      ),
      10,
    );
    assert.equal(
      strikeControlEnabled({
        rackLength: nextRack!.length,
        frameNumber: 1,
        rollNumber: 2,
      }),
      false,
    );
    assert.equal(
      spareControlEnabled({
        rackLength: nextRack!.length,
        frameNumber: 1,
        rollNumber: 2,
      }),
      true,
    );
    const spare = recordRoll(db, TEST_DEVICE_ID, gameId, 10, {
      kind: "record",
      standing_pins: [],
    });
    assert.equal(spare.ok, true);
    const after = loadScoringView(db, gameId);
    assert.equal(after.next?.frame_number, 2);
    assert.equal(after.next?.roll_number, 1);
  });

  it("frame fix defaults to first throw and restores standing on switch", () => {
    const db = openDatabase();
    const gameId = startGame(db, TEST_DEVICE_ID);
    assert.equal(
      recordRoll(db, TEST_DEVICE_ID, gameId, 8, {
        kind: "record",
        standing_pins: [7, 10],
      }).ok,
      true,
    );
    assert.equal(
      recordRoll(db, TEST_DEVICE_ID, gameId, 1, {
        kind: "record",
        standing_pins: [10],
      }).ok,
      true,
    );
    const view = loadScoringView(db, gameId);
    const frame1 = view.rolls.filter((r) => r.frame_number === 1);
    const firstId = defaultFixRollId(frame1);
    assert.equal(firstId, frame1.find((r) => r.roll_number === 1)?.entity_id);
    const first = frame1.find((r) => r.entity_id === firstId)!;
    assert.deepEqual(first.standing_pins, [7, 10]);
    const corrected = correctRollWithStanding(
      db,
      TEST_DEVICE_ID,
      first.entity_id,
      7,
      [2, 8, 10],
    );
    assert.equal(corrected.ok, true);
    const after = loadScoringView(db, gameId);
    const updated = after.rolls.find((r) => r.entity_id === first.entity_id)!;
    assert.equal(updated.pinfall, 7);
    assert.deepEqual(updated.standing_pins, [2, 8, 10]);
    assert.ok(after.correctionCount >= 1);
  });

  it("incomplete and active games are excluded from metrics and date averages", () => {
    const db = openDatabase();
    const incompleteId = startGame(db, TEST_DEVICE_ID);
    assert.equal(
      recordRoll(db, TEST_DEVICE_ID, incompleteId, 0, {
        kind: "record",
        standing_pins: fullRack(),
      }).ok,
      true,
    );
    const completeId = startGame(db, TEST_DEVICE_ID);
    for (let f = 0; f < 10; f++) {
      assert.equal(recordRoll(db, TEST_DEVICE_ID, completeId, 9).ok, true);
      assert.equal(recordRoll(db, TEST_DEVICE_ID, completeId, 0).ok, true);
    }
    const detailed = listGameHistoryDetailed(db);
    const incomplete = detailed.find((g) => g.id === incompleteId)!;
    const complete = detailed.find((g) => g.id === completeId)!;
    assert.equal(incomplete.status, "active");
    assert.equal(incomplete.finalTotal, null);
    assert.equal(complete.status, "complete");
    assert.ok(typeof complete.finalTotal === "number");
    const metrics = computeHomeMetrics(
      detailed.map((g) => ({
        id: g.id,
        dateKey: g.dateKey,
        gameNumber: g.gameNumber,
        status: g.status,
        finalTotal: g.finalTotal,
        created_at: g.created_at,
      })),
      "all",
    );
    assert.equal(metrics.qualifyingGames, 1);
    assert.equal(metrics.overallAverage, complete.finalTotal);
    assert.equal(metrics.averageByDateRows.length, 1);
    assert.ok(metrics.averageByDateRows[0]!.weekAverage != null);
  });
});
