import { describe, expect, it } from "vitest";
import {
  buildRunwayRibbon,
  collapseBands,
  ribbonTotals,
  RIBBON_OTHER_ROOT,
  type RibbonBand,
} from "@/lib/dashboard/runwayRibbon";
import { DEFAULT_SETTINGS } from "@/types";
import { NOT_MY_ACCOUNTS_GROUP_ID } from "@/lib/catalog/defaults";
import type {
  AppSettings,
  Employee,
  FundingSource,
  MonthlyAllocation,
  MonthlyCostRecord,
  PayrollReportSnapshot,
  ProjectionRule,
} from "@/types";
import type { MergedPortfolioBalance } from "@/lib/portfolio/mergeBalances";

const NOW = new Date(2026, 7, 15); // Aug 2026

function emp(id = "e1", name = "Ada Lovelace"): Employee {
  return { id, name, appointmentPercent: 100, employeeId: "1001" };
}

function fs(id = "f1", account = "7000-1-7030720-45", alias = "Grant A"): FundingSource {
  return { id, rawName: account, alias, accountString: account, fund: "7000", color: "#ccc" };
}

function alloc(month: string, pct: number, employeeId = "e1", fundingSourceId = "f1"): MonthlyAllocation {
  return {
    id: `${employeeId}|${fundingSourceId}|${month}`,
    employeeId,
    fundingSourceId,
    month,
    percentEffort: pct,
    sourceType: month >= "2026-08" ? "future" : "actual",
    status: "imported",
  };
}

function costs(month: string, employeeId = "e1", fundingSourceId = "f1", amount = 10_000): MonthlyCostRecord[] {
  return [
    { id: `s-${employeeId}-${month}`, employeeId, fundingSourceId, month, rowType: "baseSalary", amount: amount * 0.75, sourceType: "actual" },
    { id: `b-${employeeId}-${month}`, employeeId, month, rowType: "benefits", amount: amount * 0.25, sourceType: "actual" },
    { id: `t-${employeeId}-${month}`, employeeId, month, rowType: "totalCompBenefits", amount, sourceType: "actual" },
  ];
}

function snapshot(
  months: string[],
  employees: Employee[] = [emp()],
  fundingSources: FundingSource[] = [fs()],
  extra?: Partial<PayrollReportSnapshot>
): PayrollReportSnapshot {
  const allocations = months.flatMap((m) => employees.map((e) => alloc(m, 100, e.id, fundingSources[0]!.id)));
  const monthlyCosts = months.flatMap((m) => employees.flatMap((e) => costs(m, e.id, fundingSources[0]!.id)));
  return {
    id: "snap",
    sourceFileName: "test.xlsx",
    uploadedAt: "2026-07-01T00:00:00.000Z",
    reportName: "test",
    sheetName: "Sheet1",
    parserVersion: "1",
    parseStatus: "success",
    parseWarnings: [],
    employees,
    fundingSources,
    monthlyAllocations: allocations,
    monthlyCosts,
    rawRows: [],
    monthRange: { start: months[0]!, end: months[months.length - 1]! },
    actualMonths: months.filter((m) => m < "2026-08"),
    futureMonths: months.filter((m) => m >= "2026-08"),
    ...extra,
  };
}

function settings(patch: Partial<AppSettings> = {}): AppSettings {
  return { ...DEFAULT_SETTINGS, ...patch };
}

function portfolio(balance: number, account = "7000-1-7030720-45"): Map<string, MergedPortfolioBalance> {
  return new Map([
    [account, { chartstring: account, balance, reportRunDate: "2026-07-31", sourceFileName: "mp.xlsx" }],
  ]);
}

describe("buildRunwayRibbon", () => {
  it("stacks account balances into bands whose sum matches the total", () => {
    const snap = snapshot(["2026-07", "2026-08"]);
    const ribbon = buildRunwayRibbon({
      snapshot: snap,
      workingPlan: null,
      settings: settings(),
      now: NOW, portfolio: portfolio(100_000),
    });
    expect(ribbon.bands).toHaveLength(1);
    expect(ribbon.months).toHaveLength(24);
    ribbon.months.forEach((_, i) => {
      const bandSum = ribbon.bands.reduce((sum, b) => sum + (b.values[i] ?? 0), 0);
      expect(ribbon.totalByMonth[i]).toBeCloseTo(bandSum, 5);
    });
  });

  it("marks the month a band reaches zero, floored there per simulateProjections' own semantics", () => {
    // 10,000/mo burn against a 25,000 balance depletes partway through month 3.
    const snap = snapshot(["2026-07", "2026-08"]);
    const ribbon = buildRunwayRibbon({
      snapshot: snap,
      workingPlan: null,
      settings: settings(),
      now: NOW, portfolio: portfolio(25_000),
    });
    const band = ribbon.bands[0]!;
    expect(band.depletionMonthIndex).not.toBeNull();
    expect(band.values[band.depletionMonthIndex!]).toBe(0);
    // Never negative — the canonical engine floors at zero, by design.
    expect(band.values.every((v) => v >= 0)).toBe(true);
  });

  it("reports terminalIndex null when funds outlast the horizon", () => {
    const snap = snapshot(["2026-07", "2026-08"]);
    const ribbon = buildRunwayRibbon({
      snapshot: snap,
      workingPlan: null,
      settings: settings(),
      now: NOW, portfolio: portfolio(10_000_000),
    });
    expect(ribbon.terminalIndex).toBeNull();
  });

  it("reports terminalIndex at the month the total crosses zero", () => {
    const snap = snapshot(["2026-07", "2026-08"]);
    const ribbon = buildRunwayRibbon({
      snapshot: snap,
      workingPlan: null,
      settings: settings(),
      now: NOW, portfolio: portfolio(15_000),
    });
    expect(ribbon.terminalIndex).toBe(1); // 15,000 balance, 10,000/mo burn: gone during month 2 (index 1)
  });

  it("builds a funding-end marker from the roster end date when no rule overrides it", () => {
    const e = { ...emp(), } as Employee;
    const snap = snapshot(["2026-08"], [e]);
    const s = settings({
      employeeProfiles: { [e.id]: { endDate: "2026-10-15" } },
    });
    const ribbon = buildRunwayRibbon({ snapshot: snap, workingPlan: null, settings: s, now: NOW, portfolio: portfolio(1_000_000) });
    const marker = ribbon.markers.find((m) => m.employeeName === e.name);
    expect(marker?.month).toBe("2026-10");
    expect(marker?.description).toBe("Employment ends");
  });

  it("prefers an explicit onDate employment rule over the roster end date", () => {
    const e = emp();
    const snap = snapshot(["2026-08"], [e]);
    const rule: ProjectionRule = {
      id: "r1",
      personKey: "hr:1001",
      trigger: { type: "onDate", month: "2026-12" },
      remainder: { kind: "endEmployment" },
    };
    const s = settings({
      employeeProfiles: { [e.id]: { endDate: "2026-10-15" } },
      projectionRules: [rule],
    });
    const ribbon = buildRunwayRibbon({ snapshot: snap, workingPlan: null, settings: s, now: NOW, portfolio: portfolio(1_000_000) });
    const marker = ribbon.markers.find((m) => m.employeeName === e.name);
    expect(marker?.month).toBe("2026-12");
  });

  it("builds an account-specific marker from a chartstringKey-scoped onDate rule", () => {
    const e = emp();
    const source = fs();
    const snap = snapshot(["2026-08"], [e], [source]);
    const rule: ProjectionRule = {
      id: "r1",
      personKey: "hr:1001",
      chartstringKey: "7000-1-7030720-45",
      trigger: { type: "onDate", month: "2026-11" },
      remainder: { kind: "uncovered" },
    };
    const s = settings({ projectionRules: [rule] });
    const ribbon = buildRunwayRibbon({ snapshot: snap, workingPlan: null, settings: s, now: NOW, portfolio: portfolio(1_000_000) });
    const marker = ribbon.markers.find((m) => m.month === "2026-11");
    expect(marker?.description).toBe("Funding ends");
    expect(marker?.employeeName).toBe(e.name);
  });

  it("respects projectionIgnoreRosterEndDates", () => {
    const e = emp();
    const snap = snapshot(["2026-08"], [e]);
    const s = settings({
      employeeProfiles: { [e.id]: { endDate: "2026-10-15" } },
      projectionIgnoreRosterEndDates: ["hr:1001"],
    });
    const ribbon = buildRunwayRibbon({ snapshot: snap, workingPlan: null, settings: s, now: NOW, portfolio: portfolio(1_000_000) });
    expect(ribbon.markers.find((m) => m.employeeName === e.name)).toBeUndefined();
  });

  it("flags bands with a currently active employee charging effort against them this month", () => {
    const e = emp();
    const fs1 = fs("f1", "7000-1-7030720-45", "Grant A");
    const fs2 = fs("f2", "9500-2-9029200-90", "Grant B");
    const snap = snapshot(["2026-07", "2026-08"], [e], [fs1, fs2]);
    const port = new Map([
      ["7000-1-7030720-45", { chartstring: "7000-1-7030720-45", balance: 100_000, reportRunDate: "2026-07-31", sourceFileName: "mp.xlsx" }],
      ["9500-2-9029200-90", { chartstring: "9500-2-9029200-90", balance: 50_000, reportRunDate: "2026-07-31", sourceFileName: "mp.xlsx" }],
    ]);
    const ribbon = buildRunwayRibbon({ snapshot: snap, workingPlan: null, settings: settings(), now: NOW, portfolio: port });
    const staffed = ribbon.bands.find((b) => b.chartRoot.includes("7030720"));
    const unstaffed = ribbon.bands.find((b) => b.chartRoot.includes("9029200"));
    expect(staffed?.hasCurrentPersonnel).toBe(true);
    expect(unstaffed?.hasCurrentPersonnel).toBe(false);
  });

  it("caps markers and reports the hidden count", () => {
    const employees = Array.from({ length: 8 }, (_, i) => emp(`e${i}`, `Person ${i}`));
    const snap = snapshot(["2026-08"], employees);
    const s = settings({
      employeeProfiles: Object.fromEntries(employees.map((e) => [e.id, { endDate: "2026-09-15" }])),
    });
    const ribbon = buildRunwayRibbon({ snapshot: snap, workingPlan: null, settings: s, now: NOW, portfolio: portfolio(1_000_000) });
    expect(ribbon.markers).toHaveLength(5);
    expect(ribbon.hiddenMarkerCount).toBe(3);
  });
});

describe("ribbonTotals", () => {
  it("sums only the given subset of bands per month", () => {
    const bands = [
      { chartRoot: "a", label: "A", values: [10, 5, 0], depletionMonthIndex: 2, hasCurrentPersonnel: true },
      { chartRoot: "b", label: "B", values: [20, 20, 20], depletionMonthIndex: null, hasCurrentPersonnel: false },
    ];
    const { totalByMonth, terminalIndex } = ribbonTotals(bands, 3);
    expect(totalByMonth).toEqual([30, 25, 20]);
    expect(terminalIndex).toBeNull();
  });

  it("reports terminalIndex when the subset alone depletes", () => {
    const bands = [
      { chartRoot: "a", label: "A", values: [10, 0, 0], depletionMonthIndex: 1, hasCurrentPersonnel: true },
    ];
    const { totalByMonth, terminalIndex } = ribbonTotals(bands, 3);
    expect(totalByMonth).toEqual([10, 0, 0]);
    expect(terminalIndex).toBe(1);
  });
});

describe("collapseBands", () => {
  function band(
    chartRoot: string,
    values: number[],
    depletionMonthIndex: number | null,
    hasCurrentPersonnel = true
  ): RibbonBand {
    return { chartRoot, label: chartRoot, values, depletionMonthIndex, hasCurrentPersonnel };
  }

  // Six accounts, one month-0 balance each, varied depletion timing.
  const many = [
    band("survives-mid", [500, 400, 300], null),
    band("m1-small", [100, 0, 0], 1),
    band("m2-big", [300, 200, 0], 2),
    band("m1-big", [200, 0, 0], 1, false),
    band("survives-big", [900, 800, 700], null),
    band("m2-small", [50, 40, 0], 2),
  ];

  it("keeps the soonest-to-deplete and folds the rest into one band", () => {
    const out = collapseBands(many, 3);
    expect(out).toHaveLength(4);
    expect(out.slice(0, 3).map((b) => b.chartRoot)).toEqual(["m1-big", "m1-small", "m2-big"]);
    expect(out[3]!.chartRoot).toBe(RIBBON_OTHER_ROOT);
    expect(out[3]!.label).toBe("3 other accounts");
  });

  it("breaks ties on depletion month by larger current balance", () => {
    // Both deplete at index 1; the larger current balance ranks first, so a
    // reader meets the bigger exposure before the smaller one.
    const out = collapseBands(many, 3);
    expect(out[0]!.chartRoot).toBe("m1-big");
    expect(out[1]!.chartRoot).toBe("m1-small");
  });

  it("preserves the monthly total, so ribbonTotals is unaffected", () => {
    const before = ribbonTotals(many, 3);
    const after = ribbonTotals(collapseBands(many, 3), 3);
    expect(after.totalByMonth).toEqual(before.totalByMonth);
    expect(after.terminalIndex).toBe(before.terminalIndex);
  });

  it("leaves the bands untouched when there are few enough to render", () => {
    const few = many.slice(0, 4);
    expect(collapseBands(few, 3)).toBe(few);
  });

  it("marks the aggregate depleted only once every account inside it has", () => {
    const allDeplete = [
      band("a", [10, 0], 1),
      band("b", [20, 0], 1),
      band("c", [30, 20], 1),
      band("d", [40, 30], 0),
    ];
    expect(collapseBands(allDeplete, 1).at(-1)!.depletionMonthIndex).toBe(1);

    const oneSurvives = [...allDeplete.slice(0, 3), band("survivor", [5, 5], null)];
    expect(collapseBands(oneSurvives, 1).at(-1)!.depletionMonthIndex).toBeNull();
  });

  it("carries current-personnel scope forward if any folded account has it", () => {
    const out = collapseBands(many, 3);
    expect(out.at(-1)!.hasCurrentPersonnel).toBe(true);
  });
});

describe("label collisions", () => {
  it("falls back to the account code when two accounts share an alias", () => {
    // 5020-801025-… and 5020-801026-… differ only by department, and the alias
    // drops the department, so both resolve to "Fund 5020".
    const snap = snapshot(
      ["2026-08"],
      [emp()],
      [fs("f1", "5020-801025-1111111-42", "Fund 5020"), fs("f2", "5020-801026-1111111-42", "Fund 5020")]
    );
    const ribbon = buildRunwayRibbon({
      snapshot: snap,
      workingPlan: null,
      settings: DEFAULT_SETTINGS,
      portfolio: new Map<string, MergedPortfolioBalance>(),
      horizonMonths: 3,
      now: NOW,
    });

    const labels = ribbon.bands.map((b) => b.label);
    expect(new Set(labels).size).toBe(labels.length);
    // Each collided band names itself by its own fund-dept-project.
    for (const band of ribbon.bands) expect(band.label).toBe(band.chartRoot);
  });
});

describe("a band for an account marked not-my-account", () => {
  const ACCOUNT_KEY = "7000-1-7030720";
  const markedNotMine = (endDate: string) => ({
    accountGroupByBalanceKey: { [ACCOUNT_KEY]: NOT_MY_ACCOUNTS_GROUP_ID },
    runwayAssumedEndDates: { [ACCOUNT_KEY]: endDate },
  });
  const MONTHS = ["2026-06", "2026-07", "2026-08"];

  function ribbonWith(patch: Partial<AppSettings>) {
    return buildRunwayRibbon({
      snapshot: snapshot(MONTHS),
      workingPlan: null,
      settings: settings(patch),
      // $900k on file — far more than any estimate, so we can see which is used.
      portfolio: portfolio(900_000),
      horizonMonths: 12,
      now: NOW,
    });
  }

  it("opens at the estimate its end date implies, not the balance on file", () => {
    const ribbon = ribbonWith(markedNotMine("2026-12-31"));
    const band = ribbon.bands[0]!;
    expect(band.values[0]!).toBeGreaterThan(0);
    expect(band.values[0]!).toBeLessThan(900_000);
  });

  it("draws down and runs out, rather than sitting flat forever", () => {
    // The old behaviour opened at the real balance and skipped the burn, so
    // the band never declined — infinite runway on the chart.
    const ribbon = ribbonWith(markedNotMine("2026-12-31"));
    const band = ribbon.bands[0]!;
    expect(band.values[band.values.length - 1]!).toBeLessThan(band.values[0]!);
    expect(band.depletionMonthIndex).not.toBeNull();
  });

  it("still opens at the real balance when it is not marked", () => {
    // Month 0 already has one month of burn applied, so this is 900,000 less
    // the $10k monthly cost — the point is that it is the balance on file and
    // not the ~$60k the same account would estimate to.
    const ribbon = ribbonWith({});
    expect(ribbon.bands[0]!.values[0]!).toBeCloseTo(890_000, 0);
  });
});
