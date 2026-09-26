import type { Employee, FundingSource, MonthlyAllocation, PayrollReportSnapshot } from "@/types";
import type { AppSettings } from "@/types";
import { calculateMonthlyCost, getCurrentMonth } from "@/lib/calculations";
import { isEmployeeFundHidden } from "@/lib/funding/visibility";
import { employeePersonKey } from "@/lib/employees/stableKey";
import { fundingSourceKey } from "@/lib/funding/sourceKey";
import { hasPercentEffort } from "@/lib/utils/parse";

/**
 * Funding sources to show for an employee on the timeline.
 * Includes accounts with non-zero effort (including reversals) in a visible month.
 */
export function getTimelineFundingSources(
  employee: Employee,
  allocations: MonthlyAllocation[],
  fundingSources: FundingSource[],
  visibleMonths: string[],
  settings: AppSettings,
  options: { revealHidden: boolean }
): FundingSource[] {
  const employeeId = employee.id;
  const monthSet = new Set(visibleMonths);
  const fsMap = new Map(fundingSources.map((f) => [f.id, f]));
  const sourceIds = new Set<string>();

  for (const a of allocations) {
    if (a.employeeId !== employeeId || !hasPercentEffort(a.percentEffort)) continue;
    if (!monthSet.has(a.month)) continue;
    sourceIds.add(a.fundingSourceId);
  }

  if (options.revealHidden) {
    const employeeKey = employeePersonKey(employee);
    const fundKeyToId = new Map(fundingSources.map((f) => [fundingSourceKey(f), f.id]));
    for (const key of settings.hiddenEmployeeFunds ?? []) {
      const sep = key.indexOf("|");
      if (sep === -1) continue;
      const eKey = key.slice(0, sep);
      const fKey = key.slice(sep + 1);
      if (eKey !== employeeKey) continue;
      const fsid = fundKeyToId.get(fKey);
      if (fsid) sourceIds.add(fsid);
    }
  }

  return [...sourceIds]
    .map((id) => fsMap.get(id))
    .filter((f): f is FundingSource => !!f)
    .filter((f) => !isEmployeeFundHidden(settings, employee, f) || options.revealHidden)
    .sort((a, b) => a.alias.localeCompare(b.alias));
}

/** Account has payroll activity in a given month (non-zero % or $). */
export function isAccountActiveInMonth(
  employeeId: string,
  fundingSourceId: string,
  month: string,
  snapshot: PayrollReportSnapshot,
  allocations: MonthlyAllocation[]
): boolean {
  const alloc = allocations.find(
    (a) =>
      a.employeeId === employeeId &&
      a.fundingSourceId === fundingSourceId &&
      a.month === month
  );
  if (alloc && hasPercentEffort(alloc.percentEffort)) return true;

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
  if (directSalary !== 0) return true;

  if (!alloc || !hasPercentEffort(alloc.percentEffort)) return false;
  const monthlyTotal = calculateMonthlyCost(employeeId, month, costs).total;
  return monthlyTotal * (alloc.percentEffort / 100) !== 0;
}

/** Runway rows: active in current month only; same hide/reveal rules as timeline. */
export function getRunwayFundingSources(
  employee: Employee,
  allocations: MonthlyAllocation[],
  fundingSources: FundingSource[],
  snapshot: PayrollReportSnapshot,
  settings: AppSettings,
  options: { revealHidden: boolean }
): FundingSource[] {
  const employeeId = employee.id;
  const currentMonth = getCurrentMonth(snapshot);
  const fsMap = new Map(fundingSources.map((f) => [f.id, f]));
  const sourceIds = new Set<string>();

  for (const fs of fundingSources) {
    if (isAccountActiveInMonth(employeeId, fs.id, currentMonth, snapshot, allocations)) {
      sourceIds.add(fs.id);
    }
  }

  if (options.revealHidden) {
    const employeeKey = employeePersonKey(employee);
    const fundKeyToId = new Map(fundingSources.map((f) => [fundingSourceKey(f), f.id]));
    for (const key of settings.hiddenEmployeeFunds ?? []) {
      const sep = key.indexOf("|");
      if (sep === -1) continue;
      const eKey = key.slice(0, sep);
      const fKey = key.slice(sep + 1);
      if (eKey !== employeeKey) continue;
      const fsid = fundKeyToId.get(fKey);
      if (fsid && isAccountActiveInMonth(employeeId, fsid, currentMonth, snapshot, allocations)) {
        sourceIds.add(fsid);
      }
    }
  }

  return [...sourceIds]
    .map((id) => fsMap.get(id))
    .filter((f): f is FundingSource => !!f)
    .filter((f) => !isEmployeeFundHidden(settings, employee, f) || options.revealHidden)
    .sort((a, b) => a.alias.localeCompare(b.alias));
}
