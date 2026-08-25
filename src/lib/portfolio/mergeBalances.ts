import type { NetPositionReportImport, PortfolioReportImport } from "@/types";
import { normalizeChartstring } from "@/lib/funding/chartstring";
import { buildNetPositionAccountSeries } from "@/lib/net-position/buildAccountSeries";

export interface MergedPortfolioBalance {
  chartstring: string;
  balance: number;
  reportRunDate: string;
  sourceFileName: string;
  /** MyPortfolio "Project Nickname/Title" when present */
  projectTitle?: string;
  fund?: string;
  dept?: string;
  project?: string;
  activity?: string;
  /** Which report the figure came from. Net Position is keyed by fund-dept-project. */
  source?: "myPortfolio" | "netPosition";
}

/**
 * Union all portfolio rows across imports.
 * Same chartstring: keep the row from the latest Report Run Date; if tied, latest upload wins.
 */
export function mergePortfolioBalances(
  imports: PortfolioReportImport[]
): Map<string, MergedPortfolioBalance> {
  const map = new Map<string, MergedPortfolioBalance>();

  const sorted = [...imports].sort((a, b) => {
    const byRunDate = a.reportRunDate.localeCompare(b.reportRunDate);
    if (byRunDate !== 0) return byRunDate;
    return a.uploadedAt.localeCompare(b.uploadedAt);
  });

  for (const imp of sorted) {
    for (const row of imp.rows) {
      const key = normalizeChartstring(row.chartstring);
      const title = row.projectTitle?.trim();
      map.set(key, {
        chartstring: row.chartstring,
        balance: row.balance,
        reportRunDate: imp.reportRunDate,
        sourceFileName: imp.sourceFileName,
        projectTitle: title || undefined,
        fund: row.fund,
        dept: row.dept,
        project: row.project,
        activity: row.activity,
        source: "myPortfolio",
      });
    }
  }

  return map;
}

/**
 * Every balance Runway can spend against, from both report types.
 *
 * Net Position used to stop at Account Balances: `mergePortfolioBalances` only
 * ever saw MyPortfolio imports, and Runway reads this map exclusively, so an
 * account whose only balance came from a Net Position report was resolved as
 * $0 — reported as depleted while its report said otherwise.
 *
 * MyPortfolio wins where both cover an account, which is the precedence
 * `displayBalanceFor` already applies on Account Balances. Net Position keys
 * are fund-dept-project; `findBalanceForChartstring` matches on that root, so
 * a payroll chartstring carrying an activity segment still resolves.
 */
export function mergeAccountBalances(
  portfolioImports: PortfolioReportImport[],
  netPositionImports: NetPositionReportImport[]
): Map<string, MergedPortfolioBalance> {
  /**
   * MyPortfolio goes in first, and Net Position only fills keys it has not
   * already claimed. Insertion order is load-bearing, not cosmetic:
   * `findBalanceForChartstring` keeps the *first* entry at the best score, and
   * a MyPortfolio chartstring with a different activity segment scores the
   * same 80 as a Net Position fund-dept-project root. Seeding Net Position
   * first therefore let it win those ties and silently replace MyPortfolio
   * figures — which showed up as Available Payroll falling after a change that
   * should only ever add money.
   */
  const map = new Map<string, MergedPortfolioBalance>(mergePortfolioBalances(portfolioImports));

  for (const series of buildNetPositionAccountSeries(netPositionImports)) {
    const key = normalizeChartstring(series.accountKey);
    if (map.has(key)) continue;
    map.set(key, {
      chartstring: series.accountKey,
      balance: series.latest.endingBalance,
      reportRunDate: series.latest.reportRunDate,
      sourceFileName: series.latest.sourceFileName,
      projectTitle: series.projectDescription?.trim() || undefined,
      fund: series.fund,
      dept: series.dept,
      project: series.project,
      source: "netPosition",
    });
  }

  return map;
}
