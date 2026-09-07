import { test } from "node:test";
import assert from "node:assert/strict";
import {
  deriveGame,
  validateNextRoll,
  type RollFact,
} from "../src/index.ts";

function fact(
  frame_number: number,
  roll_number: number,
  pinfall: number,
  entity_id = `${frame_number}-${roll_number}`,
): RollFact {
  return { entity_id, frame_number, roll_number, pinfall, entity_version: 1 };
}

/** Build an ordered fact list from a compact per-frame delivery spec. */
function game(
  specs: Array<{ frame: number; rolls: number[] }>,
): RollFact[] {
  const facts: RollFact[] = [];
  for (const { frame, rolls } of specs) {
    rolls.forEach((p, i) => facts.push(fact(frame, i + 1, p)));
  }
  return facts;
}

// ---- Golden vectors (permanent regression contract; do not substitute) ----

test("PERFECT_GAME derives 300 with every frame resolved", () => {
  const f = game(Array.from({ length: 10 }, (_, i) => ({ frame: i + 1, rolls: i === 9 ? [10, 10, 10] : [10] })));
  const s = deriveGame(f);
  assert.equal(s.status, "COMPLETED");
  assert.equal(s.finalTotal, 300);
  assert.equal(s.finalScoreUnavailable, false);
  assert.ok(s.frames.every((fr) => fr.isResolved));
  assert.equal(s.rollCount, 12);
});

test("ALL_SPARES derives 150", () => {
  const f = game(
    [
      ...Array.from({ length: 9 }, (_, i) => ({ frame: i + 1, rolls: [5, 5] })),
      { frame: 10, rolls: [5, 5, 5] },
    ],
  );
  const s = deriveGame(f);
  assert.equal(s.status, "COMPLETED");
  assert.equal(s.finalTotal, 150);
});

test("GUTTER_GAME derives 0", () => {
  const f = game(Array.from({ length: 10 }, (_, i) => ({ frame: i + 1, rolls: [0, 0] })));
  const s = deriveGame(f);
  assert.equal(s.status, "COMPLETED");
  assert.equal(s.finalTotal, 0);
});

test("OPEN_FRAMES derives 8 per open frame totalling 80", () => {
  const f = game(Array.from({ length: 10 }, (_, i) => ({ frame: i + 1, rolls: [5, 3] })));
  const s = deriveGame(f);
  assert.equal(s.status, "COMPLETED");
  assert.equal(s.finalTotal, 80);
  for (const fr of s.frames) fr === s.frames[0] || assert.equal(fr.score, 8);
});

test("MIXED_GAME derives 169 with exact per-frame breakdown", () => {
  const specs = [
    { frame: 1, rolls: [10] },
    { frame: 2, rolls: [3, 6] },
    { frame: 3, rolls: [9, 1] },
    { frame: 4, rolls: [7, 2] },
    { frame: 5, rolls: [10] },
    { frame: 6, rolls: [10] },
    { frame: 7, rolls: [8, 2] },
    { frame: 8, rolls: [9, 0] },
    { frame: 9, rolls: [10] },
    { frame: 10, rolls: [7, 3, 9] },
  ];
  const s = deriveGame(game(specs));
  assert.equal(s.status, "COMPLETED");
  assert.equal(s.finalTotal, 169);
  const expected = [19, 9, 17, 9, 28, 20, 19, 9, 20, 19];
  s.frames.forEach((fr, i) => assert.equal(fr.score, expected[i], `frame ${i + 1}`));
  assert.deepEqual(s.runningTotals, [19, 28, 45, 54, 82, 102, 121, 130, 150, 169]);
});

// ---- Partial / unresolved states ----

test("empty fact set is NOT_STARTED with final score unavailable", () => {
  const s = deriveGame([]);
  assert.equal(s.status, "NOT_STARTED");
  assert.equal(s.finalTotal, null);
  assert.equal(s.finalScoreUnavailable, true);
});

test("partial first open frame awaits second roll (not an unresolved bonus)", () => {
  const s = deriveGame([fact(1, 1, 5)]);
  assert.equal(s.status, "IN_PROGRESS");
  assert.equal(s.frames[0]!.isResolved, false);
  assert.equal(s.frames[0]!.score, null);
  assert.equal(s.frames[0]!.status, null);
});

test("strike awaits two bonus deliveries before its frame resolves", () => {
  const s = deriveGame([fact(1, 1, 10)]);
  assert.equal(s.frames[0]!.status, "STRIKE");
  assert.equal(s.frames[0]!.isResolved, false);
  assert.equal(s.frames[0]!.awaitingBonus, true);
  assert.equal(s.frames[0]!.score, null);
});

test("strike resolves once the next two deliveries exist", () => {
  const s = deriveGame([
    fact(1, 1, 10),
    fact(2, 1, 3),
    fact(2, 2, 6),
  ]);
  assert.equal(s.frames[0]!.score, 19);
  assert.equal(s.frames[0]!.isResolved, true);
  assert.equal(s.frames[1]!.status, "OPEN");
  assert.equal(s.frames[1]!.score, 9);
});

test("spare awaits one bonus delivery", () => {
  const s = deriveGame([fact(1, 1, 5), fact(1, 2, 5)]);
  assert.equal(s.frames[0]!.status, "SPARE");
  assert.equal(s.frames[0]!.isResolved, false);
  assert.equal(s.frames[0]!.awaitingBonus, true);
});

test("partial tenth single roll is unresolved but legal", () => {
  // First nine strikes (9 rolls) plus a tenth-frame first-ball strike = 10 rolls.
  const facts = game(
    Array.from({ length: 9 }, (_, i) => ({ frame: i + 1, rolls: [10] })),
  ).concat(fact(10, 1, 10));
  const s = deriveGame(facts);
  assert.equal(s.status, "IN_PROGRESS");
  assert.equal(s.frames[9]!.isResolved, false);
});

// ---- Invalid input / legality ----

test("negative pinfall rejected by validateNextRoll", () => {
  const r = validateNextRoll([], { frame_number: 1, roll_number: 1, pinfall: -1 });
  assert.equal(r.ok, false);
  assert.equal(r.code, "PINFALL_LT_0");
});

test("pinfall over ten rejected", () => {
  const r = validateNextRoll([], { frame_number: 1, roll_number: 1, pinfall: 11 });
  assert.equal(r.ok, false);
  assert.equal(r.code, "PINFALL_GT_10");
});

test("impossible two-roll total rejected in frames 1-9", () => {
  const r = validateNextRoll([fact(1, 1, 8)], { frame_number: 1, roll_number: 2, pinfall: 5 });
  assert.equal(r.ok, false);
  assert.equal(r.code, "IMPOSSIBLE_TWO_ROLL_TOTAL");
});

test("impossible two-roll total rejected in frame 10", () => {
  const r = validateNextRoll([fact(10, 1, 8)], { frame_number: 10, roll_number: 2, pinfall: 5 });
  assert.equal(r.ok, false);
  assert.equal(r.code, "IMPOSSIBLE_TWO_ROLL_TOTAL");
});

test("invalid tenth bonus: third roll after an open tenth rejected", () => {
  const r = validateNextRoll(
    [fact(10, 1, 5), fact(10, 2, 3)],
    { frame_number: 10, roll_number: 3, pinfall: 1 },
  );
  assert.equal(r.ok, false);
  assert.equal(r.code, "INVALID_TENTH_BONUS");
});

test("third roll after a tenth spare is legal", () => {
  const r = validateNextRoll(
    [fact(10, 1, 5), fact(10, 2, 5)],
    { frame_number: 10, roll_number: 3, pinfall: 9 },
  );
  assert.equal(r.ok, true);
});

test("roll after a completed game rejected", () => {
  const complete = game(
    Array.from({ length: 10 }, (_, i) => ({ frame: i + 1, rolls: i === 9 ? [5, 3] : [5, 3] })),
  );
  const r = validateNextRoll(complete, { frame_number: 1, roll_number: 1, pinfall: 5 });
  assert.equal(r.ok, false);
  assert.equal(r.code, "ROLL_AFTER_COMPLETION");
});

test("invalid roll_number ordering rejected as invalid state transition", () => {
  const r = validateNextRoll([fact(1, 1, 5)], { frame_number: 1, roll_number: 3, pinfall: 1 });
  assert.equal(r.ok, false);
  assert.equal(r.code, "INVALID_STATE_TRANSITION");
});

// ---- Correction topology: preserved facts are not re-parsed as later deliveries ----

test("OPEN_TO_STRIKE: leftover second roll stays on the frame and is not scored as bonus", () => {
  const facts = [
    fact(1, 1, 10),
    fact(1, 2, 4),
    fact(2, 1, 3),
  ];
  const s = deriveGame(facts);
  assert.equal(s.status, "DOMAIN_INVALID_REQUIRING_REPAIR");
  assert.equal(s.finalTotal, null);
  assert.equal(s.finalScoreUnavailable, true);
  assert.deepEqual(s.frames[0]!.deliveries, [10, 4]);
  assert.equal(s.frames[0]!.score, null);
  assert.deepEqual(s.frames[1]!.deliveries, [3]);
});

test("SPARE_TO_STRIKE: leftover spare-completion roll is not a strike bonus", () => {
  const s = deriveGame([fact(1, 1, 10), fact(1, 2, 4), fact(2, 1, 3), fact(2, 2, 3)]);
  assert.equal(s.status, "DOMAIN_INVALID_REQUIRING_REPAIR");
  assert.deepEqual(s.frames[0]!.deliveries, [10, 4]);
  assert.equal(s.finalScoreUnavailable, true);
});

test("STRIKE_TO_NON_STRIKE: downstream frame rolls stay valid on their frames", () => {
  const s = deriveGame([fact(1, 1, 5), fact(2, 1, 3), fact(2, 2, 4)]);
  assert.equal(s.status, "IN_PROGRESS");
  assert.equal(s.frames[0]!.isStrike, false);
  assert.deepEqual(s.frames[0]!.deliveries, [5]);
  assert.equal(s.frames[1]!.isOpen, true);
  assert.equal(s.frames[1]!.score, 7);
  assert.equal(s.finalScoreUnavailable, true);
});

test("TENTH_FRAME_TOPOLOGY: open tenth plus leftover bonus roll is invalid", () => {
  const facts = game(Array.from({ length: 9 }, (_, i) => ({ frame: i + 1, rolls: [5, 3] }))).concat(
    fact(10, 1, 5),
    fact(10, 2, 3),
    fact(10, 3, 8),
  );
  const s = deriveGame(facts);
  assert.equal(s.status, "DOMAIN_INVALID_REQUIRING_REPAIR");
  assert.deepEqual(s.frames[9]!.deliveries, [5, 3, 8]);
  assert.equal(s.finalTotal, null);
});

test("TENTH_FRAME_TOPOLOGY: strike in tenth keeps two bonus rolls legal", () => {
  const facts = game(Array.from({ length: 9 }, (_, i) => ({ frame: i + 1, rolls: [10] }))).concat(
    fact(10, 1, 10),
    fact(10, 2, 10),
    fact(10, 3, 7),
  );
  const s = deriveGame(facts);
  assert.equal(s.status, "COMPLETED");
  assert.equal(s.frames[9]!.isStrike, true);
  assert.equal(s.frames[9]!.score, 27);
  assert.equal(s.finalTotal, 297);
});
