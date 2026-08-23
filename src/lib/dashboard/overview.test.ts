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
import {
  DEFAULT_SETTINGS,
  type AppSettings,
  type Employee,
  type NetPositionReportImport,
  type PayrollReportSnapshot,
} from "@/types";

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

function netPositionImport(
  id: string,
  periodEnd: string,
  accountKey: string,
  endingBalance: number
): NetPositionReportImport {
  return {
    id,
    sourceFileName: "net-position.xlsx",
    uploadedAt: "2026-08-01T00:00:00.000Z",
    reportRunDate: periodEnd,
    periodEnd,
    sheetName: "Sheet1",
    rows: [
      {
        accountKey,
        busUnit: "UCSF",
        fund: "7000",
        dept: "129074",
        project: accountKey,
        beginningBalance: 0,
        revenues: 0,
        expenses: 0,
        otherChanges: 0,
        netChange: 0,
        endingBalance,
      },
    ],
  };
}

function employee(id: string, name: string): Employee {
  return { id, name, appointmentPercent: 100 };
}

function runwayContext(
  employeeMonths: [string, number | null][] = [],
  accounts: RunwayContext["accounts"] = [],
  limitingAccountByEmployee: [string, { name: string; chartRoot: string }][] = [],
  accountContributors: [string, string[]][] = []
): RunwayContext {
  return {
    monthsByEmployee: new Map(employeeMonths),
    limitingAccountByEmployee: new Map(limitingAccountByEmployee),
    accounts,
    accountContributors: new Map(accountContributors.map(([root, ids]) => [root, new Set(ids)])),
  };
}

const emptyRunway = runwayContext();
const settings: AppSettings = DEFAULT_SETTINGS;

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
    const result = buildConstrainedRunway(
      runway,
      [employee("e1", "A. Chen"), employee("e2", "B. Okafor")],
      settings
    );
    expect(result.months).toBe(4);
    expect(result.limitingLabel).toBe("B. Okafor");
  });

  it("also considers per-account runway, not just per-person blends", () => {
    const runway = runwayContext(
      [["e1", 10]],
      [{ chartRoot: "5R01-1", name: "5R01-118440", months: 2, balance: 8_000 }]
    );
    const result = buildConstrainedRunway(runway, [employee("e1", "A. Chen")], settings);
    expect(result.months).toBe(2);
    expect(result.limitingLabel).toBe("5R01-118440");
  });

  it("skips people with no counted funding source", () => {
    const runway = runwayContext([
      ["e1", null],
      ["e2", 6],
    ]);
    const result = buildConstrainedRunway(runway, [employee("e1", "A"), employee("e2", "B")], settings);
    expect(result.months).toBe(6);
  });

  it("surfaces the deficit amount from a person's limiting account, not a re-derivation", () => {
    const runway = runwayContext(
      [["e1", -2]],
      [{ chartRoot: "fund-a", name: "Fund A", months: -2, balance: -4_200 }],
      [["e1", { name: "Fund A", chartRoot: "fund-a" }]]
    );
    const result = buildConstrainedRunway(runway, [employee("e1", "M. Chen")], settings);
    expect(result.deficitAmount).toBe(4_200);
  });

  it("names the account, not the person, when it's solely theirs and overdrawn", () => {
    const runway = runwayContext(
      [["e1", -2]],
      [{ chartRoot: "fund-a", name: "Fund A", months: -2, balance: -4_200 }],
      [["e1", { name: "Fund A", chartRoot: "fund-a" }]],
      [["fund-a", ["e1"]]]
    );
    const result = buildConstrainedRunway(runway, [employee("e1", "M. Chen")], settings);
    // Same fact the attention queue's spotlight names: the account, not M. Chen.
    expect(result.limitingLabel).toBe("Fund A");
    expect(result.deficitAmount).toBe(4_200);
    // The person stays tracked for a photo even though the label names the account.
    expect(result.limitingPersonName).toBe("M. Chen");
  });

  it("still names the person when the account is shared", () => {
    const runway = runwayContext(
      [["e1", -2]],
      [{ chartRoot: "fund-a", name: "Fund A", months: -2, balance: -4_200 }],
      [["e1", { name: "Fund A", chartRoot: "fund-a" }]],
      [["fund-a", ["e1", "e2"]]]
    );
    const result = buildConstrainedRunway(runway, [employee("e1", "M. Chen")], settings);
    expect(result.limitingLabel).toBe("M. Chen");
  });

  it("leaves the deficit null when the limiting account isn't actually negative", () => {
    const runway = runwayContext(
      [["e1", -2]],
      [{ chartRoot: "fund-a", name: "Fund A", months: -2, balance: 1_000 }],
      [["e1", { name: "Fund A", chartRoot: "fund-a" }]]
    );
    const result = buildConstrainedRunway(runway, [employee("e1", "M. Chen")], settings);
    expect(result.deficitAmount).toBeNull();
  });

  it("resolves the limiting person's photo from their profile", () => {
    const runway = runwayContext([["e1", 2]]);
    const withPhoto: AppSettings = {
      ...DEFAULT_SETTINGS,
      employeeProfiles: { e1: { photoUrl: "sb://employee-photos/e1.jpg" } },
    };
    const result = buildConstrainedRunway(runway, [employee("e1", "M. Chen")], withPhoto);
    expect(result.limitingPersonName).toBe("M. Chen");
    expect(result.limitingPhotoUrl).toBe("sb://employee-photos/e1.jpg");
  });

  it("leaves the photo null when the account has no single known contributor", () => {
    const runway = runwayContext(
      [],
      [{ chartRoot: "fund-a", name: "Fund A", months: 2, balance: 1_000 }]
    );
    const result = buildConstrainedRunway(runway, [], settings);
    expect(result.limitingPersonName).toBeNull();
    expect(result.limitingPhotoUrl).toBeNull();
  });

  it("returns null when nothing is computable", () => {
    expect(buildConstrainedRunway(emptyRunway, [], settings)).toEqual({
      months: null,
      limitingLabel: null,
      deficitAmount: null,
      limitingPersonName: null,
      limitingPhotoUrl: null,
      limitingChartRoot: null,
    });
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
      settings,
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
      settings,
    });
    expect(overview.runwayMonths).toBe(-2);
    expect(overview.runwayLimitingLabel).toBe("Fund A");
    expect(overview.runwayDeficitAmount).toBe(900);
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
      settings,
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
      settings,
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
      settings,
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
      settings,
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
      settings,
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
      settings,
    });
    expect(overview.hasBurn).toBe(false);
    expect(overview.runwayMonths).toBe(5);
  });

  it("surfaces the limiting person's photo through to the overview", () => {
    const withPhoto: AppSettings = {
      ...DEFAULT_SETTINGS,
      employeeProfiles: { e1: { photoUrl: "sb://employee-photos/e1.jpg" } },
    };
    const overview = buildDashboardOverview({
      monthly,
      planningMonth: "2026-08",
      accountItems: [],
      netPositionImports: [],
      runway: runwayContext([["e1", 2]]),
      employees: [employee("e1", "M. Chen")],
      settings: withPhoto,
    });
    expect(overview.runwayLimitingPersonName).toBe("M. Chen");
    expect(overview.runwayLimitingPhotoUrl).toBe("sb://employee-photos/e1.jpg");
  });

  it("builds the limiting account's balance history for the sparkline", () => {
    const overview = buildDashboardOverview({
      monthly,
      planningMonth: "2026-08",
      accountItems: [],
      netPositionImports: [
        netPositionImport("np1", "2026-06", "7000-129074-fund-a", 5_000),
        netPositionImport("np2", "2026-07", "7000-129074-fund-a", -900),
      ],
      runway: runwayContext(
        [],
        [{ chartRoot: "7000-129074-fund-a", name: "Fund A", months: -2, balance: -900 }]
      ),
      employees: [],
      settings,
    });
    expect(overview.runwaySeries.map((p) => p.value)).toEqual([5_000, -900]);
  });

  it("leaves the sparkline empty when the limiting account has no Net Position history", () => {
    const overview = buildDashboardOverview({
      monthly,
      planningMonth: "2026-08",
      accountItems: [],
      netPositionImports: [],
      runway: runwayContext([["e1", 2]]),
      employees: [employee("e1", "M. Chen")],
      settings,
    });
    expect(overview.runwaySeries).toEqual([]);
  });
});
