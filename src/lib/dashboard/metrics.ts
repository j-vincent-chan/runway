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
} from "@/types";
import { formatMonthDisplay } from "@/lib/utils/parse";
import { format } from "date-fns";

export type FundingChartKey = string;

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
  { id: "ytd", label: "Avg of YTD", shortLabel: "YTD" },
  { id: "last_6m", label: "Avg of last 6 months", shortLabel: "6 mo" },
  { id: "last_1y", label: "Avg of last 1 year", shortLabel: "1 yr" },
  { id: "last_3y", label: "Avg of last 3 years", shortLabel: "3 yr" },
];

function employeeFundBurden(
  employeeId: string,
  fundingSourceId: string,
  month: string,
  costs: MonthlyCostRecord[]
): number {
  return costs
    .filter(
      (c) =>
        c.employeeId === employeeId &&
        c.fundingSourceId === fundingSourceId &&
        c.month === month
    )
    .reduce((s, c) => s + c.amount, 0);
}

function categoryForFund(fs: FundingSource, settings: AppSettings): FundingChartKey {
  return getFundingSourceCategory(settings, fs) ?? "uncategorized";
}

export interface PersonnelCostTrendPoint {
  month: string;
  label: string;
  total: number;
  headcount: number;
}

export interface YearlyCostPoint {
  year: number;
  /** Calendar-year costs from payroll months in data (YTD when year is in progress). */
  actual: number;
  /** Linear extrapolation of remaining months when the calendar year is incomplete. */
  projected: number;
  /** actual + projected */
  total: number;
  headcount: number;
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
  planningMonth: string
): string[] {
  const available = getAllMonths(snapshot).filter((m) => m <= planningMonth);
  if (available.length === 0) return [];

  switch (period) {
    case "current_month":
      return available.includes(planningMonth) ? [planningMonth] : [available[available.length - 1]!];
    case "ytd": {
      const year = planningMonth.slice(0, 4);
      const ytd = available.filter((m) => m.startsWith(`${year}-`) && m <= planningMonth);
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

export function buildPersonnelCostTrend(
  snapshot: PayrollReportSnapshot,
  settings: AppSettings
): {
  monthly: PersonnelCostTrendPoint[];
  yearly: YearlyCostPoint[];
  planningMonth: string;
  groupBreakdown: PersonnelGroupBreakdown[];
} {
  const employees = filterEmployeesForPlanning(snapshot.employees, settings);
  const employeeIds = employees.map((e) => e.id);
  const todayYm = format(new Date(), "yyyy-MM");
  /** Never chart calendar-future months — max out at the current month. */
  const months = getAllMonths(snapshot).filter((m) => m <= todayYm);
  const planningMonth = getCurrentMonth(snapshot);
  const currentYear = parseInt(todayYm.split("-")[0]!, 10);

  const monthly = months.map((month) => ({
    month,
    label: formatMonthDisplay(month),
    total: employees.reduce(
      (s, e) => s + calculateMonthlyCost(e.id, month, snapshot.monthlyCosts).total,
      0
    ),
    headcount: planningHeadcountInMonth(employeeIds, month, snapshot.monthlyCosts, settings),
  }));

  const byYear = new Map<
    number,
    { actual: number; monthNums: number[]; headcount: number }
  >();
  for (const { month, total, headcount } of monthly) {
    const [yearStr, monthStr] = month.split("-");
    const year = parseInt(yearStr!, 10);
    const monthNum = parseInt(monthStr!, 10);
    if (Number.isNaN(year) || Number.isNaN(monthNum)) continue;
    const prev = byYear.get(year) ?? { actual: 0, monthNums: [], headcount: 0 };
    byYear.set(year, {
      actual: prev.actual + total,
      monthNums: [...prev.monthNums, monthNum],
      headcount,
    });
  }

  const yearly = [...byYear.entries()]
    .sort(([a], [b]) => a - b)
    .map(([year, { actual, monthNums, headcount }]) => {
      const monthsWithData = monthNums.length;
      if (year !== currentYear || monthsWithData === 0) {
        return { year, actual, projected: 0, total: actual, headcount };
      }
      const lastMonthNum = Math.max(...monthNums);
      const remainingMonths = Math.max(0, 12 - lastMonthNum);
      if (remainingMonths === 0) {
        return { year, actual, projected: 0, total: actual, headcount };
      }
      const avgMonthly = actual / monthsWithData;
      const projected = avgMonthly * remainingMonths;
      return {
        year,
        actual,
        projected,
        total: actual + projected,
        headcount,
      };
    });

  const groupBreakdown = buildPersonnelGroupBreakdown(
    employees,
    planningMonth,
    snapshot.monthlyCosts,
    settings
  );

  return { monthly, yearly, planningMonth, groupBreakdown };
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
  if (key === "uncategorized") return { name: "Uncategorized", color: "#94a3b8" };
  const meta = getAccountCategoryMeta(key, settings);
  return { name: meta.label, color: meta.chartColor };
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

  for (const month of months) {
    for (const emp of employees) {
      for (const fs of fundingSources) {
        const burden = employeeFundBurden(emp.id, fs.id, month, snapshot.monthlyCosts);
        if (burden <= 0) continue;
        let key = categoryForFund(fs, settings);
        if (key !== "uncategorized" && !known.has(key)) key = "uncategorized";
        totals.set(key, (totals.get(key) ?? 0) + burden);
      }
    }
  }

  const divisor = months.length;
  return [...totals.entries()]
    .filter(([, value]) => value > 0)
    .map(([key, value]) => {
      const meta = sliceMeta(key, settings);
      return {
        key,
        name: meta.name,
        value: value / divisor,
        color: meta.color,
      };
    })
    .sort((a, b) => b.value - a.value);
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
  const months = monthsForFundingMixPeriod(period, snapshot, planningMonth);
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
