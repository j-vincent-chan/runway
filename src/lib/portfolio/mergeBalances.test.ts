import { describe, expect, it } from "vitest";
import { mergeAccountBalances } from "@/lib/portfolio/mergeBalances";
import { findBalanceForChartstring } from "@/lib/funding/chartstring";
import type { NetPositionReportImport, PortfolioReportImport } from "@/types";

function portfolio(chartstring: string, balance: number): PortfolioReportImport {
  return {
    id: "pf1",
    sourceFileName: "portfolio.xlsx",
    reportRunDate: "2026-08-01",
    uploadedAt: "2026-08-01T00:00:00.000Z",
    rows: [{ chartstring, balance, fund: "7000", dept: "142062", project: "7032261", activity: "42" }],
  } as PortfolioReportImport;
}

function netPosition(
  accountKey: string,
  endingBalance: number,
  periodEnd: string,
  reportRunDate: string,
  id = accountKey + periodEnd
): NetPositionReportImport {
  const [fund, dept, project] = accountKey.split("-");
  return {
    id,
    sourceFileName: `np-${periodEnd}.xlsx`,
    reportRunDate,
    periodEnd,
    uploadedAt: "2026-08-01T00:00:00.000Z",
    rows: [
      {
        accountKey,
        busUnit: "SFCMP",
        fund: fund!,
        dept: dept!,
        project: project!,
        beginningBalance: 0,
        revenues: 0,
        expenses: 0,
        otherChanges: 0,
        netChange: 0,
        endingBalance,
      },
    ],
  } as NetPositionReportImport;
}

describe("mergeAccountBalances", () => {
  it("takes the latest period, not the latest report run date", () => {
    // The oldest period was re-run most recently — sorting on run date alone
    // would resolve this account to its November balance.
    const map = mergeAccountBalances(
      [],
      [
        netPosition("7000-142062-7032261", 87836.51, "2025-11", "2026-08-23"),
        netPosition("7000-142062-7032261", -6808.66, "2026-08", "2026-08-21"),
      ]
    );
    expect(map.get("7000-142062-7032261")?.balance).toBeCloseTo(-6808.66, 2);
  });

  it("lets MyPortfolio win a root-level tie against Net Position", () => {
    // Payroll charges activity 45; MyPortfolio covers activity 42. Both the
    // MyPortfolio row and the Net Position root match the payroll chartstring
    // at the same score, so insertion order decides — and it must be
    // MyPortfolio, or a change that only adds balances can lower the total.
    const map = mergeAccountBalances(
      [portfolio("7000-142062-7032261-42", 50000)],
      [netPosition("7000-142062-7032261", -6808.66, "2026-08", "2026-08-21")]
    );
    const balances = new Map([...map].map(([k, v]) => [k, v.balance]));
    const hit = findBalanceForChartstring("7000-142062-7032261-45", balances);
    expect(hit?.balance).toBe(50000);
  });

  it("adds a Net Position balance only where MyPortfolio has none", () => {
    const map = mergeAccountBalances(
      [portfolio("7000-142062-7032261-42", 50000)],
      [
        netPosition("7000-142062-7032261", -6808.66, "2026-08", "2026-08-21"),
        netPosition("7700-129074-7702322", 41943.5, "2026-08", "2026-08-21"),
      ]
    );
    expect(map.get("7700-129074-7702322")?.balance).toBeCloseTo(41943.5, 2);
    expect(map.get("7700-129074-7702322")?.source).toBe("netPosition");
    expect(map.get("7000-142062-7032261-42")?.source).toBe("myPortfolio");
  });
});
