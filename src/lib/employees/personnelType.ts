import type { AppSettings, PersonnelGroupDef, PersonnelType } from "@/types";
import { DEFAULT_PERSONNEL_GROUPS } from "@/lib/catalog/defaults";
import { compareEmployeesByLastName } from "@/lib/employees/lastName";

/** @deprecated Prefer getPersonnelGroups(settings) — kept for older imports */
export const PERSONNEL_TYPES = DEFAULT_PERSONNEL_GROUPS.map((g) => ({
  value: g.id as PersonnelType,
  label: g.label,
  shortLabel: g.shortLabel,
  pillClass: g.pillClass,
  dotClass: g.dotClass,
}));

export function getPersonnelGroups(settings: AppSettings): PersonnelGroupDef[] {
  const groups = settings.personnelGroups ?? [];
  if (groups.length === 0) return DEFAULT_PERSONNEL_GROUPS;
  return [...groups].sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label));
}

export function getPersonnelTypeDisplayLabel(
  value: PersonnelType,
  settings?: AppSettings
): string {
  const meta = getPersonnelTypeMeta(value, settings);
  return meta.shortLabel ?? meta.label;
}

export function getPersonnelTypeMeta(value: PersonnelType, settings?: AppSettings) {
  const groups = settings ? getPersonnelGroups(settings) : DEFAULT_PERSONNEL_GROUPS;
  const found = groups.find((t) => t.id === value);
  if (found) {
    return {
      value: found.id,
      label: found.label,
      shortLabel: found.shortLabel,
      pillClass: found.pillClass,
      dotClass: found.dotClass,
      chartColor: found.chartColor,
    };
  }
  return {
    value,
    label: value,
    shortLabel: value,
    pillClass: "bg-slate-200 text-slate-700 ring-1 ring-slate-200/50",
    dotClass: "bg-slate-500",
    chartColor: "#64748b",
  };
}

export function getEmployeePersonnelType(
  settings: AppSettings,
  employeeId: string
): PersonnelType | undefined {
  return settings.employeePersonnelTypes?.[employeeId];
}

export function ensurePersonnelGroups(settings: AppSettings): AppSettings {
  if ((settings.personnelGroups?.length ?? 0) > 0) return settings;
  return { ...settings, personnelGroups: DEFAULT_PERSONNEL_GROUPS };
}

export type EmployeeSortGroup = {
  key: string;
  label: string;
  employees: { id: string; name: string }[];
};

/** Order employees by last name (personnel group filtering is separate). */
export function sortEmployeesForPlanning<T extends { id: string; name: string }>(
  employees: T[],
  settings: AppSettings
): T[] {
  void settings;
  return [...employees].sort(compareEmployeesByLastName);
}

/**
 * When `personnelGroupFilter` is empty/undefined, returns all employees.
 * Otherwise keeps employees whose group is in the selection (`unassigned` for none).
 */
export function filterEmployeesByPersonnelGroups<T extends { id: string }>(
  employees: T[],
  settings: AppSettings
): T[] {
  const filter = settings.personnelGroupFilter;
  if (!filter || filter.length === 0) return employees;
  const selected = new Set(filter);
  return employees.filter((emp) => {
    const type = getEmployeePersonnelType(settings, emp.id);
    if (type == null || type === "") return selected.has("unassigned");
    return selected.has(type);
  });
}

export function groupEmployeesByPersonnelGroup<T extends { id: string; name: string }>(
  employees: T[],
  settings: AppSettings
): EmployeeSortGroup[] {
  const sorted = sortEmployeesForPlanning(employees, settings);
  const filter = settings.personnelGroupFilter;
  if (!filter || filter.length === 0) {
    return [{ key: "all", label: "Alphabetical (last name)", employees: sorted }];
  }
  const groups = getPersonnelGroups(settings);
  const buckets = new Map<string, T[]>();
  for (const g of groups) buckets.set(g.id, []);
  buckets.set("unassigned", []);
  for (const emp of sorted) {
    const t = getEmployeePersonnelType(settings, emp.id);
    if (t && buckets.has(t)) buckets.get(t)!.push(emp);
    else buckets.get("unassigned")!.push(emp);
  }
  const selected = new Set(filter);
  const result: EmployeeSortGroup[] = [];
  for (const g of groups) {
    if (!selected.has(g.id)) continue;
    const list = buckets.get(g.id) ?? [];
    if (list.length > 0) result.push({ key: g.id, label: g.label, employees: list });
  }
  if (selected.has("unassigned")) {
    const unassigned = buckets.get("unassigned") ?? [];
    if (unassigned.length > 0) {
      result.push({ key: "unassigned", label: "Unassigned", employees: unassigned });
    }
  }
  return result;
}
