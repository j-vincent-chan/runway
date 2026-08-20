import type { AppSettings, Employee, EmployeeProfile } from "@/types";
import { resolveEmployeeProfile } from "@/lib/employees/stableKey";

export function getEmployeeProfile(
  settings: AppSettings,
  employeeId: string,
  emp?: Pick<Employee, "id" | "employeeId" | "name">
): EmployeeProfile | undefined {
  if (emp) return resolveEmployeeProfile(settings, emp);
  return settings.employeeProfiles?.[employeeId];
}

export function getEmployeeStartDate(
  settings: AppSettings,
  employeeId: string,
  emp?: Pick<Employee, "id" | "employeeId" | "name">
): string | undefined {
  return getEmployeeProfile(settings, employeeId, emp)?.startDate?.trim() || undefined;
}

export function getEmployeeEndDate(
  settings: AppSettings,
  employeeId: string,
  emp?: Pick<Employee, "id" | "employeeId" | "name">
): string | undefined {
  return getEmployeeProfile(settings, employeeId, emp)?.endDate?.trim() || undefined;
}

/** Normalize yyyy-MM-dd (or yyyy-MM) to payroll month key yyyy-MM. */
export function employmentMonthKey(iso: string | undefined): string | undefined {
  if (!iso?.trim()) return undefined;
  const trimmed = iso.trim();
  if (trimmed.length >= 7) return trimmed.slice(0, 7);
  return undefined;
}

export function employeeHasEmploymentDates(settings: AppSettings, employeeId: string): boolean {
  return Boolean(
    employmentMonthKey(getEmployeeStartDate(settings, employeeId)) ||
      employmentMonthKey(getEmployeeEndDate(settings, employeeId))
  );
}

/** Whether the employee is on roster for this calendar month per start/end dates on Employees. */
export function isEmployeeEmployedInMonth(
  settings: AppSettings,
  employeeId: string,
  month: string
): boolean {
  const start = employmentMonthKey(getEmployeeStartDate(settings, employeeId));
  const end = employmentMonthKey(getEmployeeEndDate(settings, employeeId));
  if (start && month < start) return false;
  if (end && month > end) return false;
  return true;
}

export function formatEmploymentDate(iso: string | undefined): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  const date = new Date(y, m - 1, d);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}
