import type { Employee, MonthlyAllocation, PayrollReportSnapshot } from "@/types";

/** Employees with any allocation row on this funding source (payroll report). */
export function getEmployeesOnFundingSource(
  fundingSourceId: string,
  snapshot: PayrollReportSnapshot,
  allocations: MonthlyAllocation[]
): Employee[] {
  const ids = new Set<string>();
  for (const a of allocations) {
    if (a.fundingSourceId === fundingSourceId) ids.add(a.employeeId);
  }
  const byId = new Map(snapshot.employees.map((e) => [e.id, e]));
  return [...ids]
    .map((id) => byId.get(id))
    .filter((e): e is Employee => !!e)
    .sort((a, b) => a.name.localeCompare(b.name));
}
