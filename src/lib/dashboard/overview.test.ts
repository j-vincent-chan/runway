import { describe, expect, it } from "vitest";
import {
  buildConstrainedRunway,
  buildDashboardOverview,
  resolvePeriodStatus,
  trailingBurn,
} from "@/lib/dashboard/overview";
import { shiftMonth } from "@/lib/dashboard/month";
import type { PersonnelCostTrendPoint } from "@/lib/dashboard/metrics";
import type { AccountBalanceViewItem } from "@/lib/net-position/accountBalancesView";
import type { RunwayContext } from "@/lib/dashboard/attention";
import type { Employee, PayrollReportSnapshot } from "@/types";

function months(start: string, count: number, total: number): PersonnelCostTrendPoint[] {
  return Array.from({ length: count }, (_, i) => {
    const month = shiftMonth(start, i);
    return { month, label: month, total, headcount: 2 };
  });
}

function account(
  key: string,
  displayBalance: number | null,
  changeFromPrior: number | null = null,
  isHidden = false
): AccountBalanceViewItem {
  return {
    accountKey: key,
    displayKey: key,
    title: key,
    fund: "7000",
    dept: "129074",
    project: key,
    source: "netPosition",
    series: null,
    isHidden,
    isWatchedFromPortfolio: false,
    displayBalance,
    changeFromPrior,
    withdrawals: 0,
  };
}

function employee(id: string, name: string): Employee {
  return { id, name, appointmentPercent: 100 };
}

function runwayContext(
  employeeMonths: [string, number | null][] = [],
  accounts: RunwayContext["accounts"] = []
): RunwayContext {
  return {
    monthsByEmployee: new Map(employeeMonths),
    limitingAccountByEmployee: new Map(),
    accounts,
  };
}

const emptyRunway = runwayContext();

function snapshot(actualMonths: string[], futureMonths: string[] = []): PayrollReportSnapshot {
  return {
    id: "s",
    sourceFileName: "payroll.xlsx",
    uploadedAt: "2026-08-01T00:00:00.000Z",
    reportName: "t",
    sheetName: "Sheet1",
    parserVersion: "1",
    parseStatus: "success",
    parseWarnings: [],
    employees: [],
    fundingSources: [],
    monthlyAllocations: [],
    monthlyCosts: [],
    rawRows: [],
    monthRange: { start: "2026-01", end: "2026-12" },
    actualMonths,
    futureMonths,
  };
}

describe("resolvePeriodStatus", () => {
  it("treats posted payroll months as closed", () => {
    expect(resolvePeriodStatus(snapshot(["2026-07", "2026-08"]), "2026-08").closed).toBe(true);
  });

  it("treats a future-distribution month as in progress", () => {
    expect(resolvePeriodStatus(snapshot(["2026-07"], ["2026-08"]), "2026-08").closed).toBe(false);
  });
});

describe("trailingBurn", () => {
  it("averages the last three months at or before the given month", () => {
    const series = [
      ...months("2026-01", 5, 100),
      ...months("2026-06", 3, 200),
    ];
    expect(trailingBurn(series, "2026-08")).toEqual({ average: 200, monthsUsed: 3 });
  });

  it("reports how many months it actually had", () => {
    expect(trailingBurn(months("2026-08", 1, 90), "2026-08")).toEqual({
      average: 90,
      monthsUsed: 1,
    });
  });
});

describe("buildConstrainedRunway", () => {
  it("takes the minimum across people, not a pooled blend", () => {
    const runway = runwayContext([
      ["e1", 10],
      ["e2", 4],
    ]);
    const result = buildConstrainedRunway(runway, [employee("e1", "A. Chen"), employee("e2", "B. Okafor")]);
    expect(result.months).toBe(4);
    expect(result.limitingLabel).toBe("B. Okafor");
  });

  it("also considers per-account runway, not just per-person blends", () => {
    const runway = runwayContext(
      [["e1", 10]],
      [{ chartRoot: "5R01-1", name: "5R01-118440", months: 2, balance: 8_000 }]
    );
    const result = buildConstrainedRunway(runway, [employee("e1", "A. Chen")]);
    expect(result.months).toBe(2);
    expect(result.limitingLabel).toBe("5R01-118440");
  });

  it("skips people with no counted funding source", () => {
    const runway = runwayContext([
      ["e1", null],
      ["e2", 6],
    ]);
    const result = buildConstrainedRunway(runway, [employee("e1", "A"), employee("e2", "B")]);
    expect(result.months).toBe(6);
  });

  it("returns null when nothing is computable", () => {
    expect(buildConstrainedRunway(emptyRunway, [])).toEqual({ months: null, limitingLabel: null });
  });
});

describe("buildDashboardOverview", () => {
  const monthly = months("2025-09", 12, 100_000);

  it("takes the constrained minimum, not availableFunds ÷ monthlyBurn", () => {
    // Pooled funds/burn here would say 10 months — the constrained figure must
    // ignore that and report the real, restricted-fund bottleneck instead.
    const overview = buildDashboardOverview({
      monthly,
      planningMonth: "2026-08",
      accountItems: [account("a", 600_000), account("b", 400_000)],
      netPositionImports: [],
      runway: runwayContext([["e1", 3]]),
      employees: [employee("e1", "M. Chen")],
    });

    expect(overview.availableFunds).toBe(1_000_000);
    expect(overview.monthlyBurn).toBe(100_000);
    expect(overview.runwayMonths).toBe(3);
    expect(overview.runwayLimitingLabel).toBe("M. Chen");
    expect(overview.runwayTargetMonth).toBe("2026-11");
  });

  it("leaves runwayTargetMonth null when already past due", () => {
    const overview = buildDashboardOverview({
      monthly,
      planningMonth: "2026-08",
      accountItems: [account("a", 600_000)],
      netPositionImports: [],
      runway: runwayContext([], [{ chartRoot: "a", name: "Fund A", months: -2, balance: -900 }]),
      employees: [],
    });
    expect(overview.runwayMonths).toBe(-2);
    expect(overview.runwayLimitingLabel).toBe("Fund A");
    expect(overview.runwayTargetMonth).toBeNull();
  });

  it("reports no runway when nothing is computable, independent of available funds", () => {
    const overview = buildDashboardOverview({
      monthly,
      planningMonth: "2026-08",
      accountItems: [account("a", 600_000), account("b", 400_000)],
      netPositionImports: [],
      runway: emptyRunway,
      employees: [],
    });
    expect(overview.availableFunds).toBe(1_000_000);
    expect(overview.runwayMonths).toBeNull();
    expect(overview.runwayLimitingLabel).toBeNull();
    expect(overview.runwayTargetMonth).toBeNull();
  });

  it("excludes hidden accounts from the total", () => {
    const overview = buildDashboardOverview({
      monthly,
      planningMonth: "2026-08",
      accountItems: [account("a", 600_000), account("b", 400_000, null, true)],
      netPositionImports: [],
      runway: emptyRunway,
      employees: [],
    });
    expect(overview.availableFunds).toBe(600_000);
    expect(overview.accountCount).toBe(1);
  });

  it("sums the prior-report delta only from accounts that have history", () => {
    const overview = buildDashboardOverview({
      monthly,
      planningMonth: "2026-08",
      accountItems: [account("a", 600_000, -50_000), account("b", 400_000)],
      netPositionImports: [],
      runway: emptyRunway,
      employees: [],
    });
    expect(overview.fundsDelta).toBe(-50_000);
  });

  it("leaves the delta null when no account has prior history", () => {
    const overview = buildDashboardOverview({
      monthly,
      planningMonth: "2026-08",
      accountItems: [account("a", 600_000)],
      netPositionImports: [],
      runway: emptyRunway,
      employees: [],
    });
    expect(overview.fundsDelta).toBeNull();
  });

  it("compares burn against the equally long window before it", () => {
    const series = [...months("2026-01", 3, 80_000), ...months("2026-04", 3, 100_000)];
    const overview = buildDashboardOverview({
      monthly: series,
      planningMonth: "2026-06",
      accountItems: [account("a", 100_000)],
      netPositionImports: [],
      runway: emptyRunway,
      employees: [],
    });
    expect(overview.burnDelta).toBe(20_000);
  });

  it("reports no burn when there is none, independent of runway", () => {
    const overview = buildDashboardOverview({
      monthly: months("2026-08", 1, 0),
      planningMonth: "2026-08",
      accountItems: [account("a", 100_000)],
      netPositionImports: [],
      runway: runwayContext([["e1", 5]]),
      employees: [employee("e1", "A")],
    });
    expect(overview.hasBurn).toBe(false);
    expect(overview.runwayMonths).toBe(5);
  });
});
