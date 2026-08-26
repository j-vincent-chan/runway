import { describe, expect, it } from "vitest";
import { buildAccountBalances } from "@/lib/funding/accountBalances";
import { findBalanceForChartstring } from "@/lib/funding/chartstring";
import type { NetPositionReportImport } from "@/types";

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

describe("buildAccountBalances", () => {
  it("takes the latest period, not the latest report run date", () => {
    // The oldest period was re-run most recently — sorting on run date alone
    // would resolve this account to its November balance.
    const map = buildAccountBalances([
      netPosition("7000-142062-7032261", 87836.51, "2025-11", "2026-08-23"),
      netPosition("7000-142062-7032261", -6808.66, "2026-08", "2026-08-21"),
    ]);
    expect(map.get("7000-142062-7032261")?.balance).toBeCloseTo(-6808.66, 2);
  });

  it("resolves a payroll chartstring that carries an activity segment", () => {
    // Net Position keys stop at fund-dept-project; payroll charges activity 45.
    const map = buildAccountBalances([
      netPosition("7000-142062-7032261", 41943.5, "2026-08", "2026-08-21"),
    ]);
    const balances = new Map([...map].map(([k, v]) => [k, v.balance]));
    expect(findBalanceForChartstring("7000-142062-7032261-45", balances)?.balance).toBeCloseTo(
      41943.5,
      2
    );
  });

  it("carries the reporting file and run date for provenance", () => {
    const map = buildAccountBalances([
      netPosition("7700-129074-7702322", 12000, "2026-08", "2026-08-21"),
    ]);
    const entry = map.get("7700-129074-7702322");
    expect(entry?.sourceFileName).toBe("np-2026-08.xlsx");
    expect(entry?.reportRunDate).toBe("2026-08-21");
  });
});
