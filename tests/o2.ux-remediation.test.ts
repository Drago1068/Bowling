/**
 * O2/UX remediation gates: frozen top-nav actions, new-game confirm gating,
 * and empty-game discard that never touches recorded observations.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { openDatabase } from "../src/index.ts";
import {
  discardEmptyGame,
  listGameHistoryDetailed,
  recordRoll,
  startGame,
} from "../src/scoring/session.ts";
import {
  ANALYSIS_PENDING_COPY,
  analysisAvailableSummary,
  ballSaveQuip,
  completedSaveBanner,
  completedSaveNotice,
  discardableGame,
  gameCompleteQuip,
  historyToggleLabel,
  leaveQuip,
  newGameConfirmNotice,
  strikeQuip,
  strikeStreakCount,
  topNavActions,
} from "../src/shellPresentation.ts";
import { TEST_DEVICE_ID } from "./helpers.ts";

describe("O2 frozen top nav", () => {
  it("landing hides the bar; history/analysis/advanced offer Home; game keeps context actions", () => {
    assert.deepEqual(
      topNavActions({ screen: "landing", historyOpen: false, completed: false }),
      [],
    );
    assert.deepEqual(
      topNavActions({ screen: "history", historyOpen: false, completed: false }),
      ["home"],
    );
    assert.deepEqual(
      topNavActions({ screen: "analysis", historyOpen: false, completed: false }),
      ["home"],
    );
    assert.deepEqual(
      topNavActions({ screen: "advanced", historyOpen: false, completed: false }),
      ["home"],
    );
    assert.deepEqual(
      topNavActions({ screen: "game", historyOpen: false, completed: false }),
      ["home", "history"],
    );
    assert.deepEqual(
      topNavActions({ screen: "game", historyOpen: true, completed: false }),
      ["home", "history"],
    );
    assert.deepEqual(
      topNavActions({ screen: "game", historyOpen: false, completed: true }),
      ["home", "history", "done", "start"],
    );
  });

  it("history toggle label follows disclosure state", () => {
    assert.equal(historyToggleLabel(false), "Previous games");
    assert.equal(historyToggleLabel(true), "Hide previous games");
  });

  it("new-game confirm notice names the active-game count", () => {
    assert.equal(newGameConfirmNotice(0), "Start a new game?");
    assert.ok(newGameConfirmNotice(2).includes("2 active game(s)"));
  });

  it("completed Save reports the final and stays put without implying a write", () => {
    assert.ok(completedSaveNotice(195).includes("195"));
    assert.ok(completedSaveNotice(195).includes("Still in this game"));
    assert.ok(completedSaveNotice(null).includes("Still in this game"));
    assert.equal(completedSaveBanner(203, "8:52 PM"), "Saved ✓ · Final 203 · 8:52 PM");
    assert.equal(completedSaveBanner(null, "8:52 PM"), "Saved ✓ · 8:52 PM");
  });

  it("analysis screen stays honest: basics only, B2/B3 not claimed", () => {
    assert.ok(
      analysisAvailableSummary(3, 150).includes("Qualifying games: 3"),
    );
    assert.ok(analysisAvailableSummary(3, 150).includes("150"));
    assert.ok(
      analysisAvailableSummary(0, null).includes("first completed game"),
    );
    assert.ok(ANALYSIS_PENDING_COPY.includes("not computed yet"));
  });
});

describe("O2 lane commentary quips", () => {
  it("strike streaks escalate: strike, double, turkey, runaway", () => {
    assert.equal(strikeQuip(1), "Nice strike!");
    assert.equal(strikeQuip(2), "Double! Back-to-back strikes!");
    assert.equal(strikeQuip(3), "Nice Turkey!");
    assert.ok(strikeQuip(5)!.includes("5 in a row"));
    assert.equal(strikeQuip(0), null);
  });

  it("leaves quip only on recorded detail: single pin and famous splits", () => {
    assert.equal(leaveQuip([10]), "You forgot one.");
    assert.equal(leaveQuip([7, 10]), "Nice split. Good luck.");
    assert.equal(leaveQuip([10, 7]), "Nice split. Good luck.");
    assert.equal(leaveQuip([4, 6]), "Nice split. Good luck.");
    assert.equal(leaveQuip(null), null);
    assert.equal(leaveQuip([]), null);
    assert.equal(leaveQuip([1, 2, 3]), null);
  });

  it("streaks count trailing strike frames only", () => {
    const frames = (marks: [number, boolean][]) =>
      marks.map(([frameNumber, isStrike]) => ({ frameNumber, isStrike }));
    assert.equal(
      strikeStreakCount(frames([[1, true], [2, true], [3, true]]), 3),
      3,
    );
    assert.equal(
      strikeStreakCount(
        frames([[1, true], [2, false], [3, true], [4, false]]),
        4,
      ),
      0,
    );
    assert.equal(
      strikeStreakCount(frames([[8, true], [9, true], [10, true]]), 9),
      2,
    );
  });

  it("fresh-save quips prioritize strike, spare, leave, gutter", () => {
    const base = {
      rollNumber: 1,
      firstBallPinfall: null,
      strikeStreak: 0,
      standingPins: [] as number[],
    };
    assert.equal(
      ballSaveQuip({ ...base, frameNumber: 5, pinfall: 10, strikeStreak: 3 }),
      "Nice Turkey!",
    );
    assert.equal(
      ballSaveQuip({ ...base, frameNumber: 10, pinfall: 10 }),
      "Nice strike!",
    );
    assert.equal(
      ballSaveQuip({
        ...base,
        frameNumber: 4,
        rollNumber: 2,
        pinfall: 3,
        firstBallPinfall: 7,
      }),
      "Spare! Nice pickup.",
    );
    assert.equal(
      ballSaveQuip({
        ...base,
        frameNumber: 4,
        rollNumber: 2,
        pinfall: 1,
        firstBallPinfall: 8,
        standingPins: [10],
      }),
      "You forgot one.",
    );
    assert.equal(
      ballSaveQuip({
        ...base,
        frameNumber: 4,
        rollNumber: 2,
        pinfall: 2,
        firstBallPinfall: 6,
        standingPins: [7, 10],
      }),
      "Nice split. Good luck.",
    );
    assert.equal(
      ballSaveQuip({ ...base, frameNumber: 1, pinfall: 0, standingPins: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] }),
      "Gutter ball — shake it off.",
    );
    assert.equal(
      ballSaveQuip({ ...base, frameNumber: 1, pinfall: 5 }),
      null,
    );
  });

  it("completed-game quips tier by final without inventing coaching", () => {
    assert.equal(gameCompleteQuip(300), "Perfect game! Legendary.");
    assert.equal(gameCompleteQuip(203), "Huge game!");
    assert.equal(gameCompleteQuip(150), "Solid game!");
    assert.equal(gameCompleteQuip(80), "Game in the books.");
    assert.equal(gameCompleteQuip(null), null);
  });
});

describe("O2 discard gating", () => {
  it("only Active games with zero rolls are discardable", () => {
    assert.equal(discardableGame({ status: "active", rollCount: 0 }), true);
    assert.equal(discardableGame({ status: "active", rollCount: 1 }), false);
    assert.equal(discardableGame({ status: "complete", rollCount: 0 }), false);
    assert.equal(discardableGame({ status: "repair", rollCount: 0 }), false);
  });

  it("empty game discards atomically and vanishes from history", () => {
    const db = openDatabase();
    const gameId = startGame(db, TEST_DEVICE_ID);
    let detailed = listGameHistoryDetailed(db);
    assert.equal(detailed.length, 1);
    assert.equal(detailed[0]?.rollCount, 0);
    const result = discardEmptyGame(db, TEST_DEVICE_ID, gameId);
    assert.equal(result.ok, true);
    detailed = listGameHistoryDetailed(db);
    assert.equal(detailed.length, 0);
  });

  it("game with a recorded ball is refused and preserved", () => {
    const db = openDatabase();
    const gameId = startGame(db, TEST_DEVICE_ID);
    const saved = recordRoll(db, TEST_DEVICE_ID, gameId, 7, { kind: "omit" });
    assert.equal(saved.ok, true);
    const detailed = listGameHistoryDetailed(db);
    assert.equal(detailed[0]?.rollCount, 1);
    const result = discardEmptyGame(db, TEST_DEVICE_ID, gameId);
    assert.equal(result.ok, false);
    assert.equal(listGameHistoryDetailed(db).length, 1);
  });

  it("discarding an unknown game fails without side effects", () => {
    const db = openDatabase();
    const gameId = startGame(db, TEST_DEVICE_ID);
    const result = discardEmptyGame(db, TEST_DEVICE_ID, "missing-game-id");
    assert.equal(result.ok, false);
    assert.equal(listGameHistoryDetailed(db).length, 1);
    assert.ok(gameId);
  });
});
