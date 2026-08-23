import { describe, expect, it } from "vitest";
import {
  buildDashboardOverview,
  resolvePeriodStatus,
  trailingBurn,
} from "@/lib/dashboard/overview";
import { shiftMonth } from "@/lib/dashboard/month";
import type { PersonnelCostTrendPoint } from "@/lib/dashboard/metrics";
import type { AccountBalanceViewItem } from "@/lib/net-position/accountBalancesView";
import type { PayrollReportSnapshot } from "@/types";

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

describe("buildDashboardOverview", () => {
  const monthly = months("2025-09", 12, 100_000);

  it("derives runway from available funds and trailing burn", () => {
    const overview = buildDashboardOverview({
      monthly,
      planningMonth: "2026-08",
      accountItems: [account("a", 600_000), account("b", 400_000)],
      netPositionImports: [],
    });

    expect(overview.availableFunds).toBe(1_000_000);
    expect(overview.accountCount).toBe(2);
    expect(overview.monthlyBurn).toBe(100_000);
    expect(overview.runwayMonths).toBe(10);
    expect(overview.runwayTargetMonth).toBe("2027-06");
  });

  it("excludes hidden accounts from the total", () => {
    const overview = buildDashboardOverview({
      monthly,
      planningMonth: "2026-08",
      accountItems: [account("a", 600_000), account("b", 400_000, null, true)],
      netPositionImports: [],
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
    });
    expect(overview.fundsDelta).toBe(-50_000);
  });

  it("leaves the delta null when no account has prior history", () => {
    const overview = buildDashboardOverview({
      monthly,
      planningMonth: "2026-08",
      accountItems: [account("a", 600_000)],
      netPositionImports: [],
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
    });
    expect(overview.burnDelta).toBe(20_000);
  });

  it("reports no runway when there are no balances to project against", () => {
    const overview = buildDashboardOverview({
      monthly,
      planningMonth: "2026-08",
      accountItems: [],
      netPositionImports: [],
    });
    expect(overview.hasFunds).toBe(false);
    expect(overview.runwayMonths).toBeNull();
    expect(overview.runwayTargetMonth).toBeNull();
  });

  it("reports no runway when there is no burn rate", () => {
    const overview = buildDashboardOverview({
      monthly: months("2026-08", 1, 0),
      planningMonth: "2026-08",
      accountItems: [account("a", 100_000)],
      netPositionImports: [],
    });
    expect(overview.hasBurn).toBe(false);
    expect(overview.runwayMonths).toBeNull();
  });
});
