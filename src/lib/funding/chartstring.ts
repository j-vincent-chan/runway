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

/**
 * Match payroll chartstrings to balance rows.
 * Payroll effort accounts (e.g. …-136092L-44) carry an activity segment that
 * account keys (e.g. …-136092L) do not, while sharing the fund-dept-project.
 */
export function chartstringsMatch(payrollChart: string, balanceChart: string): boolean {
  const p = normalizeChartstring(payrollChart);
  const c = normalizeChartstring(balanceChart);
  if (p === c) return true;
  if (p.startsWith(`${c}-`) || c.startsWith(`${p}-`)) return true;

  const pRoot = chartstringFundDeptProject(payrollChart);
  const cRoot = chartstringFundDeptProject(balanceChart);
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

/** Find the best-matching balance row for a payroll chartstring. */
export function findBalanceRowForChartstring<T extends { chartstring: string }>(
  payrollChart: string,
  balances: Map<string, T>
): { row: T; matchedKey: string; score: number } | undefined {
  const payrollNorm = normalizeChartstring(payrollChart);
  const payrollRoot = chartstringFundDeptProject(payrollChart);

  let best: { row: T; matchedKey: string; score: number } | undefined;

  for (const [key, row] of balances) {
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

export function findAccountTitleForChartstring(
  payrollChart: string | undefined,
  balances: Map<string, { chartstring: string; projectTitle?: string }>
): string | undefined {
  if (!payrollChart?.trim()) return undefined;
  const match = findBalanceRowForChartstring(payrollChart, balances);
  const title = match?.row.projectTitle?.trim();
  return title || undefined;
}

/** The four chartfield segments a UCSF chartstring carries, in source casing. */
export interface ChartstringSegments {
  fund: string;
  dept: string;
  project: string;
  activity: string;
}

const EMPTY_SEGMENTS: ChartstringSegments = { fund: "", dept: "", project: "", activity: "" };

/**
 * Split a chartstring into Fund / Dept ID / Project Number / Activity Code.
 *
 * Casing is preserved (`144880A`, not the lowercase lookup form) because these
 * values are typed back into other UCSF systems. Fewer than three segments is
 * not a chartstring — a label-only source such as "Percent effort other" —
 * and yields four blanks rather than a fund of "Percent effort other". Account
 * Balances keys stop at fund-dept-project, so activity is blank for them.
 */
export function splitChartstring(chart: string): ChartstringSegments {
  const parts = chart
    .trim()
    .split("-")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length < 3) return EMPTY_SEGMENTS;
  return {
    fund: parts[0]!,
    dept: parts[1]!,
    project: parts[2]!,
    activity: parts[3] ?? "",
  };
}
