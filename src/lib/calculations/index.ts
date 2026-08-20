import type {
  AppSettings,
  CoverageSummary,
  CoverageStatus,
  Employee,
  FundingCliff,
  FundingSource,
  MonthlyAllocation,
  MonthlyCostRecord,
  PayFrequency,
  PayrollReportSnapshot,
  WorkingPlan,
} from "@/types";
import { DEFAULT_SETTINGS } from "@/types";
import { ANNUAL_WORK_HOURS, formatMonthDisplay, generateId } from "@/lib/utils/parse";
import { resolveDisplayAlias } from "@/lib/funding/alias";
import { getAliasEntry } from "@/lib/funding/sourceKey";
import {
  type CoverageOptions,
  coverageOptionsFromSettings,
  getEffectiveExpectedPercent,
} from "@/lib/funding/visibility";
export type { CoverageOptions } from "@/lib/funding/visibility";
import { addMonths, parse, differenceInDays, format } from "date-fns";
import { consolidateAllocations } from "@/lib/import/consolidateAllocations";

export function getAllocations(
  snapshot: PayrollReportSnapshot,
  workingPlan?: WorkingPlan | null
): MonthlyAllocation[] {
  if (!workingPlan || workingPlan.snapshotId !== snapshot.id) {
    return snapshot.monthlyAllocations;
  }
  const edited = new Map(
    workingPlan.allocations.map((a) => [`${a.employeeId}|${a.fundingSourceId}|${a.month}`, a])
  );
  const base = snapshot.monthlyAllocations.map((a) => {
    const key = `${a.employeeId}|${a.fundingSourceId}|${a.month}`;
    return edited.get(key) ?? a;
  });
  const baseKeys = new Set(
    snapshot.monthlyAllocations.map((a) => `${a.employeeId}|${a.fundingSourceId}|${a.month}`)
  );
  for (const a of workingPlan.allocations) {
    const key = `${a.employeeId}|${a.fundingSourceId}|${a.month}`;
    if (!baseKeys.has(key)) base.push(a);
  }
  return consolidateAllocations(base);
}

export function calculateEmployeeCoverage(
  employee: Employee,
  month: string,
  allocations: MonthlyAllocation[],
  options?: CoverageOptions
): CoverageSummary {
  const expected = options?.expectedPercentOverride ?? employee.appointmentPercent;
  const excluded = options?.excludedFundingSourceIds;
  const allocated = allocations
    .filter((a) => a.employeeId === employee.id && a.month === month)
    .filter((a) => !excluded?.has(a.fundingSourceId))
    .reduce((s, a) => s + a.percentEffort, 0);

  const unallocated = Math.max(0, expected - allocated);
  const overallocated = Math.max(0, allocated - expected);

  let status: CoverageStatus = "unknown";
  if (Math.abs(allocated - expected) < 0.5) status = "fullyCovered";
  else if (allocated < expected - 0.5) status = "underallocated";
  else if (allocated > expected + 0.5) status = "overallocated";

  return {
    employeeId: employee.id,
    month,
    expectedPercent: expected,
    allocatedPercent: allocated,
    unallocatedPercent: unallocated,
    overallocatedPercent: overallocated,
    status,
  };
}

export function getAllMonths(snapshot: PayrollReportSnapshot): string[] {
  const set = new Set<string>();
  snapshot.monthlyAllocations.forEach((a) => set.add(a.month));
  snapshot.monthlyCosts.forEach((c) => set.add(c.month));
  return [...set].sort();
}

export function detectFundingCliffs(
  employee: Employee,
  allocations: MonthlyAllocation[],
  months: string[],
  threshold = 25,
  options?: CoverageOptions
): FundingCliff[] {
  const cliffs: FundingCliff[] = [];
  const sorted = [...months].sort();

  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    const before = calculateEmployeeCoverage(employee, prev, allocations, options).allocatedPercent;
    const after = calculateEmployeeCoverage(employee, curr, allocations, options).allocatedPercent;
    const drop = before - after;
    if (drop >= threshold) {
      cliffs.push({
        id: generateId(),
        employeeId: employee.id,
        employeeName: employee.name,
        fromMonth: prev,
        toMonth: curr,
        beforePercent: before,
        afterPercent: after,
        dropPercent: drop,
        severity: drop >= 50 ? "urgent" : drop >= 35 ? "atRisk" : "watch",
        explanation: `Support drops from ${before.toFixed(0)}% to ${after.toFixed(0)}% after ${prev}.`,
      });
    }
  }
  return cliffs;
}

export interface YearlyCompBreakdown {
  month: string;
  yearlySalary: number;
  yearlyTotal: number;
  /** Implied full-time hourly rate when pay is biweekly. */
  hourlyRate: number | null;
}

/** Annual salary and S+B from the snapshot's planning month (latest actual month). */
export function getYearlyCompBreakdown(
  employeeId: string,
  snapshot: PayrollReportSnapshot,
  payFrequency?: PayFrequency
): YearlyCompBreakdown {
  const month = getCurrentMonth(snapshot);
  const { salary, benefits, total } = calculateMonthlyCost(
    employeeId,
    month,
    snapshot.monthlyCosts
  );
  const monthlySalary = salary > 0 ? salary : Math.max(0, total - benefits);
  const yearlySalary = monthlySalary * 12;
  const yearlyTotal = total * 12;
  const hourlyRate =
    payFrequency === "biweekly" && yearlySalary > 0
      ? yearlySalary / ANNUAL_WORK_HOURS
      : null;

  return { month, yearlySalary, yearlyTotal, hourlyRate };
}

export interface EmployeeCompTrendPoint {
  month: string;
  yearlySalary: number;
  yearlyTotal: number;
  monthlyTotal: number;
}

export interface EmployeeYearlyRatePoint {
  year: number;
  months: number;
  avgYearlySalary: number;
  avgYearlyTotal: number;
  paidTotal: number;
}

/** Annualized salary / S+B for each payroll month on file — used for roster sparklines. */
export function getEmployeeCompTrend(
  employeeId: string,
  snapshot: PayrollReportSnapshot
): { monthly: EmployeeCompTrendPoint[]; yearly: EmployeeYearlyRatePoint[] } {
  const fromCosts = snapshot.monthlyCosts
    .filter((c) => c.employeeId === employeeId && c.month)
    .map((c) => c.month);
  const months = [...new Set(fromCosts.length > 0 ? fromCosts : getAllMonths(snapshot))].sort();
  const monthly: EmployeeCompTrendPoint[] = [];
  for (const month of months) {
    const { salary, benefits, total } = calculateMonthlyCost(
      employeeId,
      month,
      snapshot.monthlyCosts
    );
    if (Math.abs(total) < 0.005 && Math.abs(salary) < 0.005) continue;
    const monthlySalary = salary > 0 ? salary : Math.max(0, total - benefits);
    monthly.push({
      month,
      yearlySalary: monthlySalary * 12,
      yearlyTotal: total * 12,
      monthlyTotal: total,
    });
  }

  const byYear = new Map<
    number,
    { salary: number; total: number; paid: number; months: number }
  >();
  for (const p of monthly) {
    const year = parseInt(p.month.slice(0, 4), 10);
    if (Number.isNaN(year)) continue;
    const prev = byYear.get(year) ?? { salary: 0, total: 0, paid: 0, months: 0 };
    byYear.set(year, {
      salary: prev.salary + p.yearlySalary,
      total: prev.total + p.yearlyTotal,
      paid: prev.paid + p.monthlyTotal,
      months: prev.months + 1,
    });
  }
  const yearly: EmployeeYearlyRatePoint[] = [...byYear.entries()]
    .sort(([a], [b]) => a - b)
    .map(([year, v]) => ({
      year,
      months: v.months,
      avgYearlySalary: v.months > 0 ? v.salary / v.months : 0,
      avgYearlyTotal: v.months > 0 ? v.total / v.months : 0,
      paidTotal: v.paid,
    }));

  return { monthly, yearly };
}

export function calculateMonthlyCost(
  employeeId: string,
  month: string,
  costs: MonthlyCostRecord[]
): { salary: number; benefits: number; total: number } {
  const empCosts = costs.filter((c) => c.employeeId === employeeId && c.month === month);
  const salary = empCosts
    .filter((c) => c.rowType === "baseSalary")
    .reduce((s, c) => s + c.amount, 0);
  const benefits =
    empCosts.find((c) => c.rowType === "benefits")?.amount ??
    empCosts.filter((c) => c.rowType === "benefits").reduce((s, c) => s + c.amount, 0);
  const total =
    empCosts.find((c) => c.rowType === "totalCompBenefits")?.amount ?? salary + benefits;
  return { salary, benefits, total };
}

export function calculateAccountBurden(
  fundingSourceId: string,
  month: string,
  costs: MonthlyCostRecord[]
): number {
  return costs
    .filter((c) => c.fundingSourceId === fundingSourceId && c.month === month)
    .reduce((s, c) => s + c.amount, 0);
}

export function calculateFYPersonnelCost(
  snapshot: PayrollReportSnapshot,
  fiscalYear: number,
  settings: AppSettings = DEFAULT_SETTINGS
): number {
  const fyStart = settings.fiscalYearStartMonth;
  let total = 0;
  const months = getAllMonths(snapshot);
  for (const month of months) {
    const [y, m] = month.split("-").map(Number);
    const fy = m >= fyStart ? y + 1 : y;
    if (fy !== fiscalYear) continue;
    for (const emp of snapshot.employees) {
      total += calculateMonthlyCost(emp.id, month, snapshot.monthlyCosts).total;
    }
  }
  return total;
}

export function getCurrentMonth(snapshot: PayrollReportSnapshot): string {
  const months = getAllMonths(snapshot);
  const now = format(new Date(), "yyyy-MM");
  if (months.includes(now)) return now;
  const actual = snapshot.actualMonths;
  return actual[actual.length - 1] ?? months[months.length - 1] ?? now;
}

export interface AlertItem {
  id: string;
  severity: "info" | "watch" | "atRisk" | "urgent";
  category: string;
  employeeId?: string;
  employeeName?: string;
  fundingSourceId?: string;
  month?: string;
  title: string;
  explanation: string;
  action: string;
  href?: string;
}

export function generateAlerts(
  snapshot: PayrollReportSnapshot,
  allocations: MonthlyAllocation[],
  settings: AppSettings = DEFAULT_SETTINGS
): AlertItem[] {
  const alerts: AlertItem[] = [];
  const months = getAllMonths(snapshot);
  const calendarMonth = format(new Date(), "yyyy-MM");
  const latestInFile = months[months.length - 1];
  if (latestInFile && latestInFile < calendarMonth) {
    alerts.push({
      id: "payroll-stale",
      severity: "urgent",
      category: "Data",
      month: latestInFile,
      title: `Payroll does not include ${formatMonthDisplay(calendarMonth)}`,
      explanation: `This report ends in ${formatMonthDisplay(latestInFile)}. Upload a current Payroll Funding Report so the timeline can show this month.`,
      action: "Upload the latest payroll report",
      href: "/upload",
    });
  }

  const current = getCurrentMonth(snapshot);

  for (const emp of snapshot.employees) {
    const opts = coverageOptionsFromSettings(emp, settings);
    const cov = calculateEmployeeCoverage(emp, current, allocations, opts);
    if (cov.status === "underallocated") {
      alerts.push({
        id: generateId(),
        severity: "atRisk",
        category: "Underallocated",
        employeeId: emp.id,
        employeeName: emp.name,
        month: current,
        title: `${emp.name} underallocated in ${current}`,
        explanation: `Only ${cov.allocatedPercent.toFixed(0)}% allocated vs ${cov.expectedPercent}% appointment.`,
        action: "Review funding sources or adjust allocations on the timeline.",
      });
    }
    if (cov.status === "overallocated") {
      alerts.push({
        id: generateId(),
        severity: "watch",
        category: "Overallocated",
        employeeId: emp.id,
        employeeName: emp.name,
        month: current,
        title: `${emp.name} overallocated in ${current}`,
        explanation: `${cov.allocatedPercent.toFixed(0)}% exceeds ${cov.expectedPercent}% appointment.`,
        action: "Confirm with your finance/post-award analyst.",
      });
    }

    const cliffs = detectFundingCliffs(emp, allocations, months, settings.fundingCliffThreshold, opts);
    for (const cliff of cliffs.slice(0, 2)) {
      alerts.push({
        id: cliff.id,
        severity: cliff.severity,
        category: "Funding cliff",
        employeeId: emp.id,
        employeeName: emp.name,
        month: cliff.toMonth,
        title: `${emp.name}: ${cliff.dropPercent.toFixed(0)}% drop after ${cliff.fromMonth}`,
        explanation: cliff.explanation,
        action: "Plan bridge funding or adjust future distributions.",
      });
    }

    const lastFuture = [...snapshot.futureMonths].sort().pop();
    if (lastFuture) {
      const futureCov = calculateEmployeeCoverage(emp, lastFuture, allocations, opts);
      const expected = getEffectiveExpectedPercent(emp, settings);
      if (futureCov.allocatedPercent < expected - 5) {
        const endDate = parse(lastFuture + "-01", "yyyy-MM-dd", new Date());
        const days = differenceInDays(endDate, new Date());
        if (days <= settings.supportEndingSoonDays && days >= 0) {
          alerts.push({
            id: generateId(),
            severity: "watch",
            category: "Support ending soon",
            employeeId: emp.id,
            employeeName: emp.name,
            month: lastFuture,
            title: `${emp.name} support ends / drops in ${lastFuture}`,
            explanation: `Future distribution shows ${futureCov.allocatedPercent.toFixed(0)}% by ${lastFuture}.`,
            action: "Recommended review before support ends.",
          });
        }
      }
    }
  }

  for (const fs of snapshot.fundingSources) {
    if (fs.alias === fs.rawName && fs.rawName.length > 40) {
      alerts.push({
        id: generateId(),
        severity: "info",
        category: "Unaliased account",
        fundingSourceId: fs.id,
        title: "Account needs friendly alias",
        explanation: fs.rawName.substring(0, 80),
        action: "Set alias in Settings.",
      });
    }
  }

  return alerts;
}

export function computeKpis(
  snapshot: PayrollReportSnapshot,
  allocations: MonthlyAllocation[],
  settings: AppSettings = DEFAULT_SETTINGS
) {
  const current = getCurrentMonth(snapshot);
  let totalMonthly = 0;
  let fullyCovered = 0;
  let withGaps = 0;
  let overallocated = 0;
  let supportEnding = 0;

  for (const emp of snapshot.employees) {
    const opts = coverageOptionsFromSettings(emp, settings);
    const cov = calculateEmployeeCoverage(emp, current, allocations, opts);
    const cost = calculateMonthlyCost(emp.id, current, snapshot.monthlyCosts);
    totalMonthly += cost.total;
    if (cov.status === "fullyCovered") fullyCovered++;
    if (cov.status === "underallocated") withGaps++;
    if (cov.status === "overallocated") overallocated++;

    const lastFuture = snapshot.futureMonths.sort().pop();
    if (lastFuture) {
      const fc = calculateEmployeeCoverage(emp, lastFuture, allocations, opts);
      const expected = getEffectiveExpectedPercent(emp, settings);
      if (fc.allocatedPercent < expected - 10) supportEnding++;
    }
  }

  const fy = new Date().getMonth() + 1 >= settings.fiscalYearStartMonth
    ? new Date().getFullYear() + 1
    : new Date().getFullYear();
  const fyCost = calculateFYPersonnelCost(snapshot, fy, settings);

  return {
    totalMonthly,
    fullyCovered,
    withGaps,
    overallocated,
    supportEnding,
    employeeCount: snapshot.employees.length,
    fyCost,
    currentMonth: current,
  };
}

export function applyAliases(
  sources: FundingSource[],
  aliases: AppSettings["fundingSourceAliases"],
  /** Optional map of payroll chartstring → MyPortfolio project nickname/title */
  portfolioTitlesByChartstring?: Map<string, string>
): FundingSource[] {
  return sources.map((s) => {
    const a = getAliasEntry(aliases, s);
    const portfolioTitle = s.accountString
      ? portfolioTitlesByChartstring?.get(s.accountString)
      : undefined;
    const alias = resolveDisplayAlias(s, a?.alias, portfolioTitle);
    return {
      ...s,
      alias,
      notes: a?.notes,
    };
  });
}
