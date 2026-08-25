import type {
  Employee,
  FundingSource,
  MonthlyAllocation,
  PayrollReportSnapshot,
  WorkingPlan,
} from "@/types";
import type { AppSettings } from "@/types";
import {
  calculateMonthlyCost,
  getAllocations,
  getCurrentMonth,
} from "@/lib/calculations";
import {
  chartstringFundDeptProject,
  findBalanceForChartstring,
  normalizeChartstring,
} from "@/lib/funding/chartstring";
import { getRunwayFundingSources, isAccountActiveInMonth } from "@/lib/funding/employeeSources";
import { isEmployeeFundHidden } from "@/lib/funding/visibility";
import { isNotMyAccountKey } from "@/lib/net-position/accountGroup";
import {
  estimateBalanceFromAssumedEnd,
  getRunwayAssumedEndDate,
  monthsUntilAssumedEnd,
} from "@/lib/runway/assumedEndDate";
import { getAliasEntry } from "@/lib/funding/sourceKey";
import { resolveDisplayAlias } from "@/lib/funding/alias";
import { hasPercentEffort } from "@/lib/utils/parse";
import { getProjectionOriginMonth } from "@/lib/projections/horizon";
import type { MergedPortfolioBalance } from "@/lib/portfolio/mergeBalances";
export type RunwayBalanceSource = "portfolio" | "manual" | "estimated" | "none";

export interface RunwayAccountLine {
  fundingSourceId: string;
  chartstring: string;
  displayName: string;
  balance: number;
  balanceSource: RunwayBalanceSource;
  portfolioRunDate?: string;
  portfolioFile?: string;
  percentEffort: number;
  monthlyBurn: number;
  /** Sum of monthly burn for all personnel on this account (runway denominator) */
  sharedMonthlyBurn: number;
  /** Personnel in payroll drawing on this account in the current month */
  sharedContributorCount: number;
  /** Avg monthly salary + benefits for this employee (links % ↔ $) */
  monthlyCompensation: number;
  burnIsOverride: boolean;
  monthsRunway: number | null;
  isHidden: boolean;
  /** Not user's account — excluded from runway math and alerts */
  isAssumedOk: boolean;
  /** Optional end date for assumed-OK (not your) accounts */
  assumedEndDate?: string;
}

export interface SharedBurnContributor {
  employeeId: string;
  employeeName: string;
  monthlyBurn: number;
}

export interface SharedAccountBurn {
  chartRoot: string;
  combinedMonthlyBurn: number;
  contributors: SharedBurnContributor[];
}

/** Combined monthly burn per fund-dept-project across everyone in the payroll snapshot. */
export function buildSharedAccountBurnIndex(
  snapshot: PayrollReportSnapshot,
  workingPlan: WorkingPlan | null,
  fundingSources: FundingSource[],
  settings: AppSettings
): Map<string, SharedAccountBurn> {
  const allocations = getAllocations(snapshot, workingPlan);
  const currentMonth = getCurrentMonth(snapshot);
  const burnMonths = [currentMonth];
  const index = new Map<string, SharedAccountBurn>();
  const touched = new Set<string>();

  for (const emp of snapshot.employees) {
    for (const fs of fundingSources) {
      if (!isAccountActiveInMonth(emp.id, fs.id, currentMonth, snapshot, allocations)) continue;

      const pairKey = `${emp.id}|${fs.id}`;
      if (touched.has(pairKey)) continue;
      touched.add(pairKey);

      const chartstring = fs.accountString ?? fs.rawName;
      const root =
        chartstringFundDeptProject(chartstring) ?? normalizeChartstring(chartstring);
      const burn = resolveBurnAndPercent(
        emp.id,
        fs.id,
        snapshot,
        allocations,
        burnMonths,
        settings.runwayBurnOverrides
      );
      if (burn.monthlyBurn <= 0) continue;

      const entry = index.get(root) ?? {
        chartRoot: root,
        combinedMonthlyBurn: 0,
        contributors: [],
      };
      entry.combinedMonthlyBurn += burn.monthlyBurn;
      entry.contributors.push({
        employeeId: emp.id,
        employeeName: emp.name,
        monthlyBurn: burn.monthlyBurn,
      });
      index.set(root, entry);
    }
  }

  for (const entry of index.values()) {
    const byEmployee = new Map<string, SharedBurnContributor>();
    for (const c of entry.contributors) {
      const prev = byEmployee.get(c.employeeId);
      if (prev) {
        prev.monthlyBurn += c.monthlyBurn;
      } else {
        byEmployee.set(c.employeeId, { ...c });
      }
    }
    entry.contributors = [...byEmployee.values()];
    entry.combinedMonthlyBurn = entry.contributors.reduce((s, c) => s + c.monthlyBurn, 0);
  }

  return index;
}

function chartRootForLine(chartstring: string): string {
  return chartstringFundDeptProject(chartstring) ?? normalizeChartstring(chartstring);
}

export interface EmployeeRunwaySummary {
  employee: Employee;
  accounts: RunwayAccountLine[];
  hiddenAccountCount: number;
  totalBalance: number;
  totalMonthlyBurn: number;
  blendedMonthsRunway: number | null;
}

export function runwayOverrideKey(employeeId: string, chartstring: string): string {
  return `${employeeId}|${normalizeChartstring(chartstring)}`;
}

export function runwayBurnOverrideKey(employeeId: string, fundingSourceId: string): string {
  return `${employeeId}|${fundingSourceId}`;
}

/** True when values match after typical UI rounding (whole dollars, 0.1% effort). */
export function runwayBurnValuesMatch(
  a: { percentEffort: number; monthlyBurn: number },
  b: { percentEffort: number; monthlyBurn: number }
): boolean {
  const pctClose =
    Math.abs(a.percentEffort - b.percentEffort) < 0.05 ||
    (a.percentEffort <= 0 && b.percentEffort <= 0);
  const burnClose =
    Math.abs(a.monthlyBurn - b.monthlyBurn) < 0.5 ||
    (a.monthlyBurn <= 0 && b.monthlyBurn <= 0);
  return pctClose && burnClose;
}

export function runwayBalanceValuesMatch(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.01 || (a === 0 && b === 0);
}

function averageAllocationPercent(
  employeeId: string,
  fundingSourceId: string,
  allocations: MonthlyAllocation[],
  visibleMonths: string[]
): number {
  const monthSet = new Set(visibleMonths);
  let sum = 0;
  let count = 0;
  for (const a of allocations) {
    if (a.employeeId !== employeeId || a.fundingSourceId !== fundingSourceId) continue;
    if (!monthSet.has(a.month) || !hasPercentEffort(a.percentEffort)) continue;
    sum += a.percentEffort;
    count += 1;
  }
  return count > 0 ? sum / count : 0;
}

export function averageMonthlyCompensation(
  employeeId: string,
  snapshot: PayrollReportSnapshot,
  visibleMonths: string[]
): number {
  const monthSet = new Set(visibleMonths);
  const actual = [...snapshot.actualMonths].sort().filter((m) => monthSet.has(m));
  const months =
    actual.length > 0
      ? actual.slice(-3)
      : visibleMonths.length > 0
        ? [visibleMonths[visibleMonths.length - 1]]
        : [getCurrentMonth(snapshot)];

  let sum = 0;
  let count = 0;
  for (const m of months) {
    const total = calculateMonthlyCost(employeeId, m, snapshot.monthlyCosts).total;
    if (total > 0) {
      sum += total;
      count += 1;
    }
  }
  if (count > 0) return sum / count;
  return calculateMonthlyCost(employeeId, getCurrentMonth(snapshot), snapshot.monthlyCosts).total;
}

export function computePayrollBurnDefaults(
  employeeId: string,
  fundingSourceId: string,
  snapshot: PayrollReportSnapshot,
  allocations: MonthlyAllocation[],
  visibleMonths: string[]
): { percentEffort: number; monthlyBurn: number; monthlyCompensation: number } {
  const monthlyCompensation = averageMonthlyCompensation(employeeId, snapshot, visibleMonths);
  const importedBurn = averageMonthlyBurn(
    employeeId,
    fundingSourceId,
    snapshot,
    allocations,
    visibleMonths
  );
  const importedPercent = averageAllocationPercent(
    employeeId,
    fundingSourceId,
    allocations,
    visibleMonths
  );

  let percentEffort = importedPercent;
  let monthlyBurn = importedBurn;

  if (monthlyBurn === 0 && monthlyCompensation > 0 && hasPercentEffort(percentEffort)) {
    monthlyBurn = (monthlyCompensation * percentEffort) / 100;
  } else if (!hasPercentEffort(percentEffort) && monthlyCompensation > 0 && monthlyBurn > 0) {
    percentEffort = (monthlyBurn / monthlyCompensation) * 100;
  }

  return { percentEffort, monthlyBurn, monthlyCompensation };
}

function resolveBurnAndPercent(
  employeeId: string,
  fundingSourceId: string,
  snapshot: PayrollReportSnapshot,
  allocations: MonthlyAllocation[],
  visibleMonths: string[],
  overrides: AppSettings["runwayBurnOverrides"]
): Pick<RunwayAccountLine, "percentEffort" | "monthlyBurn" | "monthlyCompensation" | "burnIsOverride"> {
  const defaults = computePayrollBurnDefaults(
    employeeId,
    fundingSourceId,
    snapshot,
    allocations,
    visibleMonths
  );
  const { monthlyCompensation } = defaults;

  const override = overrides?.[runwayBurnOverrideKey(employeeId, fundingSourceId)];
  if (override) {
    if (runwayBurnValuesMatch(override, defaults)) {
      return { ...defaults, burnIsOverride: false };
    }
    return {
      percentEffort: override.percentEffort,
      monthlyBurn: override.monthlyBurn,
      monthlyCompensation,
      burnIsOverride: true,
    };
  }

  return { ...defaults, burnIsOverride: false };
}

export function calculateEmployeeAccountMonthlyBurn(
  employeeId: string,
  fundingSourceId: string,
  month: string,
  snapshot: PayrollReportSnapshot,
  allocations: MonthlyAllocation[]
): number {
  const costs = snapshot.monthlyCosts;
  const directSalary = costs
    .filter(
      (c) =>
        c.employeeId === employeeId &&
        c.fundingSourceId === fundingSourceId &&
        c.month === month &&
        c.rowType === "baseSalary"
    )
    .reduce((s, c) => s + c.amount, 0);

  if (directSalary !== 0) {
    const totalSalary = costs
      .filter(
        (c) =>
          c.employeeId === employeeId &&
          c.month === month &&
          c.rowType === "baseSalary"
      )
      .reduce((s, c) => s + c.amount, 0);
    const monthlyTotal = calculateMonthlyCost(employeeId, month, costs).total;
    const benefitsPortion = Math.max(0, monthlyTotal - totalSalary);
    return directSalary + (totalSalary > 0 ? benefitsPortion * (directSalary / totalSalary) : 0);
  }

  const alloc = allocations.find(
    (a) =>
      a.employeeId === employeeId &&
      a.fundingSourceId === fundingSourceId &&
      a.month === month &&
      hasPercentEffort(a.percentEffort)
  );
  if (!alloc) return 0;
  const monthlyTotal = calculateMonthlyCost(employeeId, month, costs).total;
  return monthlyTotal * (alloc.percentEffort / 100);
}

function averageMonthlyBurn(
  employeeId: string,
  fundingSourceId: string,
  snapshot: PayrollReportSnapshot,
  allocations: MonthlyAllocation[],
  visibleMonths: string[]
): number {
  const monthSet = new Set(visibleMonths);
  const actual = [...snapshot.actualMonths].sort().filter((m) => monthSet.has(m));
  const months =
    actual.length > 0 ? actual.slice(-3) : visibleMonths.length > 0 ? [visibleMonths[visibleMonths.length - 1]] : [getCurrentMonth(snapshot)];
  let sum = 0;
  let count = 0;
  for (const m of months) {
    const burn = calculateEmployeeAccountMonthlyBurn(
      employeeId,
      fundingSourceId,
      m,
      snapshot,
      allocations
    );
    if (burn > 0) {
      sum += burn;
      count += 1;
    }
  }
  if (count > 0) return sum / count;
  const current = getCurrentMonth(snapshot);
  return calculateEmployeeAccountMonthlyBurn(
    employeeId,
    fundingSourceId,
    current,
    snapshot,
    allocations
  );
}

function resolveBalance(
  employeeId: string,
  chartstring: string,
  portfolio: Map<string, MergedPortfolioBalance>,
  overrides: AppSettings["runwayBalanceOverrides"]
): Pick<RunwayAccountLine, "balance" | "balanceSource" | "portfolioRunDate" | "portfolioFile"> {
  const portfolioBalances = new Map<string, number>();
  for (const [k, v] of portfolio) {
    portfolioBalances.set(k, v.balance);
  }
  const match = findBalanceForChartstring(chartstring, portfolioBalances);

  const overrideKey = runwayOverrideKey(employeeId, chartstring);
  const manual = overrides?.[overrideKey];
  if (manual !== undefined && manual !== null && !Number.isNaN(manual)) {
    if (match !== undefined && runwayBalanceValuesMatch(manual, match.balance)) {
      const metaKey = normalizeChartstring(match.matchedKey);
      const meta =
        portfolio.get(metaKey) ??
        [...portfolio.values()].find((e) =>
          normalizeChartstring(e.chartstring) === metaKey
        );
      return {
        balance: match.balance,
        balanceSource: "portfolio",
        portfolioRunDate: meta?.reportRunDate,
        portfolioFile: meta?.sourceFileName,
      };
    }
    return { balance: manual, balanceSource: "manual" };
  }

  if (match !== undefined) {
    const metaKey = normalizeChartstring(match.matchedKey);
    const meta =
      portfolio.get(metaKey) ??
      [...portfolio.values()].find((e) =>
        normalizeChartstring(e.chartstring) === metaKey
      );
    return {
      balance: match.balance,
      balanceSource: "portfolio",
      portfolioRunDate: meta?.reportRunDate,
      portfolioFile: meta?.sourceFileName,
    };
  }

  return { balance: 0, balanceSource: "none" };
}

export function computeEmployeeRunway(
  employee: Employee,
  snapshot: PayrollReportSnapshot,
  workingPlan: WorkingPlan | null,
  fundingSources: FundingSource[],
  settings: AppSettings,
  portfolio: Map<string, MergedPortfolioBalance>,
  sharedBurnIndex: Map<string, SharedAccountBurn>,
  options: { revealHidden: boolean; estimateOriginMonth?: string }
): EmployeeRunwaySummary {
  const allocations = getAllocations(snapshot, workingPlan);
  const currentMonth = getCurrentMonth(snapshot);
  /**
   * "How much is left on this account" is a question about now, so an assumed
   * end date is measured from today's month — not the payroll planning month,
   * which can be several months back and would count money already spent as
   * still available.
   *
   * Only the estimate uses this. Burn and account activity still come from the
   * planning month, because that is the last month with real payroll behind it.
   * Injectable so tests do not depend on the wall clock.
   */
  const estimateOrigin = options.estimateOriginMonth ?? getProjectionOriginMonth();
  const activeSources = getRunwayFundingSources(
    employee.id,
    allocations,
    fundingSources,
    snapshot,
    settings,
    { revealHidden: options.revealHidden }
  );

  const hiddenAccountCount = (settings.hiddenEmployeeFunds ?? []).filter((key) => {
    const [eid, fsid] = key.split("|");
    if (eid !== employee.id || !fsid) return false;
    return isAccountActiveInMonth(employee.id, fsid, currentMonth, snapshot, allocations);
  }).length;
  const burnMonths = [currentMonth];
  const accounts: RunwayAccountLine[] = activeSources.map((fs) => {
    const chartstring = fs.accountString ?? fs.rawName;
    const bal = resolveBalance(employee.id, chartstring, portfolio, settings.runwayBalanceOverrides);
    const burn = resolveBurnAndPercent(
      employee.id,
      fs.id,
      snapshot,
      allocations,
      burnMonths,
      settings.runwayBurnOverrides
    );
    const root = chartRootForLine(chartstring);
    const shared = sharedBurnIndex.get(root);
    const sharedMonthlyBurn = shared?.combinedMonthlyBurn ?? burn.monthlyBurn;
    const sharedContributorCount = shared?.contributors.length ?? (burn.monthlyBurn > 0 ? 1 : 0);
    // Both read the account, not this person's slice of it: "not my money" and
    // "the account ends here" are facts about the account itself.
    const isAssumedOk = isNotMyAccountKey(settings, root);
    const assumedEndDate = getRunwayAssumedEndDate(settings, root);

    let balance = bal.balance;
    let balanceSource = bal.balanceSource;
    let monthsRunway =
      sharedMonthlyBurn > 0 ? bal.balance / sharedMonthlyBurn : null;

    if (isAssumedOk && assumedEndDate) {
      const monthsFromEnd = monthsUntilAssumedEnd(estimateOrigin, assumedEndDate);
      if (monthsFromEnd !== null && sharedMonthlyBurn > 0) {
        monthsRunway = monthsFromEnd;
        balance = estimateBalanceFromAssumedEnd(monthsFromEnd, sharedMonthlyBurn);
        balanceSource = "estimated";
      }
    }

    const aliasEntry = getAliasEntry(settings.fundingSourceAliases, fs);
    return {
      fundingSourceId: fs.id,
      chartstring,
      displayName: resolveDisplayAlias(fs, aliasEntry?.alias),
      balance,
      balanceSource,
      portfolioRunDate: bal.portfolioRunDate,
      portfolioFile: bal.portfolioFile,
      percentEffort: burn.percentEffort,
      monthlyBurn: burn.monthlyBurn,
      sharedMonthlyBurn,
      sharedContributorCount,
      monthlyCompensation: burn.monthlyCompensation,
      burnIsOverride: burn.burnIsOverride,
      monthsRunway: monthsRunway === null ? null : monthsRunway,
      isHidden: isEmployeeFundHidden(settings, employee.id, fs.id),
      isAssumedOk,
      assumedEndDate,
    };
  });

  /**
   * Assumed-OK accounts count, at the estimated balance their end date
   * implies — `balance` above is already that estimate, not the real one.
   * They used to be dropped entirely, which meant marking an account "not my
   * account" removed its people's funding from the maths rather than valuing
   * it differently.
   *
   * Hidden is a separate idea and still excluded: hidden means "don't show me
   * this", assumed-OK means "count this differently". Collapsing the two into
   * one filter is what produced the old behaviour.
   */
  const included = accounts.filter((a) => !a.isHidden);
  const seenRoots = new Set<string>();
  let totalBalance = 0;
  let totalMonthlyBurn = 0;
  for (const a of included) {
    const root = chartRootForLine(a.chartstring);
    if (seenRoots.has(root)) continue;
    seenRoots.add(root);
    totalBalance += a.balance;
    totalMonthlyBurn += a.sharedMonthlyBurn;
  }
  const blendedMonthsRunway =
    totalMonthlyBurn > 0 ? totalBalance / totalMonthlyBurn : null;

  return {
    employee,
    accounts,
    hiddenAccountCount,
    totalBalance,
    totalMonthlyBurn,
    blendedMonthsRunway,
  };
}

/** Runway bars are scaled to this many months (3 years). */
export const RUNWAY_BAR_CAP_MONTHS = 36;

export function isRunwayDeficit(months: number | null): boolean {
  return months !== null && months < 0;
}

export function isRunwayBeyondBarCap(months: number | null): boolean {
  return months !== null && months > RUNWAY_BAR_CAP_MONTHS;
}

export function runwayBarFillPercent(months: number | null): number {
  if (months === null) return 8;
  if (months <= 0) return 2;
  return Math.min(100, (months / RUNWAY_BAR_CAP_MONTHS) * 100);
}

export function runwayMonthsLabel(months: number | null): string {
  if (months === null) return "No burn data";
  if (months < 0) return "Deficit";
  if (months === 0) return "Depleted";
  if (months < 1) return `${Math.round(months * 30)} days`;
  if (months >= 36) return `${(months / 12).toFixed(1)} yr`;
  return `${months.toFixed(1)} mo`;
}

export type RunwayHealthTier = "green" | "yellow" | "red" | "neutral";

/** Traffic-light tier for roster status dots (green / yellow / red). */
export function runwayHealthTier(months: number | null): RunwayHealthTier {
  if (months === null) return "neutral";
  if (months < 0 || months < 6) return "red";
  if (months < 12) return "yellow";
  return "green";
}

export function runwayHealthDotClass(tier: RunwayHealthTier): string {
  switch (tier) {
    case "green":
      return "bg-emerald-500";
    case "yellow":
      return "bg-amber-400";
    case "red":
      return "bg-red-500";
    default:
      return "bg-slate-300";
  }
}

export function runwayUrgencyClass(months: number | null): string {
  if (months === null) return "bg-slate-200";
  if (months < 0) return "bg-red-700";
  if (months < 3) return "bg-red-500";
  if (months < 6) return "bg-amber-500";
  if (months < 12) return "bg-yellow-400";
  return "bg-emerald-500";
}

export function isRunwayStatusLabel(months: number | null): boolean {
  return months === null || months <= 0;
}

export function runwayLabelClass(months: number | null): string {
  if (months !== null && months < 0) {
    return "inline-flex min-h-[1.125rem] items-center justify-center rounded bg-red-600 px-2 py-0.5 text-center text-[10px] font-semibold leading-none text-white shadow-sm";
  }
  if (months === 0) {
    return "inline-flex min-h-[1.125rem] items-center justify-center rounded bg-red-100 px-2 py-0.5 text-center text-[10px] font-semibold leading-none text-red-800 ring-1 ring-red-200";
  }
  return "text-slate-700";
}
