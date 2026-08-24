import { buildNetPositionAccountSeries } from "@/lib/net-position/buildAccountSeries";
import { monthLabelShort, periodKeyToMonth, shiftMonth } from "@/lib/dashboard/month";
import { resolveEmployeeProfile } from "@/lib/employees/stableKey";
import { normalizeAccountBalanceKey } from "@/lib/net-position/accountBalancesView";
import type { PersonnelCostTrendPoint } from "@/lib/dashboard/metrics";
import type { AccountBalanceViewItem } from "@/lib/net-position/accountBalancesView";
import { totalFundedRoots, type RunwayContext } from "@/lib/dashboard/attention";
import type { AppSettings, Employee, NetPositionReportImport, PayrollReportSnapshot } from "@/types";

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
  /**
   * Total balance on the accounts that currently have employee payroll charged
   * to them — not every account on Account Balances. Money in an account nobody
   * is paid from does not answer "how long does my staff stay funded".
   */
  availableFunds: number;
  /** Accounts with payroll whose balance is known — what the total is built from. */
  accountCount: number;
  /**
   * Accounts with payroll but no balance on file. They contribute $0 to the
   * total while their burn still counts against the runway, so the figure is
   * conservative and the gap has to be stated rather than hidden.
   */
  unpricedAccountCount: number;
  /** At least one balance came from an assumed-OK fund's end-date estimate. */
  fundsIncludeEstimated: boolean;
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

  /**
   * Portfolio runway: availableFunds ÷ the combined burn on those same
   * accounts. Scoped to accounts with current payroll, so it is not a blend
   * across money that can't reach these people. The soonest *single* person or
   * account to run dry is a different, more urgent measure — it belongs in the
   * attention queue, and is surfaced here only as the limiting label.
   */
  runwayMonths: number | null;
  /** Name of the person or account that runs dry soonest. */
  runwayLimitingLabel: string | null;
  /** Dollar amount the limiting account is overdrawn by, when it's known and negative. */
  runwayDeficitAmount: number | null;
  /** The person associated with the constraint, when exactly one is known. */
  runwayLimitingPersonName: string | null;
  runwayLimitingPhotoUrl: string | null;
  /** Month the constraint hits, when not already past due. */
  runwayTargetMonth: string | null;
  /** Balance history of the limiting account, when it has Net Position history. */
  runwaySeries: SparkPoint[];
}

export interface ConstrainedRunway {
  months: number | null;
  limitingLabel: string | null;
  deficitAmount: number | null;
  limitingPersonName: string | null;
  limitingPhotoUrl: string | null;
  /** fund-dept-project of the account the figure traces back to, when known. */
  limitingChartRoot: string | null;
}

/**
 * Takes the minimum across every person's and every account's own runway,
 * both already computed by buildRunwayContext with restriction respected —
 * never re-derives a pooled figure. `runway.monthsByEmployee` only carries
 * ids, so employee names are resolved from the roster. When the limiting
 * factor traces back to an account with a negative balance, that balance
 * is surfaced as the deficit — the same figure the account's own row would
 * show, not a re-derivation. The associated person (for a photo) is tracked
 * separately from the label, since the label may name the account instead.
 */
export function buildConstrainedRunway(
  runway: RunwayContext,
  employees: Employee[],
  settings: AppSettings
): ConstrainedRunway {
  const employeeById = new Map(employees.map((e) => [e.id, e]));
  const accountsByRoot = new Map(runway.accounts.map((a) => [a.chartRoot, a]));
  let best: {
    months: number;
    label: string;
    deficitAmount: number | null;
    employeeId: string | null;
    chartRoot: string | null;
  } | null = null;

  for (const [employeeId, months] of runway.monthsByEmployee) {
    if (months === null) continue;
    if (!best || months < best.months) {
      const limiting = runway.limitingAccountByEmployee.get(employeeId);
      const limitingAccount = limiting ? accountsByRoot.get(limiting.chartRoot) : undefined;
      const overdrawn = !!limitingAccount && limitingAccount.balance < 0;
      // An overdrawn account solely charged by this person is the account's
      // problem, not theirs individually — name it the same way the
      // attention queue's spotlight does. The person themselves stays
      // tracked (for a photo) even though the label now names the account.
      const contributors = limiting ? runway.accountContributors.get(limiting.chartRoot) : undefined;
      const soleContributor = contributors?.size === 1;
      best = {
        months,
        label:
          overdrawn && soleContributor && limitingAccount
            ? limitingAccount.name
            : employeeById.get(employeeId)?.name ?? "Unknown",
        deficitAmount: overdrawn && limitingAccount ? Math.abs(limitingAccount.balance) : null,
        employeeId,
        chartRoot: limiting?.chartRoot ?? null,
      };
    }
  }

  for (const account of runway.accounts) {
    if (!best || account.months < best.months) {
      const contributors = runway.accountContributors.get(account.chartRoot);
      const soleContributor = contributors?.size === 1 ? [...contributors][0] : null;
      best = {
        months: account.months,
        label: account.name,
        deficitAmount: account.balance < 0 ? Math.abs(account.balance) : null,
        employeeId: soleContributor ?? null,
        chartRoot: account.chartRoot,
      };
    }
  }

  const employee = best?.employeeId ? employeeById.get(best.employeeId) : undefined;

  return best
    ? {
        months: best.months,
        limitingLabel: best.label,
        deficitAmount: best.deficitAmount,
        limitingPersonName: employee?.name ?? null,
        limitingPhotoUrl: (employee && resolveEmployeeProfile(settings, employee)?.photoUrl) || null,
        limitingChartRoot: best.chartRoot,
      }
    : {
        months: null,
        limitingLabel: null,
        deficitAmount: null,
        limitingPersonName: null,
        limitingPhotoUrl: null,
        limitingChartRoot: null,
      };
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
 * Total balance per Net Position period across the payroll-funded accounts —
 * the same scope as availableFunds, so the sparkline can't tell a different
 * story than the figure above it. Accounts that did not report in a period
 * carry their last known balance forward, so the series reads as "what was on
 * hand then" rather than "who filed that month".
 */
function fundsByPeriod(
  imports: NetPositionReportImport[],
  fundedKeys: Set<string>
): SparkPoint[] {
  const series = buildNetPositionAccountSeries(imports).filter((s) =>
    fundedKeys.has(normalizeAccountBalanceKey(s.accountKey))
  );
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

/**
 * Balance history for the one account the shortest-runway figure traces
 * back to (directly, or via a person's limiting account) — the only
 * granularity with real period-over-period history. No comparable history
 * exists per person, so this is what "how it got here" can honestly show.
 */
function limitingAccountSeries(
  netPositionImports: NetPositionReportImport[],
  chartRoot: string | null
): SparkPoint[] {
  if (!chartRoot) return [];
  const key = normalizeAccountBalanceKey(chartRoot);
  const series = buildNetPositionAccountSeries(netPositionImports);
  const match = series.find((s) => normalizeAccountBalanceKey(s.accountKey) === key);
  if (!match) return [];
  return match.points.slice(-FUNDS_SERIES_PERIODS).map((p) => ({
    key: p.periodKey,
    label: monthLabelShort(periodKeyToMonth(p.periodKey)),
    value: p.endingBalance,
  }));
}

export function buildDashboardOverview({
  monthly,
  planningMonth,
  accountItems,
  netPositionImports,
  runway,
  employees,
  settings,
}: {
  monthly: PersonnelCostTrendPoint[];
  planningMonth: string;
  accountItems: AccountBalanceViewItem[];
  netPositionImports: NetPositionReportImport[];
  runway: RunwayContext;
  employees: Employee[];
  settings: AppSettings;
}): DashboardOverview {
  const fundedKeys = new Set(
    [...runway.fundedRoots.keys()].map((root) => normalizeAccountBalanceKey(root))
  );
  const funded = totalFundedRoots(runway.fundedRoots.values());
  const availableFunds = funded.balance;

  const visible = accountItems.filter(
    (item) => !item.isHidden && fundedKeys.has(normalizeAccountBalanceKey(item.accountKey))
  );

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

  const hasFunds = funded.pricedCount > 0 && availableFunds !== 0;
  const hasBurn = monthlyBurn > 0;

  const constrained = buildConstrainedRunway(runway, employees, settings);
  const runwayMonths = funded.months;
  const runwayTargetMonth =
    runwayMonths !== null && runwayMonths >= 0
      ? shiftMonth(planningMonth, Math.floor(runwayMonths))
      : null;

  const fundsSeries = fundsByPeriod(netPositionImports, fundedKeys);
  const runwaySeries = limitingAccountSeries(netPositionImports, constrained.limitingChartRoot);

  return {
    availableFunds,
    accountCount: funded.pricedCount,
    unpricedAccountCount: funded.unpricedCount,
    fundsIncludeEstimated: funded.hasEstimated,
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
    runwayLimitingLabel: constrained.limitingLabel,
    runwayDeficitAmount: constrained.deficitAmount,
    runwayLimitingPersonName: constrained.limitingPersonName,
    runwayLimitingPhotoUrl: constrained.limitingPhotoUrl,
    runwayTargetMonth,
    runwaySeries,
  };
}
