import { describe, expect, it } from "vitest";
import { buildRunwayRibbon } from "@/lib/dashboard/runwayRibbon";
import { DEFAULT_SETTINGS } from "@/types";
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
