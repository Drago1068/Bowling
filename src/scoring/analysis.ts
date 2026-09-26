import type { ScoringView } from "./session.ts";

/**
 * B2 per-game analysis implementing ADR-007 §6.1–§6.3 over already-recorded
 * facts. Derived only — never a second authoritative store. No causal
 * coaching claims. Historical aggregation is B3; trends are deferred.
 */

export type FirstBallAnalysis = {
  /** Eligible frame-opening deliveries with recorded pinfall. */
  denominator: number;
  strikes: number;
  strikeRate: number | null;
  averagePinfall: number | null;
};

export type LeaveCount = { standing: number[]; count: number };

export type LeavesAnalysis = {
  /** Exact-set frequencies among explicitly recorded nonempty standing sets. */
  counted: LeaveCount[];
  recordedCount: number;
  missingCount: number;
  emptyCount: number;
};

export type SpareLeaveBreakdown = {
  standing: number[];
  opportunities: number;
  conversions: number;
};

export type SparesAnalysis = {
  opportunities: number;
  conversions: number;
  conversionRate: number | null;
  byLeave: SpareLeaveBreakdown[];
  /** Opportunities whose first-ball standing detail is missing. */
  missingDetailOpportunities: number;
};

export type GameAnalysis = {
  gameId: string;
  eligible: boolean;
  exclusionReason: "incomplete" | "repair" | null;
  firstBall: FirstBallAnalysis;
  leaves: LeavesAnalysis;
  spares: SparesAnalysis;
};

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function standingKey(standing: readonly number[]): string {
  return [...standing].sort((a, b) => a - b).join(",");
}

type AnalyzableRoll = {
  frame_number: number;
  roll_number: number;
  pinfall: number;
  standing_pins: number[] | null;
};

function openingRolls(rolls: readonly AnalyzableRoll[]): AnalyzableRoll[] {
  // Frame-opening deliveries only: roll 1 of frames 1–10. Tenth fills excluded.
  return rolls.filter((r) => r.roll_number === 1);
}

export function analyzeFirstBall(rolls: readonly AnalyzableRoll[]): FirstBallAnalysis {
  const eligible = openingRolls(rolls).filter(
    (r) => r.pinfall != null && r.pinfall >= 0 && r.pinfall <= 10,
  );
  const denominator = eligible.length;
  if (denominator === 0) {
    return { denominator: 0, strikes: 0, strikeRate: null, averagePinfall: null };
  }
  const strikes = eligible.filter((r) => r.pinfall === 10).length;
  const sum = eligible.reduce((a, r) => a + r.pinfall, 0);
  return {
    denominator,
    strikes,
    strikeRate: round1((strikes / denominator) * 100),
    averagePinfall: round1(sum / denominator),
  };
}

export function analyzeLeaves(rolls: readonly AnalyzableRoll[]): LeavesAnalysis {
  const openings = openingRolls(rolls);
  let missingCount = 0;
  let emptyCount = 0;
  const freq = new Map<string, { standing: number[]; count: number }>();
  for (const r of openings) {
    const standing = r.standing_pins;
    if (!standing) {
      missingCount++;
      continue;
    }
    if (standing.length === 0) {
      emptyCount++;
      continue;
    }
    const key = standingKey(standing);
    const existing = freq.get(key);
    if (existing) existing.count++;
    else freq.set(key, { standing: [...standing].sort((a, b) => a - b), count: 1 });
  }
  const counted = [...freq.values()].sort((a, b) => b.count - a.count);
  return {
    counted,
    recordedCount: counted.reduce((a, c) => a + c.count, 0),
    missingCount,
    emptyCount,
  };
}

export function analyzeSpares(rolls: readonly AnalyzableRoll[]): SparesAnalysis {
  // Frames 1–9 only. Opportunity: non-strike first delivery with a second ball.
  const byFrame = new Map<number, AnalyzableRoll[]>();
  for (const r of rolls) {
    if (r.frame_number < 1 || r.frame_number > 9) continue;
    const list = byFrame.get(r.frame_number) ?? [];
    list.push(r);
    byFrame.set(r.frame_number, list);
  }
  let opportunities = 0;
  let conversions = 0;
  let missingDetailOpportunities = 0;
  const byLeave = new Map<string, SpareLeaveBreakdown>();
  for (const [, frameRolls] of byFrame) {
    const first = frameRolls
      .filter((r) => r.roll_number === 1)
      .sort((a, b) => a.pinfall - b.pinfall)[0];
    const second = frameRolls
      .filter((r) => r.roll_number === 2)
      .sort((a, b) => a.pinfall - b.pinfall)[0];
    if (!first || first.pinfall >= 10 || !second) continue;
    opportunities++;
    const converted = first.pinfall + second.pinfall === 10;
    if (converted) conversions++;
    const standing = first.standing_pins;
    if (!standing || standing.length === 0) {
      missingDetailOpportunities++;
      continue;
    }
    const key = standingKey(standing);
    const existing = byLeave.get(key);
    if (existing) {
      existing.opportunities++;
      if (converted) existing.conversions++;
    } else {
      byLeave.set(key, {
        standing: [...standing].sort((a, b) => a - b),
        opportunities: 1,
        conversions: converted ? 1 : 0,
      });
    }
  }
  return {
    opportunities,
    conversions,
    conversionRate:
      opportunities === 0 ? null : round1((conversions / opportunities) * 100),
    byLeave: [...byLeave.values()].sort((a, b) => b.opportunities - a.opportunities),
    missingDetailOpportunities,
  };
}

export function analyzeGameView(
  gameId: string,
  sheetStatus: string | null,
  rolls: readonly AnalyzableRoll[],
): GameAnalysis {
  if (sheetStatus === "DOMAIN_INVALID_REQUIRING_REPAIR") {
    return {
      gameId,
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
    };
  }
  if (sheetStatus !== "COMPLETED") {
    return {
      gameId,
      eligible: false,
      exclusionReason: "incomplete",
      firstBall: { denominator: 0, strikes: 0, strikeRate: null, averagePinfall: null },
      leaves: { counted: [], recordedCount: 0, missingCount: 0, emptyCount: 0 },
      spares: {
        opportunities: 0,
        conversions: 0,
        conversionRate: null,
        byLeave: [],
        missingDetailOpportunities: 0,
      },
    };
  }
  return {
    gameId,
    eligible: true,
    exclusionReason: null,
    firstBall: analyzeFirstBall(rolls),
    leaves: analyzeLeaves(rolls),
    spares: analyzeSpares(rolls),
  };
}

/** Convenience over a loaded scoring view. Returns null when no game is open. */
export function analyzeScoringView(
  view: Pick<ScoringView, "gameId" | "sheet" | "rolls"> | null,
): GameAnalysis | null {
  if (!view?.gameId || !view.sheet) return null;
  return analyzeGameView(view.gameId, view.sheet.status, view.rolls);
}

function pct(rate: number | null): string {
  return rate == null ? "—" : `${rate}%`;
}

/** Bowling-style leave label: "7 (single)", "3-6-10", or "All 10 standing". */
export function leaveLabel(standing: readonly number[]): string {
  const sorted = [...standing].sort((a, b) => a - b);
  if (sorted.length === 0) return "—";
  if (sorted.length === 10) return "All 10 standing";
  if (sorted.length === 1) return `${sorted[0]} (single)`;
  return sorted.join("-");
}

export type LeaveRow = {
  label: string;
  /** First balls that left this exact pin set (frames 1–10). */
  faced: number;
  /** Spare chances for this leave in frames 1–9; null when none recorded. */
  chances: number | null;
  /** Spare conversions for this leave; null when no spare chance was recorded. */
  pickedUp: number | null;
};

/**
 * One row per recorded leave, joined with the spare breakdown for the same
 * pin set so "faced" and "picked up" sit side by side.
 */
export function leaveRows(analysis: GameAnalysis): LeaveRow[] {
  const spareByKey = new Map<string, { opportunities: number; conversions: number }>();
  for (const b of analysis.spares.byLeave) {
    spareByKey.set(standingKey(b.standing), {
      opportunities: b.opportunities,
      conversions: b.conversions,
    });
  }
  return analysis.leaves.counted.map((c) => {
    const spare = spareByKey.get(standingKey(c.standing));
    return {
      label: leaveLabel(c.standing),
      faced: c.count,
      chances: spare ? spare.opportunities : null,
      pickedUp: spare ? spare.conversions : null,
    };
  });
}

/** Single-pin vs multi-pin spare conversion from recorded leave detail. */
export function sparePinSplit(spares: SparesAnalysis): {
  single: { conversions: number; opportunities: number } | null;
  multi: { conversions: number; opportunities: number } | null;
} {
  let single: { conversions: number; opportunities: number } | null = null;
  let multi: { conversions: number; opportunities: number } | null = null;
  for (const b of spares.byLeave) {
    const target = b.standing.length === 1
      ? (single ??= { conversions: 0, opportunities: 0 })
      : (multi ??= { conversions: 0, opportunities: 0 });
    target.conversions += b.conversions;
    target.opportunities += b.opportunities;
  }
  return { single, multi };
}

/** Short display lines for one eligible game; ineligible games get one line. */
export function formatGameAnalysis(analysis: GameAnalysis): string[] {
  if (!analysis.eligible) {
    return [
      analysis.exclusionReason === "repair"
        ? "Not eligible: needs repair."
        : "Not eligible: game incomplete.",
    ];
  }
  const fb = analysis.firstBall;
  const lines = [
    `First ball — avg ${fb.averagePinfall ?? "—"} pins · struck ${fb.strikes}/${fb.denominator} (${pct(fb.strikeRate)})`,
  ];
  const sp = analysis.spares;
  lines.push(
    sp.opportunities === 0
      ? "Spares — no chances."
      : `Spares — picked up ${sp.conversions}/${sp.opportunities} (${pct(sp.conversionRate)})`,
  );
  const lv = analysis.leaves;
  const openings = lv.recordedCount + lv.missingCount + lv.emptyCount;
  const rows = leaveRows(analysis);
  if (rows.length === 0) {
    lines.push(`Leaves — no pin detail recorded (missing ${lv.missingCount}).`);
  } else {
    lines.push("Leaves — faced, picked up:");
    for (const row of rows) {
      lines.push(
        `  ${row.label}: faced ${row.faced}` +
          (row.pickedUp != null && row.chances != null
            ? `, picked up ${row.pickedUp}/${row.chances}`
            : ""),
      );
    }
    lines.push(
      `Pin detail on ${lv.recordedCount}/${openings} first balls (${lv.missingCount} not recorded).`,
    );
  }
  return lines;
}
