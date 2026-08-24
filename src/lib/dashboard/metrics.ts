import {
  calculateMonthlyCost,
  getAllMonths,
  getCurrentMonth,
} from "@/lib/calculations";
import {
  getAccountCategoryMeta,
  getFundingSourceCategory,
  getFundingSourceTypes,
} from "@/lib/funding/accountCategory";
import {
  employeeHasEmploymentDates,
  isEmployeeEmployedInMonth,
} from "@/lib/employees/profile";
import { filterEmployeesForPlanning } from "@/lib/employees/roster";
import {
  getEmployeePersonnelType,
  getPersonnelGroups,
  getPersonnelTypeMeta,
} from "@/lib/employees/personnelType";
import type {
  AppSettings,
  FundingSource,
  MonthlyCostRecord,
  PayrollReportSnapshot,
  PersonnelType,
  ProjectionHorizonPreset,
  WorkingPlan,
} from "@/types";
import { formatMonthDisplay, hasPercentEffort } from "@/lib/utils/parse";
import { format, parse } from "date-fns";
import {
  fiscalYearEndingYear,
  fiscalYearEndMonthYm,
  fiscalYearLabel,
  fiscalYearStartMonthYm,
  shiftMonth,
} from "@/lib/dashboard/month";
import { simulateProjections } from "@/lib/projections/simulate";
import { addMonthsYm } from "@/lib/projections/horizon";
import type { MergedPortfolioBalance } from "@/lib/portfolio/mergeBalances";

export type FundingChartKey = string;

/** Cost that is on the payroll total but not charged to any funding source. */
export const UNATTRIBUTED_MIX_KEY = "unattributed";

const COST_EPS = 0.005;

export type FundingMixPeriod =
  | "current_month"
  | "ytd"
  | "last_6m"
  | "last_1y"
  | "last_3y";

export const FUNDING_MIX_PERIOD_OPTIONS: {
  id: FundingMixPeriod;
  label: string;
  shortLabel: string;
}[] = [
  { id: "current_month", label: "Current month", shortLabel: "Month" },
  { id: "ytd", label: "Avg of FYTD", shortLabel: "FYTD" },
  { id: "last_6m", label: "Avg of last 6 months", shortLabel: "6 mo" },
  { id: "last_1y", label: "Avg of last 1 year", shortLabel: "1 yr" },
  { id: "last_3y", label: "Avg of last 3 years", shortLabel: "3 yr" },
];

function categoryForFund(fs: FundingSource, settings: AppSettings): FundingChartKey {
  return getFundingSourceCategory(settings, fs) ?? "uncategorized";
}

export interface PersonnelCostTrendPoint {
  month: string;
  label: string;
  total: number;
  headcount: number;
  isProjected: boolean;
}

export interface YearlyCostPoint {
  /** Fiscal year ending calendar year (2027 = FY26–27 when FY starts in July). */
  year: number;
  label: string;
  /** Costs from payroll months in this fiscal year (FYTD when the year is in progress). */
  actual: number;
  /** Linear extrapolation of remaining months in the current fiscal year. */
  projected: number;
  /** actual + projected */
  total: number;
  headcount: number;
  monthsWithData: number;
  /** Prior FY with fewer than 12 payroll months — not a peer to a full year. */
  partial: boolean;
}

export interface PersonnelGroupBreakdown {
  key: string;
  label: string;
  /** Shorter label for chart axes when available. */
  shortLabel: string;
  count: number;
  cost: number;
  color: string;
}

function planningHeadcountInMonth(
  employeeIds: string[],
  month: string,
  costs: MonthlyCostRecord[],
  settings: AppSettings
): number {
  return employeeIds.filter((id) => {
    if (employeeHasEmploymentDates(settings, id)) {
      return isEmployeeEmployedInMonth(settings, id, month);
    }
    return calculateMonthlyCost(id, month, costs).total > 0;
  }).length;
}

function isEmployeeActiveInMonth(
  employeeId: string,
  month: string,
  costs: MonthlyCostRecord[],
  settings: AppSettings
): boolean {
  if (employeeHasEmploymentDates(settings, employeeId)) {
    return isEmployeeEmployedInMonth(settings, employeeId, month);
  }
  return calculateMonthlyCost(employeeId, month, costs).total > 0;
}

export interface FundingMixSlice {
  key: FundingChartKey;
  name: string;
  value: number;
  color: string;
}

export interface PersonnelTypeFundingMix {
  personnelType: PersonnelType | "unassigned";
  label: string;
  slices: FundingMixSlice[];
  total: number;
}

/** Months included for a funding-mix period, ending at the planning month. */
export function monthsForFundingMixPeriod(
  period: FundingMixPeriod,
  snapshot: PayrollReportSnapshot,
  planningMonth: string,
  fyStartMonth = 7
): string[] {
  const available = getAllMonths(snapshot).filter((m) => m <= planningMonth);
  if (available.length === 0) return [];

  switch (period) {
    case "current_month":
      return available.includes(planningMonth) ? [planningMonth] : [available[available.length - 1]!];
    case "ytd": {
      const fyStart = fiscalYearStartMonthYm(planningMonth, fyStartMonth);
      const ytd = available.filter((m) => m >= fyStart && m <= planningMonth);
      return ytd.length > 0 ? ytd : [available[available.length - 1]!];
    }
    case "last_6m":
      return available.slice(-6);
    case "last_1y":
      return available.slice(-12);
    case "last_3y":
      return available.slice(-36);
    default:
      return [planningMonth];
  }
}

export function fundingMixPeriodCaption(
  period: FundingMixPeriod,
  months: string[],
  planningMonth: string
): string {
  if (months.length === 0) return formatMonthDisplay(planningMonth);
  if (period === "current_month" || months.length === 1) {
    return formatMonthDisplay(months[0]!);
  }
  const first = formatMonthDisplay(months[0]!);
  const last = formatMonthDisplay(months[months.length - 1]!);
  const option = FUNDING_MIX_PERIOD_OPTIONS.find((o) => o.id === period);
  const avgLabel = option?.label ?? "Average";
  return `${avgLabel} · ${first}–${last} (${months.length} mo)`;
}

/** Deviation from the trailing-12-month average that earns an inline anomaly marker. Same kind of hand-picked, documented threshold as CRITICAL_MONTHS/UNATTRIBUTED_THRESHOLD elsewhere on the dashboard — a display heuristic, not a financial calculation. */
export const ANOMALY_THRESHOLD = 0.2;

/** Months in `monthly` whose total deviates from `referenceAverage` by more than ANOMALY_THRESHOLD. Returns month -> signed deviation fraction (0.24 = 24% above, -0.18 = 18% below). Skipped entirely on too little data to mean anything. */
export function flagAnomalousMonths(
  monthly: PersonnelCostTrendPoint[],
  referenceAverage: number,
  minMonthsForSignal = 3
): Map<string, number> {
  const flagged = new Map<string, number>();
  if (monthly.length < minMonthsForSignal || referenceAverage <= 0) return flagged;
  for (const point of monthly) {
    const deviation = (point.total - referenceAverage) / referenceAverage;
    if (Math.abs(deviation) > ANOMALY_THRESHOLD) flagged.set(point.month, deviation);
  }
  return flagged;
}

export function buildPersonnelCostTrend(
  snapshot: PayrollReportSnapshot,
  settings: AppSettings,
  todayYm = format(new Date(), "yyyy-MM"),
  projection?: {
    workingPlan: WorkingPlan | null;
    portfolio: Map<string, MergedPortfolioBalance>;
    horizonMonths: number;
  }
): {
  monthly: PersonnelCostTrendPoint[];
  monthlyProjected: PersonnelCostTrendPoint[];
  yearly: YearlyCostPoint[];
  planningMonth: string;
  groupBreakdown: PersonnelGroupBreakdown[];
} {
  const employees = filterEmployeesForPlanning(snapshot.employees, settings);
  const employeeIds = employees.map((e) => e.id);
  /** Never chart calendar-future months — max out at the current month. */
  const months = getAllMonths(snapshot).filter((m) => m <= todayYm);
  const planningMonth = getCurrentMonth(snapshot);
  const fyStart = settings.fiscalYearStartMonth;
  const currentFy = fiscalYearEndingYear(todayYm, fyStart);

  const monthly = months.map((month) => ({
    month,
    label: formatMonthDisplay(month),
    total: employees.reduce(
      (s, e) => s + calculateMonthlyCost(e.id, month, snapshot.monthlyCosts).total,
      0
    ),
    headcount: planningHeadcountInMonth(employeeIds, month, snapshot.monthlyCosts, settings),
    isProjected: false,
  }));

  const monthlyProjected: PersonnelCostTrendPoint[] = projection
    ? (() => {
        /**
         * `horizonMonths` is the Dashboard's own local scope control (12/24/36),
         * a separate concept from settings.projectionHorizon's presets — none of
         * which is "36". Use "custom" with an explicit end month rather than
         * casting the number to a preset string, which would silently fall back
         * to 12 months for any value the preset union doesn't recognize.
         */
        const fixedHorizonSettings: AppSettings = {
          ...settings,
          projectionHorizon: {
            preset: "custom" as ProjectionHorizonPreset,
            customEndMonth: addMonthsYm(todayYm, projection.horizonMonths - 1),
          },
        };
        const result = simulateProjections({
          snapshot,
          workingPlan: projection.workingPlan,
          settings: fixedHorizonSettings,
          portfolio: projection.portfolio,
          now: parse(`${todayYm}-01`, "yyyy-MM-dd", new Date()),
        });
        const lastActualMonth = monthly[monthly.length - 1]?.month ?? todayYm;
        return result.states
          .map((state, i) => ({ state, month: result.months[i]! }))
          .filter(({ month }) => month > lastActualMonth)
          .map(({ state, month }) => ({
            month,
            label: formatMonthDisplay(month),
            total: state.allocations.reduce((sum, a) => sum + a.monthlyBurn, 0),
            headcount: new Set(
              state.allocations.filter((a) => a.percentEffort > 0).map((a) => a.employeeId)
            ).size,
            isProjected: true,
          }));
      })()
    : [];

  const byYear = new Map<
    number,
    { actual: number; months: string[]; headcount: number }
  >();
  for (const { month, total, headcount } of monthly) {
    const fy = fiscalYearEndingYear(month, fyStart);
    if (Number.isNaN(fy)) continue;
    const prev = byYear.get(fy) ?? { actual: 0, months: [], headcount: 0 };
    byYear.set(fy, {
      actual: prev.actual + total,
      months: [...prev.months, month],
      headcount,
    });
  }

  const yearly = [...byYear.entries()]
    .sort(([a], [b]) => a - b)
    .map(([year, { actual, months: fyMonths, headcount }]) => {
      const monthsWithData = fyMonths.length;
      const partial = monthsWithData < 12;
      const label = fiscalYearLabel(year);
      if (year !== currentFy || monthsWithData === 0) {
        return {
          year,
          label,
          actual,
          projected: 0,
          total: actual,
          headcount,
          monthsWithData,
          partial,
        };
      }
      const lastMonth = [...fyMonths].sort()[fyMonths.length - 1]!;
      const fyEnd = fiscalYearEndMonthYm(lastMonth, fyStart);
      let remainingMonths = 0;
      let cursor = shiftMonth(lastMonth, 1);
      while (cursor <= fyEnd) {
        remainingMonths += 1;
        cursor = shiftMonth(cursor, 1);
      }
      if (remainingMonths === 0) {
        return {
          year,
          label,
          actual,
          projected: 0,
          total: actual,
          headcount,
          monthsWithData,
          partial: false,
        };
      }
      const avgMonthly = actual / monthsWithData;
      const projected = avgMonthly * remainingMonths;
      return {
        year,
        label,
        actual,
        projected,
        total: actual + projected,
        headcount,
        monthsWithData,
        partial: true,
      };
    });

  const groupBreakdown = buildPersonnelGroupBreakdown(
    employees,
    planningMonth,
    snapshot.monthlyCosts,
    settings
  );

  return { monthly, monthlyProjected, yearly, planningMonth, groupBreakdown };
}

export function employeeGroupKey(settings: AppSettings, employeeId: string): string {
  const type = getEmployeePersonnelType(settings, employeeId);
  return type && type !== "" ? type : "unassigned";
}

export function groupLabel(settings: AppSettings, key: string): string {
  if (key === "unassigned") return "Unassigned";
  return getPersonnelTypeMeta(key, settings).label;
}

function emptyGroupRow(
  key: string,
  settings: AppSettings
): PersonnelGroupBreakdown {
  if (key === "unassigned") {
    return {
      key: "unassigned",
      label: "Unassigned",
      shortLabel: "Unassigned",
      count: 0,
      cost: 0,
      color: "#94a3b8",
    };
  }
  const meta = getPersonnelTypeMeta(key, settings);
  const groups = getPersonnelGroups(settings);
  const color = groups.find((g) => g.id === key)?.chartColor ?? meta.chartColor;
  return {
    key,
    label: meta.label,
    shortLabel: meta.shortLabel ?? meta.label,
    count: 0,
    cost: 0,
    color,
  };
}

export function buildPersonnelGroupBreakdown(
  employees: { id: string }[],
  month: string,
  costs: MonthlyCostRecord[],
  settings: AppSettings
): PersonnelGroupBreakdown[] {
  const active = employees.filter((e) =>
    isEmployeeActiveInMonth(e.id, month, costs, settings)
  );
  const personnelGroups = getPersonnelGroups(settings);
  const rows = new Map<string, PersonnelGroupBreakdown>();

  for (const g of personnelGroups) {
    rows.set(g.id, emptyGroupRow(g.id, settings));
  }

  for (const emp of active) {
    const key = employeeGroupKey(settings, emp.id);
    const prev = rows.get(key) ?? emptyGroupRow(key, settings);
    prev.count += 1;
    prev.cost += calculateMonthlyCost(emp.id, month, costs).total;
    rows.set(key, prev);
  }

  return [...rows.values()].filter((r) => r.count > 0 || r.cost > 0);
}

function sliceMeta(key: FundingChartKey, settings: AppSettings): { name: string; color: string } {
  if (key === UNATTRIBUTED_MIX_KEY) return { name: "No funding source", color: "#94a3b8" };
  if (key === "uncategorized") return { name: "Uncategorized", color: "#94a3b8" };
  const meta = getAccountCategoryMeta(key, settings);
  return { name: meta.label, color: meta.chartColor };
}

/**
 * Split one person's monthly payroll total across funds. Shares always sum to
 * that total — unlike per-account runway burn, which can stack effort-only
 * funds on top of salary+benefits.
 */
function partitionEmployeeMonthCost(
  employeeId: string,
  month: string,
  snapshot: PayrollReportSnapshot,
  fundingSourceIds: Set<string>
): { byFund: Map<string, number>; unattributed: number } {
  const personnelCost = calculateMonthlyCost(employeeId, month, snapshot.monthlyCosts).total;
  const byFund = new Map<string, number>();
  if (Math.abs(personnelCost) <= COST_EPS) {
    return { byFund, unattributed: 0 };
  }

  const salaryByFund = new Map<string, number>();
  let totalSalary = 0;
  for (const c of snapshot.monthlyCosts) {
    if (
      c.employeeId !== employeeId ||
      c.month !== month ||
      c.rowType !== "baseSalary" ||
      !c.fundingSourceId
    ) {
      continue;
    }
    salaryByFund.set(c.fundingSourceId, (salaryByFund.get(c.fundingSourceId) ?? 0) + c.amount);
    totalSalary += c.amount;
  }

  let weights = salaryByFund;
  let weightTotal = totalSalary;
  if (Math.abs(totalSalary) <= COST_EPS) {
    weights = new Map<string, number>();
    weightTotal = 0;
    for (const a of snapshot.monthlyAllocations) {
      if (a.employeeId !== employeeId || a.month !== month || !hasPercentEffort(a.percentEffort)) {
        continue;
      }
      weights.set(a.fundingSourceId, (weights.get(a.fundingSourceId) ?? 0) + a.percentEffort);
      weightTotal += a.percentEffort;
    }
  }

  if (Math.abs(weightTotal) <= COST_EPS) {
    return { byFund, unattributed: personnelCost };
  }

  let attributed = 0;
  for (const [fundId, weight] of weights) {
    if (!fundingSourceIds.has(fundId) || weight === 0) continue;
    const share = personnelCost * (weight / weightTotal);
    byFund.set(fundId, share);
    attributed += share;
  }

  const unattributed = personnelCost - attributed;
  return {
    byFund,
    unattributed: Math.abs(unattributed) > COST_EPS ? unattributed : 0,
  };
}

export function buildFundingMixForEmployees(
  employees: { id: string }[],
  months: string[],
  snapshot: PayrollReportSnapshot,
  fundingSources: FundingSource[],
  settings: AppSettings
): FundingMixSlice[] {
  if (months.length === 0) return [];

  const totals = new Map<FundingChartKey, number>();
  const known = new Set(getFundingSourceTypes(settings).map((t) => t.id));
  const fundingSourceIds = new Set(fundingSources.map((fs) => fs.id));
  const fundById = new Map(fundingSources.map((fs) => [fs.id, fs]));

  for (const month of months) {
    for (const emp of employees) {
      const { byFund, unattributed } = partitionEmployeeMonthCost(
        emp.id,
        month,
        snapshot,
        fundingSourceIds
      );

      for (const [fundId, amount] of byFund) {
        const fs = fundById.get(fundId);
        if (!fs) continue;
        let key = categoryForFund(fs, settings);
        if (key !== "uncategorized" && !known.has(key)) key = "uncategorized";
        totals.set(key, (totals.get(key) ?? 0) + amount);
      }

      if (unattributed > COST_EPS) {
        totals.set(UNATTRIBUTED_MIX_KEY, (totals.get(UNATTRIBUTED_MIX_KEY) ?? 0) + unattributed);
      }
    }
  }

  const divisor = months.length;
  return [...totals.entries()]
    .filter(([, value]) => value > COST_EPS)
    .map(([key, value]) => {
      const meta = sliceMeta(key, settings);
      return {
        key,
        name: meta.name,
        value: value / divisor,
        color: meta.color,
      };
    })
    .sort((a, b) => {
      if (a.key === UNATTRIBUTED_MIX_KEY) return 1;
      if (b.key === UNATTRIBUTED_MIX_KEY) return -1;
      return b.value - a.value;
    });
}

export function buildFundingTypeMix(
  snapshot: PayrollReportSnapshot,
  fundingSources: FundingSource[],
  settings: AppSettings,
  period: FundingMixPeriod = "current_month"
): {
  planningMonth: string;
  period: FundingMixPeriod;
  months: string[];
  periodCaption: string;
  total: FundingMixSlice[];
  byPersonnelType: PersonnelTypeFundingMix[];
} {
  const employees = filterEmployeesForPlanning(snapshot.employees, settings);
  const planningMonth = getCurrentMonth(snapshot);
  const months = monthsForFundingMixPeriod(
    period,
    snapshot,
    planningMonth,
    settings.fiscalYearStartMonth
  );
  const periodCaption = fundingMixPeriodCaption(period, months, planningMonth);

  const total = buildFundingMixForEmployees(
    employees,
    months,
    snapshot,
    fundingSources,
    settings
  );

  const personnelGroups = getPersonnelGroups(settings);
  const groups: { personnelType: PersonnelType | "unassigned"; label: string; ids: string[] }[] = [
    ...personnelGroups.map((t) => ({
      personnelType: t.id as PersonnelType,
      label: getPersonnelTypeMeta(t.id, settings).label,
      ids: employees
        .filter((e) => getEmployeePersonnelType(settings, e.id) === t.id)
        .map((e) => e.id),
    })),
    {
      personnelType: "unassigned" as const,
      label: "Unassigned",
      ids: employees
        .filter((e) => !getEmployeePersonnelType(settings, e.id))
        .map((e) => e.id),
    },
  ];

  const byPersonnelType = groups
    .map((g) => {
      const slices = buildFundingMixForEmployees(
        g.ids.map((id) => ({ id })),
        months,
        snapshot,
        fundingSources,
        settings
      );
      const groupTotal = slices.reduce((s, x) => s + x.value, 0);
      return {
        personnelType: g.personnelType,
        label: g.label,
        slices,
        total: groupTotal,
      };
    })
    .filter((g) => g.total > 0);

  return { planningMonth, period, months, periodCaption, total, byPersonnelType };
}
