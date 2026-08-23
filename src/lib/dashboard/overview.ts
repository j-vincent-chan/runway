import { buildNetPositionAccountSeries } from "@/lib/net-position/buildAccountSeries";
import { monthLabelShort, periodKeyToMonth, shiftMonth } from "@/lib/dashboard/month";
import type { PersonnelCostTrendPoint } from "@/lib/dashboard/metrics";
import type { AccountBalanceViewItem } from "@/lib/net-position/accountBalancesView";
import type { NetPositionReportImport, PayrollReportSnapshot } from "@/types";

/** Months averaged for the headline burn rate. */
export const BURN_WINDOW_MONTHS = 3;

/** Sparkline lengths. */
const BURN_SERIES_MONTHS = 12;
const FUNDS_SERIES_PERIODS = 12;

export interface SparkPoint {
  key: string;
  label: string;
  value: number;
}

export interface PeriodStatus {
  /** Payroll month the dashboard is scoped to (`yyyy-MM`). */
  month: string;
  /** True when the month is posted payroll rather than a future distribution. */
  closed: boolean;
}

export interface DashboardOverview {
  /** Total across visible account balances. */
  availableFunds: number;
  accountCount: number;
  /** Change since the prior Net Position period, when history exists. */
  fundsDelta: number | null;
  fundsPriorLabel: string | null;
  fundsSeries: SparkPoint[];
  hasFunds: boolean;

  /** Trailing-average monthly personnel cost. */
  monthlyBurn: number;
  burnMonthsUsed: number;
  /** Change vs the equally long window before it. */
  burnDelta: number | null;
  burnSeries: SparkPoint[];
  hasBurn: boolean;

  /** availableFunds ÷ monthlyBurn. */
  runwayMonths: number | null;
  /** Same calculation run against the prior report's balances. */
  runwayPriorMonths: number | null;
  /** Month the money runs out at the current rate. */
  runwayTargetMonth: string | null;
  runwaySeries: SparkPoint[];
}

export function resolvePeriodStatus(
  snapshot: PayrollReportSnapshot,
  planningMonth: string
): PeriodStatus {
  return {
    month: planningMonth,
    closed: snapshot.actualMonths.includes(planningMonth),
  };
}

/** Average monthly cost over the `count` months ending at `endMonth`. */
export function trailingBurn(
  monthly: PersonnelCostTrendPoint[],
  endMonth: string,
  count = BURN_WINDOW_MONTHS
): { average: number; monthsUsed: number } {
  const window = monthly.filter((m) => m.month <= endMonth).slice(-count);
  if (window.length === 0) return { average: 0, monthsUsed: 0 };
  const total = window.reduce((sum, m) => sum + m.total, 0);
  return { average: total / window.length, monthsUsed: window.length };
}

/**
 * Total balance per Net Position period across all accounts. Accounts that did
 * not report in a period carry their last known balance forward, so the series
 * reads as "what was on hand then" rather than "who filed that month".
 */
function fundsByPeriod(imports: NetPositionReportImport[]): SparkPoint[] {
  const series = buildNetPositionAccountSeries(imports);
  if (series.length === 0) return [];

  const periodKeys = [
    ...new Set(series.flatMap((s) => s.points.map((p) => p.periodKey))),
  ].sort();

  const lastSeen = new Map<string, number>();
  const points: SparkPoint[] = [];

  for (const periodKey of periodKeys) {
    for (const account of series) {
      const point = account.points.find((p) => p.periodKey === periodKey);
      if (point) lastSeen.set(account.accountKey, point.endingBalance);
    }
    const total = [...lastSeen.values()].reduce((sum, v) => sum + v, 0);
    points.push({
      key: periodKey,
      label: monthLabelShort(periodKeyToMonth(periodKey)),
      value: total,
    });
  }

  return points.slice(-FUNDS_SERIES_PERIODS);
}

export function buildDashboardOverview({
  monthly,
  planningMonth,
  accountItems,
  netPositionImports,
}: {
  monthly: PersonnelCostTrendPoint[];
  planningMonth: string;
  accountItems: AccountBalanceViewItem[];
  netPositionImports: NetPositionReportImport[];
}): DashboardOverview {
  const visible = accountItems.filter((item) => !item.isHidden);
  const availableFunds = visible.reduce((sum, item) => sum + (item.displayBalance ?? 0), 0);

  const withHistory = visible.filter((item) => item.changeFromPrior !== null);
  const fundsDelta = withHistory.length
    ? withHistory.reduce((sum, item) => sum + (item.changeFromPrior ?? 0), 0)
    : null;

  const priorPoint = visible
    .map((item) => item.series?.points.at(-2))
    .filter((p): p is NonNullable<typeof p> => Boolean(p))
    .sort((a, b) => a.periodKey.localeCompare(b.periodKey))
    .at(-1);
  const fundsPriorLabel = priorPoint
    ? monthLabelShort(periodKeyToMonth(priorPoint.periodKey))
    : null;

  const { average: monthlyBurn, monthsUsed: burnMonthsUsed } = trailingBurn(
    monthly,
    planningMonth
  );
  const priorWindowEnd = shiftMonth(planningMonth, -BURN_WINDOW_MONTHS);
  const prior = trailingBurn(monthly, priorWindowEnd);
  const burnDelta =
    prior.monthsUsed >= BURN_WINDOW_MONTHS ? monthlyBurn - prior.average : null;

  const burnSeries: SparkPoint[] = monthly
    .filter((m) => m.month <= planningMonth)
    .slice(-BURN_SERIES_MONTHS)
    .map((m) => ({ key: m.month, label: m.label, value: m.total }));

  const hasFunds = visible.length > 0 && availableFunds !== 0;
  const hasBurn = monthlyBurn > 0;

  const runwayMonths = hasBurn && hasFunds ? availableFunds / monthlyBurn : null;
  const runwayTargetMonth =
    runwayMonths !== null && runwayMonths >= 0
      ? shiftMonth(planningMonth, Math.floor(runwayMonths))
      : null;

  const priorFunds =
    fundsDelta !== null ? availableFunds - fundsDelta : null;
  const priorBurn = priorPoint
    ? trailingBurn(monthly, periodKeyToMonth(priorPoint.periodKey))
    : null;
  const runwayPriorMonths =
    priorFunds !== null && priorBurn && priorBurn.average > 0
      ? priorFunds / priorBurn.average
      : null;

  const fundsSeries = fundsByPeriod(netPositionImports);
  const runwaySeries: SparkPoint[] = fundsSeries
    .map((point) => {
      const burn = trailingBurn(monthly, periodKeyToMonth(point.key));
      if (burn.average <= 0) return null;
      return { key: point.key, label: point.label, value: point.value / burn.average };
    })
    .filter((p): p is SparkPoint => p !== null);

  return {
    availableFunds,
    accountCount: visible.length,
    fundsDelta,
    fundsPriorLabel,
    fundsSeries,
    hasFunds,
    monthlyBurn,
    burnMonthsUsed,
    burnDelta,
    burnSeries,
    hasBurn,
    runwayMonths,
    runwayPriorMonths,
    runwayTargetMonth,
    runwaySeries,
  };
}
