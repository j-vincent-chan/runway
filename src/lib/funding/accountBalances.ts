import type { NetPositionReportImport } from "@/types";
import { normalizeChartstring } from "@/lib/funding/chartstring";
import { buildNetPositionAccountSeries } from "@/lib/net-position/buildAccountSeries";

/** One account's latest known balance, as reported by a Net Position Report. */
export interface AccountBalance {
  chartstring: string;
  balance: number;
  reportRunDate: string;
  sourceFileName: string;
  /** Net Position "Project Description" when present */
  projectTitle?: string;
  fund?: string;
  dept?: string;
  project?: string;
}

/**
 * Every balance Runway can spend against, keyed by fund-dept-project.
 *
 * Net Position Reports are the only balance source: they can be run against a
 * chosen set of accounts, so what arrives is the payroll accounts and nothing
 * else. Payroll chartstrings may carry an activity segment that these keys do
 * not — `findBalanceForChartstring` matches on the fund-dept-project root, so
 * they still resolve.
 */
export function buildAccountBalances(
  netPositionImports: NetPositionReportImport[]
): Map<string, AccountBalance> {
  const map = new Map<string, AccountBalance>();

  for (const series of buildNetPositionAccountSeries(netPositionImports)) {
    const key = normalizeChartstring(series.accountKey);
    map.set(key, {
      chartstring: series.accountKey,
      balance: series.latest.endingBalance,
      reportRunDate: series.latest.reportRunDate,
      sourceFileName: series.latest.sourceFileName,
      projectTitle: series.projectDescription?.trim() || undefined,
      fund: series.fund,
      dept: series.dept,
      project: series.project,
    });
  }

  return map;
}
