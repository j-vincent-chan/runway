import { describe, expect, it } from "vitest";
import {
  buildSharedAccountBurnIndex,
  computeEmployeeRunway,
} from "@/lib/runway/calculate";
import { monthsUntilAssumedEnd } from "@/lib/runway/assumedEndDate";
import { hiddenFundKey } from "@/lib/funding/visibility";
import { DEFAULT_SETTINGS } from "@/types";
import type {
  AppSettings,
  Employee,
  FundingSource,
  MonthlyAllocation,
  MonthlyCostRecord,
  PayrollReportSnapshot,
} from "@/types";
import type { MergedPortfolioBalance } from "@/lib/portfolio/mergeBalances";

const MONTH = "2026-06";
const ACCOUNT = "7000-1-7030720-45";
/** $10k/mo total comp, all charged to the one account. */
const MONTHLY_COST = 10_000;

function emp(): Employee {
  return { id: "e1", name: "Ada Lovelace", appointmentPercent: 100, employeeId: "1001" };
}
function fs(): FundingSource {
  return { id: "f1", rawName: ACCOUNT, alias: "Grant A", accountString: ACCOUNT, fund: "7000", color: "#ccc" };
}
function alloc(): MonthlyAllocation {
  return {
    id: "a1", employeeId: "e1", fundingSourceId: "f1", month: MONTH,
    percentEffort: 100, sourceType: "actual", status: "imported",
  };
}
function costs(): MonthlyCostRecord[] {
  return [
    { id: "s1", employeeId: "e1", fundingSourceId: "f1", month: MONTH, rowType: "baseSalary", amount: MONTHLY_COST * 0.75, sourceType: "actual" },
    { id: "b1", employeeId: "e1", month: MONTH, rowType: "benefits", amount: MONTHLY_COST * 0.25, sourceType: "actual" },
    { id: "t1", employeeId: "e1", month: MONTH, rowType: "totalCompBenefits", amount: MONTHLY_COST, sourceType: "actual" },
  ];
}
function snapshot(): PayrollReportSnapshot {
  return {
    id: "snap", sourceFileName: "t.xlsx", uploadedAt: "2026-07-01T00:00:00.000Z",
    reportName: "t", sheetName: "S", parserVersion: "1", parseStatus: "success",
    parseWarnings: [], employees: [emp()], fundingSources: [fs()],
    monthlyAllocations: [alloc()], monthlyCosts: costs(), rawRows: [],
    monthRange: { start: MONTH, end: MONTH }, actualMonths: [MONTH], futureMonths: [],
  };
}
/** A real balance far larger than any estimate, so we can tell which one is used. */
function portfolio(balance = 900_000): Map<string, MergedPortfolioBalance> {
  return new Map([
    ["7000-1-7030720-45", { chartstring: ACCOUNT, balance, reportRunDate: "2026-06-30", sourceFileName: "p.xlsx", source: "myPortfolio" }],
  ]);
}

/** Today is two months past the payroll month, which is the normal case. */
const TODAY = "2026-08";

function runFor(settings: AppSettings, estimateOriginMonth = TODAY) {
  const snap = snapshot();
  const index = buildSharedAccountBurnIndex(snap, null, snap.fundingSources, settings);
  return computeEmployeeRunway(
    emp(), snap, null, snap.fundingSources, settings, portfolio(), index,
    { revealHidden: false, estimateOriginMonth }
  );
}

describe("an account marked not-my-account", () => {
  const key = hiddenFundKey("e1", "f1");

  it("counts at the estimate its end date implies, not its real balance", () => {
    const endDate = "2026-12-31";
    const summary = runFor({
      ...DEFAULT_SETTINGS,
      runwayAssumedOkFunds: [key],
      runwayAssumedEndDates: { [key]: endDate },
    });

    const months = monthsUntilAssumedEnd(TODAY, endDate)!;
    // burn x months remaining — deliberately not the $900,000 on file, which
    // is restricted or rolled into a parent account we cannot see.
    expect(summary.totalBalance).toBeCloseTo(MONTHLY_COST * months, 0);
    expect(summary.totalBalance).toBeLessThan(900_000);
    expect(summary.blendedMonthsRunway).toBeCloseTo(months, 5);
    expect(summary.accounts[0]!.balanceSource).toBe("estimated");
  });

  it("is no longer dropped from the totals entirely", () => {
    // Previously the only account being assumed-OK left this person with no
    // runway at all, so marking an account erased their funding rather than
    // valuing it differently.
    const summary = runFor({
      ...DEFAULT_SETTINGS,
      runwayAssumedOkFunds: [key],
      runwayAssumedEndDates: { [key]: "2026-12-31" },
    });
    expect(summary.totalMonthlyBurn).toBeGreaterThan(0);
    expect(summary.blendedMonthsRunway).not.toBeNull();
  });

  it("measures the estimate from today, not the payroll month", () => {
    // The payroll month can be well behind today. Measuring from it would
    // count money already spent as still available — here two extra months
    // of burn, on an account whose whole point is that it is not ours.
    const patch = {
      ...DEFAULT_SETTINGS,
      runwayAssumedOkFunds: [key],
      runwayAssumedEndDates: { [key]: "2026-12-31" },
    };
    const fromToday = runFor(patch, TODAY);
    const fromPayrollMonth = runFor(patch, MONTH);

    expect(fromToday.totalBalance).toBeLessThan(fromPayrollMonth.totalBalance);

    // The gap is exactly the burn over the months between the two origins.
    // Not a round two months: monthsUntilAssumedEnd works in days / 30.4375,
    // so Jun 30 -> Aug 31 is 2.04 months, and asserting "2" would be wrong.
    const extraMonths =
      monthsUntilAssumedEnd(MONTH, "2026-12-31")! - monthsUntilAssumedEnd(TODAY, "2026-12-31")!;
    const gap = fromPayrollMonth.totalBalance - fromToday.totalBalance;
    expect(gap).toBeCloseTo(MONTHLY_COST * extraMonths, 0);
  });

  it("uses the real balance when it is not marked", () => {
    const summary = runFor(DEFAULT_SETTINGS);
    expect(summary.totalBalance).toBeCloseTo(900_000, 0);
    expect(summary.accounts[0]!.balanceSource).toBe("portfolio");
  });

  it("still excludes a hidden account, which is a different idea", () => {
    const summary = runFor({ ...DEFAULT_SETTINGS, hiddenEmployeeFunds: [key] });
    expect(summary.totalBalance).toBe(0);
    expect(summary.blendedMonthsRunway).toBeNull();
  });
});
