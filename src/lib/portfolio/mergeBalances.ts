import type { PortfolioReportImport } from "@/types";
import { normalizeChartstring } from "@/lib/funding/chartstring";

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
      });
    }
  }

  return map;
}
