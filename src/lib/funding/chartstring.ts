/** Normalize chartstring for lookup keys. */
export function normalizeChartstring(chart: string): string {
  return chart.trim().toLowerCase().replace(/\s+/g, "");
}

/** First three segments: fund-dept-project (UCSF chartstring root). */
export function chartstringFundDeptProject(chart: string): string | null {
  const parts = normalizeChartstring(chart).split("-").filter(Boolean);
  if (parts.length < 3) return null;
  return `${parts[0]}-${parts[1]}-${parts[2]}`;
}

/** Build fund-dept-project-activity chartstring from MyPortfolio columns. */
export function buildPortfolioChartstring(
  fund: string,
  dept: string,
  project: string,
  activity: string
): string {
  const parts = [fund, dept, project, activity]
    .map((p) => String(p ?? "").trim())
    .filter((p) => p.length > 0);
  return parts.join("-");
}

/**
 * Match payroll chartstrings to MyPortfolio rows.
 * Payroll effort accounts (e.g. …-136092L-44) often differ in the activity segment
 * from portfolio rows (e.g. …-136092L-01) while sharing the same fund-dept-project.
 */
export function chartstringsMatch(payrollChart: string, portfolioChart: string): boolean {
  const p = normalizeChartstring(payrollChart);
  const c = normalizeChartstring(portfolioChart);
  if (p === c) return true;
  if (p.startsWith(`${c}-`) || c.startsWith(`${p}-`)) return true;

  const pRoot = chartstringFundDeptProject(payrollChart);
  const cRoot = chartstringFundDeptProject(portfolioChart);
  return !!pRoot && pRoot === cRoot;
}

export function findBalanceForChartstring(
  payrollChart: string,
  balances: Map<string, number>
): { balance: number; matchedKey: string } | undefined {
  const direct = balances.get(normalizeChartstring(payrollChart));
  if (direct !== undefined) {
    return { balance: direct, matchedKey: payrollChart };
  }

  const payrollNorm = normalizeChartstring(payrollChart);
  const payrollRoot = chartstringFundDeptProject(payrollChart);

  let best: { balance: number; matchedKey: string; score: number } | undefined;

  for (const [key, balance] of balances) {
    if (!chartstringsMatch(payrollChart, key)) continue;

    const keyNorm = normalizeChartstring(key);
    let score = 50;
    if (keyNorm === payrollNorm) score = 100;
    else if (payrollRoot && chartstringFundDeptProject(key) === payrollRoot) score = 80;

    if (!best || score > best.score) {
      best = { balance, matchedKey: key, score };
    }
  }

  if (!best) return undefined;
  return { balance: best.balance, matchedKey: best.matchedKey };
}

/** Find the best-matching MyPortfolio row for a payroll chartstring. */
export function findPortfolioRowForChartstring<T extends { chartstring: string }>(
  payrollChart: string,
  portfolio: Map<string, T>
): { row: T; matchedKey: string; score: number } | undefined {
  const payrollNorm = normalizeChartstring(payrollChart);
  const payrollRoot = chartstringFundDeptProject(payrollChart);

  let best: { row: T; matchedKey: string; score: number } | undefined;

  for (const [key, row] of portfolio) {
    if (!chartstringsMatch(payrollChart, key) && !chartstringsMatch(payrollChart, row.chartstring)) {
      continue;
    }

    const keyNorm = normalizeChartstring(key);
    let score = 50;
    if (keyNorm === payrollNorm || normalizeChartstring(row.chartstring) === payrollNorm) {
      score = 100;
    } else if (
      payrollRoot &&
      (chartstringFundDeptProject(key) === payrollRoot ||
        chartstringFundDeptProject(row.chartstring) === payrollRoot)
    ) {
      score = 80;
    }

    if (!best || score > best.score) {
      best = { row, matchedKey: key, score };
    }
  }

  return best;
}

export function findPortfolioTitleForChartstring(
  payrollChart: string | undefined,
  portfolio: Map<string, { chartstring: string; projectTitle?: string }>
): string | undefined {
  if (!payrollChart?.trim()) return undefined;
  const match = findPortfolioRowForChartstring(payrollChart, portfolio);
  const title = match?.row.projectTitle?.trim();
  return title || undefined;
}
