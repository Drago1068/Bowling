/**
 * B2 per-game analysis gates (ADR-007 §6.1–§6.3, capture scope only).
 * No historical aggregation (B3) and no trends.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { openDatabase } from "../src/index.ts";
import {
  analyzeFirstBall,
  analyzeGameView,
  analyzeLeaves,
  analyzeScoringView,
  analyzeSpares,
  formatGameAnalysis,
} from "../src/scoring/analysis.ts";
import {
  addPinDetail,
  correctRoll,
  listGameHistoryDetailed,
  loadScoringView,
  recordRoll,
  startGame,
} from "../src/scoring/session.ts";
import { TEST_DEVICE_ID } from "./helpers.ts";

type R = {
  frame_number: number;
  roll_number: number;
  pinfall: number;
  standing_pins: number[] | null;
};

function opening(
  frame: number,
  pinfall: number,
  standing: number[] | null = null,
): R {
  return { frame_number: frame, roll_number: 1, pinfall, standing_pins: standing };
}

describe("B2 first-ball pinfall and strike rate", () => {
  it("counts frame openings only; tenth fills excluded", () => {
    const rolls: R[] = [
      ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((f) => opening(f, 10)),
      opening(10, 10),
      { frame_number: 10, roll_number: 2, pinfall: 10, standing_pins: null },
      { frame_number: 10, roll_number: 3, pinfall: 10, standing_pins: null },
    ];
    const a = analyzeFirstBall(rolls);
    assert.equal(a.denominator, 10);
    assert.equal(a.strikes, 10);
    assert.equal(a.strikeRate, 100);
    assert.equal(a.averagePinfall, 10);
  });

  it("pinfall-only openings are eligible; empty denominator yields nulls", () => {
    const a = analyzeFirstBall([
      opening(1, 7),
      { frame_number: 1, roll_number: 2, pinfall: 2, standing_pins: null },
    ]);
    assert.equal(a.denominator, 1);
    assert.equal(a.strikes, 0);
    assert.equal(a.strikeRate, 0);
    assert.equal(a.averagePinfall, 7);
    const none = analyzeFirstBall([]);
    assert.equal(none.denominator, 0);
    assert.equal(none.strikeRate, null);
    assert.equal(none.averagePinfall, null);
  });
});

describe("B2 common leaves", () => {
  it("counts only recorded nonempty sets; missing and empty disclosed", () => {
    const rolls: R[] = [
      opening(1, 8, [7, 10]),
      opening(2, 8, [10, 7]),
      opening(3, 9, [5]),
      opening(4, 7, null),
      opening(5, 10, []),
    ];
    const leaves = analyzeLeaves(rolls);
    assert.equal(leaves.counted.length, 2);
    assert.deepEqual(leaves.counted[0], { standing: [7, 10], count: 2 });
    assert.deepEqual(leaves.counted[1], { standing: [5], count: 1 });
    assert.equal(leaves.recordedCount, 3);
    assert.equal(leaves.missingCount, 1);
    assert.equal(leaves.emptyCount, 1);
  });

  it("later-ball detail never enters the v1 leave metric", () => {
    const rolls: R[] = [
      opening(1, 8, [7, 10]),
      { frame_number: 1, roll_number: 2, pinfall: 2, standing_pins: [4, 6] },
    ];
    const leaves = analyzeLeaves(rolls);
    assert.equal(leaves.counted.length, 1);
    assert.deepEqual(leaves.counted[0]?.standing, [7, 10]);
  });
});

describe("B2 spare opportunities and conversions", () => {
  it("frames 1-9 only; needs a second ball; rate without identities", () => {
    const rolls: R[] = [
      { frame_number: 1, roll_number: 1, pinfall: 7, standing_pins: null },
      { frame_number: 1, roll_number: 2, pinfall: 3, standing_pins: null },
      { frame_number: 2, roll_number: 1, pinfall: 8, standing_pins: null },
      { frame_number: 2, roll_number: 2, pinfall: 1, standing_pins: null },
      { frame_number: 3, roll_number: 1, pinfall: 10, standing_pins: null },
      { frame_number: 4, roll_number: 1, pinfall: 6, standing_pins: null },
      { frame_number: 10, roll_number: 1, pinfall: 5, standing_pins: null },
      { frame_number: 10, roll_number: 2, pinfall: 5, standing_pins: null },
    ];
    const spares = analyzeSpares(rolls);
    assert.equal(spares.opportunities, 2);
    assert.equal(spares.conversions, 1);
    assert.equal(spares.conversionRate, 50);
    assert.equal(spares.missingDetailOpportunities, 2);
    assert.deepEqual(spares.byLeave, []);
  });

  it("leave-specific breakdowns require recorded first-ball detail", () => {
    const rolls: R[] = [
      { frame_number: 1, roll_number: 1, pinfall: 8, standing_pins: [7, 10] },
      { frame_number: 1, roll_number: 2, pinfall: 2, standing_pins: [] },
      { frame_number: 2, roll_number: 1, pinfall: 8, standing_pins: [7, 10] },
      { frame_number: 2, roll_number: 2, pinfall: 0, standing_pins: [7, 10] },
    ];
    const spares = analyzeSpares(rolls);
    assert.equal(spares.opportunities, 2);
    assert.equal(spares.conversions, 1);
    assert.equal(spares.byLeave.length, 1);
    assert.deepEqual(spares.byLeave[0], {
      standing: [7, 10],
      opportunities: 2,
      conversions: 1,
    });
  });
});

describe("B2 eligibility", () => {
  it("incomplete and repair games are excluded with reasons", () => {
    const rolls: R[] = [opening(1, 7)];
    assert.equal(analyzeGameView("g", "IN_PROGRESS", rolls).eligible, false);
    assert.equal(
      analyzeGameView("g", "IN_PROGRESS", rolls).exclusionReason,
      "incomplete",
    );
    assert.equal(
      analyzeGameView("g", "DOMAIN_INVALID_REQUIRING_REPAIR", rolls).exclusionReason,
      "repair",
    );
    const done = analyzeGameView("g", "COMPLETED", rolls);
    assert.equal(done.eligible, true);
    assert.equal(done.exclusionReason, null);
    assert.equal(done.firstBall.denominator, 1);
  });

  it("no game open yields null", () => {
    assert.equal(
      analyzeScoringView({ gameId: null, sheet: null, rolls: [] }),
      null,
    );
  });
});

describe("B2 end to end over recorded games", () => {
  it("perfect game: 10 eligible first balls, 100% strikes, no spare work", () => {
    const db = openDatabase();
    const gameId = startGame(db, TEST_DEVICE_ID);
    for (let i = 0; i < 12; i++) {
      assert.equal(recordRoll(db, TEST_DEVICE_ID, gameId, 10, { kind: "omit" }).ok, true);
    }
    const view = loadScoringView(db, gameId);
    assert.equal(view.sheet?.status, "COMPLETED");
    const analysis = analyzeScoringView(view)!;
    assert.equal(analysis.eligible, true);
    assert.equal(analysis.firstBall.denominator, 10);
    assert.equal(analysis.firstBall.strikes, 10);
    assert.equal(analysis.firstBall.strikeRate, 100);
    assert.equal(analysis.spares.opportunities, 0);
    assert.equal(analysis.spares.conversionRate, null);
    assert.equal(analysis.leaves.recordedCount, 0);
    assert.equal(analysis.leaves.missingCount, 10);
  });

  it("all spares: 9 opportunities converted, tenth excluded from spares", () => {
    const db = openDatabase();
    const gameId = startGame(db, TEST_DEVICE_ID);
    for (let frame = 1; frame <= 9; frame++) {
      assert.equal(recordRoll(db, TEST_DEVICE_ID, gameId, 5, { kind: "omit" }).ok, true);
      assert.equal(recordRoll(db, TEST_DEVICE_ID, gameId, 5, { kind: "omit" }).ok, true);
    }
    for (const pins of [5, 5, 5]) {
      assert.equal(recordRoll(db, TEST_DEVICE_ID, gameId, pins, { kind: "omit" }).ok, true);
    }
    const view = loadScoringView(db, gameId);
    assert.equal(view.sheet?.finalTotal, 150);
    const analysis = analyzeScoringView(view)!;
    assert.equal(analysis.firstBall.denominator, 10);
    assert.equal(analysis.firstBall.strikes, 0);
    assert.equal(analysis.firstBall.averagePinfall, 5);
    assert.equal(analysis.spares.opportunities, 9);
    assert.equal(analysis.spares.conversions, 9);
    assert.equal(analysis.spares.conversionRate, 100);
  });

  it("recorded leaves flow into common leaves and spare breakdowns", () => {
    const db = openDatabase();
    const gameId = startGame(db, TEST_DEVICE_ID);
    assert.equal(recordRoll(db, TEST_DEVICE_ID, gameId, 8, { kind: "omit" }).ok, true);
    let view = loadScoringView(db, gameId);
    const firstBall = view.rolls.find(
      (r) => r.frame_number === 1 && r.roll_number === 1,
    )!;
    assert.equal(addPinDetail(db, TEST_DEVICE_ID, firstBall.entity_id, [7, 10]).ok, true);
    assert.equal(recordRoll(db, TEST_DEVICE_ID, gameId, 2, { kind: "omit" }).ok, true);
    view = loadScoringView(db, gameId);
    const analysis = analyzeScoringView(view);
    assert.ok(analysis);
    // Game incomplete: per-game rates stay ineligible until completion.
    assert.equal(analysis!.eligible, false);
    assert.equal(analysis!.exclusionReason, "incomplete");
    // The recorded detail still flows into the §6.2/§6.3 computers for use
    // once the game completes; nothing is lost or invented meanwhile.
    const leaves = analyzeLeaves(view.rolls);
    assert.equal(leaves.recordedCount, 1);
    assert.deepEqual(leaves.counted[0], { standing: [7, 10], count: 1 });
    const spares = analyzeSpares(view.rolls);
    assert.equal(spares.byLeave.length, 1);
    assert.deepEqual(spares.byLeave[0], {
      standing: [7, 10],
      opportunities: 1,
      conversions: 1,
    });
  });

  it("completed game with recorded detail counts leaves on eligibility", () => {
    const db = openDatabase();
    const gameId = startGame(db, TEST_DEVICE_ID);
    for (let frame = 1; frame <= 10; frame++) {
      assert.equal(recordRoll(db, TEST_DEVICE_ID, gameId, 5, { kind: "omit" }).ok, true);
      const first = loadScoringView(db, gameId).rolls.find(
        (r) => r.frame_number === frame && r.roll_number === 1,
      )!;
      assert.equal(
        addPinDetail(db, TEST_DEVICE_ID, first.entity_id, [6, 7, 8, 9, 10]).ok,
        true,
      );
      assert.equal(recordRoll(db, TEST_DEVICE_ID, gameId, 3, { kind: "omit" }).ok, true);
    }
    const view = loadScoringView(db, gameId);
    assert.equal(view.sheet?.status, "COMPLETED");
    const analysis = analyzeScoringView(view)!;
    assert.equal(analysis.eligible, true);
    assert.equal(analysis.leaves.recordedCount, 10);
    assert.deepEqual(analysis.leaves.counted[0], {
      standing: [6, 7, 8, 9, 10],
      count: 10,
    });
    assert.equal(analysis.leaves.missingCount, 0);
  });

  it("incomplete games stay listed but out of rates", () => {
    const db = openDatabase();
    const gameId = startGame(db, TEST_DEVICE_ID);
    assert.equal(recordRoll(db, TEST_DEVICE_ID, gameId, 7, { kind: "omit" }).ok, true);
    const detailed = listGameHistoryDetailed(db);
    assert.equal(detailed.length, 1);
    assert.equal(detailed[0]?.status, "active");
    const analysis = analyzeScoringView(loadScoringView(db, gameId))!;
    assert.equal(analysis.eligible, false);
  });

  it("repair-needed games are excluded but preserved", () => {
    const db = openDatabase();
    const gameId = startGame(db, TEST_DEVICE_ID);
    assert.equal(recordRoll(db, TEST_DEVICE_ID, gameId, 5, { kind: "omit" }).ok, true);
    assert.equal(recordRoll(db, TEST_DEVICE_ID, gameId, 3, { kind: "omit" }).ok, true);
    const first = loadScoringView(db, gameId).rolls.find(
      (r) => r.frame_number === 1 && r.roll_number === 1,
    )!;
    assert.equal(correctRoll(db, TEST_DEVICE_ID, first.entity_id, 10).ok, true);
    const view = loadScoringView(db, gameId);
    assert.equal(view.sheet?.status, "DOMAIN_INVALID_REQUIRING_REPAIR");
    const analysis = analyzeScoringView(view)!;
    assert.equal(analysis.eligible, false);
    assert.equal(analysis.exclusionReason, "repair");
    assert.equal(listGameHistoryDetailed(db)[0]?.status, "repair");
  });
});

describe("B2 display formatting", () => {
  it("eligible games render clear lines with leave rows and coverage", () => {
    const lines = formatGameAnalysis({
      gameId: "g",
      eligible: true,
      exclusionReason: null,
      firstBall: { denominator: 10, strikes: 7, strikeRate: 70, averagePinfall: 9.1 },
      leaves: {
        counted: [
          { standing: [7, 10], count: 2 },
          { standing: [5], count: 1 },
        ],
        recordedCount: 3,
        missingCount: 6,
        emptyCount: 1,
      },
      spares: {
        opportunities: 2,
        conversions: 1,
        conversionRate: 50,
        byLeave: [{ standing: [7, 10], opportunities: 2, conversions: 1 }],
        missingDetailOpportunities: 0,
      },
    });
    assert.equal(lines.length, 6);
    assert.ok(lines[0]!.includes("7/10"));
    assert.ok(lines[0]!.includes("70%"));
    assert.ok(lines[1]!.includes("1/2"));
    assert.ok(lines[2]!.startsWith("Leaves"));
    assert.ok(lines[3]!.includes("7-10"));
    assert.ok(lines[3]!.includes("faced 2"));
    assert.ok(lines[3]!.includes("picked up 1/2"));
    assert.ok(lines[4]!.includes("5 (single)"));
    assert.ok(lines[5]!.includes("3/10 first balls"));
  });

  it("empty and ineligible states never invent numbers", () => {
    const noChances = formatGameAnalysis({
      gameId: "g",
      eligible: true,
      exclusionReason: null,
      firstBall: { denominator: 0, strikes: 0, strikeRate: null, averagePinfall: null },
      leaves: { counted: [], recordedCount: 0, missingCount: 0, emptyCount: 0 },
      spares: {
        opportunities: 0,
        conversions: 0,
        conversionRate: null,
        byLeave: [],
        missingDetailOpportunities: 0,
      },
    });
    assert.ok(noChances[0]!.includes("—"));
    assert.ok(noChances[1]!.includes("no chances"));
    assert.ok(noChances[2]!.includes("no pin detail"));
    const out = formatGameAnalysis({
      gameId: "g",
      eligible: false,
      exclusionReason: "repair",
      firstBall: { denominator: 0, strikes: 0, strikeRate: null, averagePinfall: null },
      leaves: { counted: [], recordedCount: 0, missingCount: 0, emptyCount: 0 },
      spares: {
        opportunities: 0,
        conversions: 0,
        conversionRate: null,
        byLeave: [],
        missingDetailOpportunities: 0,
      },
    });
    assert.deepEqual(out, ["Not eligible: needs repair."]);
  });
});
