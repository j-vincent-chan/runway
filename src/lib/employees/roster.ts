import type { AppSettings, Employee, PayrollReportSnapshot } from "@/types";
import { withoutHiddenFundsForEmployee } from "@/lib/funding/visibility";
import { pruneEmployeeFromOrgStructure } from "@/lib/org/structure";
import { deleteOfferLetterFile } from "@/lib/storage/offerLetterStore";
import { employeePersonKey, resolveEmployeeProfile } from "@/lib/employees/stableKey";

export function getEmployeePhotoUrl(
  settings: AppSettings,
  employeeId: string
): string | undefined {
  return settings.employeeProfiles?.[employeeId]?.photoUrl?.trim() || undefined;
}

/** Preferred photo lookup when the Employee record is available (stable key aware). */
export function getEmployeePhotoUrlFor(
  settings: AppSettings,
  emp: Pick<Employee, "id" | "employeeId" | "name">
): string | undefined {
  return resolveEmployeeProfile(settings, emp)?.photoUrl?.trim() || undefined;
}

export { employeePersonKey };

export function isEmployeeHidden(settings: AppSettings, employeeId: string): boolean {
  return (settings.hiddenEmployeeIds ?? []).includes(employeeId);
}

export function isEmployeeAlumni(settings: AppSettings, employeeId: string): boolean {
  return (settings.alumniEmployeeIds ?? []).includes(employeeId);
}

export function countHiddenEmployees(settings: AppSettings): number {
  return (settings.hiddenEmployeeIds ?? []).length;
}

export function countAlumniEmployees(settings: AppSettings): number {
  return (settings.alumniEmployeeIds ?? []).length;
}

/** Active roster for timeline, runway, and analytics (excludes hidden and alumni). */
export function filterEmployeesForPlanning(
  employees: Employee[],
  settings: AppSettings
): Employee[] {
  return employees.filter(
    (emp) => !isEmployeeAlumni(settings, emp.id) && !isEmployeeHidden(settings, emp.id)
  );
}

export type EmployeesPageView = "active" | "alumni";

export function filterEmployeesForEmployeesPage(
  employees: Employee[],
  settings: AppSettings,
  view: EmployeesPageView,
  showHidden: boolean
): Employee[] {
  return employees
    .filter((emp) => {
      const alumni = isEmployeeAlumni(settings, emp.id);
      const hidden = isEmployeeHidden(settings, emp.id);
      if (view === "alumni") return alumni;
      if (alumni) return false;
      if (hidden && !showHidden) return false;
      return true;
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function pruneEmployeeFromSettings(
  settings: AppSettings,
  employeeId: string
): AppSettings {
  const hiddenEmployeeIds = (settings.hiddenEmployeeIds ?? []).filter((id) => id !== employeeId);
  const alumniEmployeeIds = (settings.alumniEmployeeIds ?? []).filter((id) => id !== employeeId);
  const employeeProfiles = { ...(settings.employeeProfiles ?? {}) };
  delete employeeProfiles[employeeId];
  void deleteOfferLetterFile(employeeId).catch(() => undefined);

  const employeePlanningScope = { ...(settings.employeePlanningScope ?? {}) };
  delete employeePlanningScope[employeeId];

  const employeePersonnelTypes = { ...(settings.employeePersonnelTypes ?? {}) };
  delete employeePersonnelTypes[employeeId];

  const hiddenEmployeeFunds = withoutHiddenFundsForEmployee(
    settings.hiddenEmployeeFunds ?? [],
    employeeId
  );

  const runwayBalanceOverrides = { ...(settings.runwayBalanceOverrides ?? {}) };
  for (const key of Object.keys(runwayBalanceOverrides)) {
    if (key.startsWith(`${employeeId}|`)) delete runwayBalanceOverrides[key];
  }

  const runwayBurnOverrides = { ...(settings.runwayBurnOverrides ?? {}) };
  for (const key of Object.keys(runwayBurnOverrides)) {
    if (key.startsWith(`${employeeId}|`)) delete runwayBurnOverrides[key];
  }

  return {
    ...settings,
    hiddenEmployeeIds,
    alumniEmployeeIds,
    employeeProfiles,
    employeePlanningScope,
    employeePersonnelTypes,
    hiddenEmployeeFunds,
    runwayBalanceOverrides,
    runwayBurnOverrides,
    orgStructure: pruneEmployeeFromOrgStructure(settings.orgStructure, employeeId),
  };
}

export function removeEmployeeFromSnapshot(
  snapshot: PayrollReportSnapshot,
  employeeId: string
): PayrollReportSnapshot {
  return {
    ...snapshot,
    employees: snapshot.employees.filter((e) => e.id !== employeeId),
    monthlyAllocations: snapshot.monthlyAllocations.filter((a) => a.employeeId !== employeeId),
    monthlyCosts: snapshot.monthlyCosts.filter((c) => c.employeeId !== employeeId),
    rawRows: snapshot.rawRows.filter((r) => r.employeeId !== employeeId),
  };
}

export function employeeInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] ?? ""}${parts[parts.length - 1][0] ?? ""}`.toUpperCase();
}
