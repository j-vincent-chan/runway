import {
  calculateMonthlyCost,
  getAllMonths,
  getCurrentMonth,
} from "@/lib/calculations";
import { getFundingSourceCategory } from "@/lib/funding/accountCategory";
import {
  employeeHasEmploymentDates,
  isEmployeeEmployedInMonth,
} from "@/lib/employees/profile";
import { filterEmployeesForPlanning } from "@/lib/employees/roster";
import {
  getEmployeePersonnelType,
  PERSONNEL_TYPES,
} from "@/lib/employees/personnelType";
import type {
  AccountCategory,
  AppSettings,
  FundingSource,
  MonthlyCostRecord,
  PayrollReportSnapshot,
  PersonnelType,
} from "@/types";
import { formatMonthDisplay } from "@/lib/utils/parse";

export type FundingChartKey = AccountCategory | "uncategorized";

export const FUNDING_CHART_COLORS: Record<FundingChartKey, string> = {
  startup: "#0c2340",
  projects: "#b42318",
  endowment: "#047857",
  institutional: "#a16207",
  largeGrants: "#6d28d9",
  researchPlanReviews: "#1d4ed8",
  uncategorized: "#94a3b8",
};

export const FUNDING_CHART_LABELS: Record<FundingChartKey, string> = {
  startup: "Start-up",
  projects: "Projects",
  endowment: "Endowment",
  institutional: "Institutional support",
  largeGrants: "Large grants",
  researchPlanReviews: "Research plan reviews",
  uncategorized: "Uncategorized",
};

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

function categoryForFund(
  fs: FundingSource,
  settings: AppSettings
): FundingChartKey {
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

export function buildPersonnelCostTrend(
  snapshot: PayrollReportSnapshot,
  settings: AppSettings
): { monthly: PersonnelCostTrendPoint[]; yearly: YearlyCostPoint[]; planningMonth: string } {
  const employees = filterEmployeesForPlanning(snapshot.employees, settings);
  const employeeIds = employees.map((e) => e.id);
  const months = getAllMonths(snapshot);
  const planningMonth = getCurrentMonth(snapshot);

  const monthly = months.map((month) => ({
    month,
    label: formatMonthDisplay(month),
    total: employees.reduce(
      (s, e) => s + calculateMonthlyCost(e.id, month, snapshot.monthlyCosts).total,
      0
    ),
    headcount: planningHeadcountInMonth(employeeIds, month, snapshot.monthlyCosts, settings),
  }));

  const currentYear = parseInt(planningMonth.split("-")[0], 10);
  const byYear = new Map<number, { actual: number; months: number; headcount: number }>();
  for (const { month, total, headcount } of monthly) {
    const year = parseInt(month.split("-")[0], 10);
    if (Number.isNaN(year)) continue;
    const prev = byYear.get(year) ?? { actual: 0, months: 0, headcount: 0 };
    byYear.set(year, {
      actual: prev.actual + total,
      months: prev.months + 1,
      headcount,
    });
  }
  const yearly = [...byYear.entries()]
    .sort(([a], [b]) => a - b)
    .map(([year, { actual, months, headcount }]) => {
      const isCurrentYear = year === currentYear && months > 0 && months < 12;
      const projected = isCurrentYear ? (actual / months) * (12 - months) : 0;
      return {
        year,
        actual,
        projected,
        total: actual + projected,
        headcount,
      };
    });

  return { monthly, yearly, planningMonth };
}

function buildFundingMixForEmployees(
  employees: { id: string }[],
  month: string,
  snapshot: PayrollReportSnapshot,
  fundingSources: FundingSource[],
  settings: AppSettings
): FundingMixSlice[] {
  const totals = new Map<FundingChartKey, number>();

  for (const emp of employees) {
    for (const fs of fundingSources) {
      const burden = employeeFundBurden(emp.id, fs.id, month, snapshot.monthlyCosts);
      if (burden <= 0) continue;
      const key = categoryForFund(fs, settings);
      totals.set(key, (totals.get(key) ?? 0) + burden);
    }
  }

  return [...totals.entries()]
    .filter(([, value]) => value > 0)
    .map(([key, value]) => ({
      key,
      name: FUNDING_CHART_LABELS[key],
      value,
      color: FUNDING_CHART_COLORS[key],
    }))
    .sort((a, b) => b.value - a.value);
}

export function buildFundingTypeMix(
  snapshot: PayrollReportSnapshot,
  fundingSources: FundingSource[],
  settings: AppSettings
): {
  planningMonth: string;
  total: FundingMixSlice[];
  byPersonnelType: PersonnelTypeFundingMix[];
} {
  const employees = filterEmployeesForPlanning(snapshot.employees, settings);
  const planningMonth = getCurrentMonth(snapshot);

  const total = buildFundingMixForEmployees(
    employees,
    planningMonth,
    snapshot,
    fundingSources,
    settings
  );
  const groups: { personnelType: PersonnelType | "unassigned"; label: string; ids: string[] }[] =
    [
      ...PERSONNEL_TYPES.map((t) => ({
        personnelType: t.value as PersonnelType,
        label: t.label,
        ids: employees
          .filter((e) => getEmployeePersonnelType(settings, e.id) === t.value)
          .map((e) => e.id),
      })),
      {
        personnelType: "unassigned" as const,
        label: "Unassigned personnel type",
        ids: employees
          .filter((e) => !getEmployeePersonnelType(settings, e.id))
          .map((e) => e.id),
      },
    ];

  const byPersonnelType = groups
    .map((g) => {
      const slices = buildFundingMixForEmployees(
        g.ids.map((id) => ({ id })),
        planningMonth,
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

  return { planningMonth, total, byPersonnelType };
}
