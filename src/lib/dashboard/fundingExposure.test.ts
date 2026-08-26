import { describe, expect, it } from "vitest";
import {
  buildFundingExposureMatrix,
  buildFundingExposureTimeline,
} from "@/lib/dashboard/fundingExposure";
import { buildFundingMixForEmployees, UNATTRIBUTED_MIX_KEY } from "@/lib/dashboard/metrics";
import { DEFAULT_SETTINGS } from "@/types";
import type {
  AppSettings,
  Employee,
  FundingSource,
  MonthlyAllocation,
  MonthlyCostRecord,
  PayrollReportSnapshot,
} from "@/types";
import type { AccountBalance } from "@/lib/funding/accountBalances";

function emp(id: string, name: string, hrId: string): Employee {
  return { id, name, appointmentPercent: 100, employeeId: hrId };
}

function fs(id: string, account: string, alias: string): FundingSource {
  return { id, rawName: account, alias, accountString: account, fund: "7000", color: "#ccc" };
}

function costRows(month: string, employeeId: string, fundingSourceId: string | null, total: number): MonthlyCostRecord[] {
  const rows: MonthlyCostRecord[] = [
    { id: `t-${employeeId}-${month}`, employeeId, month, rowType: "totalCompBenefits", amount: total, sourceType: "actual" },
  ];
  if (fundingSourceId) {
    rows.push(
      { id: `s-${employeeId}-${month}`, employeeId, fundingSourceId, month, rowType: "baseSalary", amount: total * 0.75, sourceType: "actual" },
      { id: `b-${employeeId}-${month}`, employeeId, month, rowType: "benefits", amount: total * 0.25, sourceType: "actual" }
    );
  }
  return rows;
}

function alloc(month: string, employeeId: string, fundingSourceId: string, pct = 100): MonthlyAllocation {
  return {
    id: `${employeeId}|${fundingSourceId}|${month}`,
    employeeId,
    fundingSourceId,
    month,
    percentEffort: pct,
    sourceType: "actual",
    status: "imported",
  };
}

// 6 sources across 6 distinct default categories, descending cost so the
// 6th (lowest, researchPlanReviews) is the one that should collapse to "other".
const SOURCES: { id: string; category: string; cost: number }[] = [
  { id: "f1", category: "startup", cost: 600 },
  { id: "f2", category: "projects", cost: 500 },
  { id: "f3", category: "endowment", cost: 400 },
  { id: "f4", category: "institutional", cost: 300 },
  { id: "f5", category: "largeGrants", cost: 200 },
  { id: "f6", category: "researchPlanReviews", cost: 100 },
];
const UNATTRIBUTED_COST = 50;
const MONTH = "2026-08";

const fundingSources = SOURCES.map((s) => fs(s.id, `7000-1-${s.id}-45`, s.id));
const employees = [
  ...SOURCES.map((s, i) => emp(`e${i + 1}`, `Person ${i + 1}`, `100${i + 1}`)),
  emp("e7", "Unattributed Person", "1007"),
];

const costs = [
  ...SOURCES.flatMap((s, i) => costRows(MONTH, `e${i + 1}`, s.id, s.cost)),
  ...costRows(MONTH, "e7", null, UNATTRIBUTED_COST),
];

const allocations = SOURCES.map((s, i) => alloc(MONTH, `e${i + 1}`, s.id));

const settings: AppSettings = {
  ...DEFAULT_SETTINGS,
  fundingSourceCategories: Object.fromEntries(SOURCES.map((s) => [s.id, s.category])),
};

function snapshot(months: string[], extraCosts: MonthlyCostRecord[] = []): PayrollReportSnapshot {
  return {
    id: "snap",
    sourceFileName: "test.xlsx",
    uploadedAt: "2026-08-01T00:00:00.000Z",
    reportName: "t",
    sheetName: "Sheet1",
    parserVersion: "1",
    parseStatus: "success",
    parseWarnings: [],
    employees,
    fundingSources,
    monthlyAllocations: allocations,
    monthlyCosts: [...costs, ...extraCosts],
    rawRows: [],
    monthRange: { start: months[0]!, end: months[months.length - 1]! },
    actualMonths: months,
    futureMonths: [],
  };
}

function balances(): Map<string, AccountBalance> {
  return new Map();
}

describe("buildFundingExposureTimeline", () => {
  it("caps at the top 5 categories by window total, collapsing the rest into 'other', with unattributed last", () => {
    const snap = snapshot([MONTH]);
    const timeline = buildFundingExposureTimeline({
      snapshot: snap,
      workingPlan: null,
      fundingSources,
      settings,
      balances: balances(),
      horizonMonths: 1,
    });

    expect(timeline.months).toEqual([MONTH]);
    const keys = timeline.bands.map((b) => b.key);
    expect(keys).toEqual(["startup", "projects", "endowment", "institutional", "largeGrants", "other", UNATTRIBUTED_MIX_KEY]);

    const byKey = new Map(timeline.bands.map((b) => [b.key, b.values[0]!]));
    expect(byKey.get("startup")).toBeCloseTo(600, 5);
    expect(byKey.get("projects")).toBeCloseTo(500, 5);
    expect(byKey.get("endowment")).toBeCloseTo(400, 5);
    expect(byKey.get("institutional")).toBeCloseTo(300, 5);
    expect(byKey.get("largeGrants")).toBeCloseTo(200, 5);
    // researchPlanReviews ($100), the 6th, collapses into "other".
    expect(byKey.get("other")).toBeCloseTo(100, 5);
    expect(byKey.get(UNATTRIBUTED_MIX_KEY)).toBeCloseTo(UNATTRIBUTED_COST, 5);
  });

  it("matches buildFundingMixForEmployees exactly for an actual month — no reimplemented math", () => {
    const snap = snapshot([MONTH]);
    const timeline = buildFundingExposureTimeline({
      snapshot: snap,
      workingPlan: null,
      fundingSources,
      settings,
      balances: balances(),
      horizonMonths: 1,
    });

    const direct = buildFundingMixForEmployees(employees, [MONTH], snap, fundingSources, settings);
    const directStartup = direct.find((s) => s.key === "startup")!.value;
    const bandStartup = timeline.bands.find((b) => b.key === "startup")!.values[0]!;
    expect(bandStartup).toBeCloseTo(directStartup, 5);
  });

  it("holds cost flat into projected months when nothing changes, and keeps the same fixed band order", () => {
    const snap = snapshot([MONTH]);
    const timeline = buildFundingExposureTimeline({
      snapshot: snap,
      workingPlan: null,
      fundingSources,
      settings,
      balances: balances(),
      horizonMonths: 3,
    });

    expect(timeline.months.length).toBeGreaterThan(1);
    expect(timeline.uncertaintyStartIndex).toBe(1); // one actual month, then projected
    // The unattributed employee (e7) has no funding-source allocation to carry
    // forward, so only the SOURCES total (not the unattributed $50) projects —
    // an expected asymmetry, not a bug: simulateProjections only ever tracks
    // allocated effort.
    const sourcesTotal = SOURCES.reduce((sum, s) => sum + s.cost, 0);
    const firstProjected = timeline.totalByMonth[timeline.uncertaintyStartIndex]!;
    expect(firstProjected).toBeCloseTo(sourcesTotal, 0);
  });
});

describe("buildFundingExposureMatrix", () => {
  it("uses the band's own capped category set and sums each row to ~100%", () => {
    const groupedSettings: AppSettings = {
      ...settings,
      employeePersonnelTypes: {
        e1: "researchDevelopment",
        e2: "researchDevelopment",
        e3: "dataManagement",
        e4: "dataManagement",
        e5: "dataManagement",
        e6: "dataManagement",
        e7: "dataManagement",
      },
    };
    const snap = snapshot([MONTH]);
    const timeline = buildFundingExposureTimeline({
      snapshot: snap,
      workingPlan: null,
      fundingSources,
      settings: groupedSettings,
      balances: balances(),
      horizonMonths: 1,
    });

    const matrix = buildFundingExposureMatrix({
      snapshot: snap,
      fundingSources,
      settings: groupedSettings,
      planningMonth: MONTH,
      categories: timeline.bands,
    });

    expect(matrix.categories.map((c) => c.key)).toEqual(timeline.bands.map((b) => b.key));
    for (const row of matrix.rows) {
      const pctSum = row.cells.reduce((sum, c) => sum + c.pct, 0);
      expect(pctSum).toBeCloseTo(100, 0);
    }

    const research = matrix.rows.find((r) => r.groupLabel === "Research development")!;
    // e1 ($600, startup) + e2 ($500, projects) = $1,100 total for this group.
    expect(research.total).toBeCloseTo(1100, 5);
    expect(research.cells.find((c) => c.categoryKey === "startup")!.pct).toBeCloseTo((600 / 1100) * 100, 3);
  });
});

describe("categorization coverage", () => {
  it("reports the unattributed share against total cost", () => {
    const snap = snapshot([MONTH]);
    const timeline = buildFundingExposureTimeline({
      snapshot: snap,
      workingPlan: null,
      fundingSources,
      settings,
      balances: balances(),
      horizonMonths: 1,
    });

    const total = timeline.totalByMonth[0]!;
    const unattributed = timeline.bands.find((b) => b.key === UNATTRIBUTED_MIX_KEY)!.values[0]!;
    expect(timeline.uncategorizedShare).toBeCloseTo(unattributed / total, 5);
    // Well-categorized fixture: the share must stay below the point where the
    // chart would suppress itself.
    expect(timeline.uncategorizedShare).toBeLessThan(1);
  });

  it("reaches a share of 1 when no account carries a funding type", () => {
    const snap = snapshot([MONTH]);
    // Strip every account→type mapping; the accounts and costs are untouched.
    const uncategorizedSettings = { ...settings, fundingSourceCategories: {} };
    const timeline = buildFundingExposureTimeline({
      snapshot: snap,
      workingPlan: null,
      fundingSources,
      settings: uncategorizedSettings,
      balances: balances(),
      horizonMonths: 1,
    });

    expect(timeline.uncategorizedShare).toBe(1);
    // Every dollar lands in a non-type bucket, so there is no mix to draw.
    const realTypes = timeline.bands.filter(
      (b) => b.key !== UNATTRIBUTED_MIX_KEY && b.key !== "uncategorized"
    );
    expect(realTypes.every((b) => b.values.every((v) => v === 0))).toBe(true);
  });

  it("carries the same coverage figure into the by-team matrix", () => {
    const snap = snapshot([MONTH]);
    const uncategorizedSettings = { ...settings, fundingSourceCategories: {} };
    const timeline = buildFundingExposureTimeline({
      snapshot: snap,
      workingPlan: null,
      fundingSources,
      settings: uncategorizedSettings,
      balances: balances(),
      horizonMonths: 1,
    });
    const matrix = buildFundingExposureMatrix({
      snapshot: snap,
      fundingSources,
      settings: uncategorizedSettings,
      planningMonth: MONTH,
      categories: timeline.bands,
    });

    expect(matrix.uncategorizedShare).toBe(1);
  });
});
