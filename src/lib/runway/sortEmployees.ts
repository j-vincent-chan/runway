import type { EmployeeRunwaySummary } from "@/lib/runway/calculate";
import { compareEmployeesByLastName } from "@/lib/employees/lastName";
import { getEmployeePersonnelType, getPersonnelGroups } from "@/lib/employees/personnelType";
import type { AppSettings } from "@/types";

export type RunwayEmployeeSortKey = "alphabetical" | "runway" | "personnelGroup";

/** Worst runway first (deficits, then shortest remaining). */
export const RUNWAY_EMPLOYEE_SORT_OPTIONS: { value: RunwayEmployeeSortKey; label: string }[] = [
  { value: "runway", label: "Urgency" },
  { value: "alphabetical", label: "Last name" },
  { value: "personnelGroup", label: "Personnel groups" },
];

const STORAGE_KEY = "ledger.runwayEmployeeSort";

function normalizeStoredSort(raw: string | null): RunwayEmployeeSortKey {
  if (raw === "runway" || raw === "runway-asc") return "runway";
  if (raw === "alphabetical" || raw === "name") return "alphabetical";
  if (raw === "personnelGroup") return "personnelGroup";
  return "runway";
}

export function loadRunwayEmployeeSort(): RunwayEmployeeSortKey {
  if (typeof window === "undefined") return "runway";
  try {
    return normalizeStoredSort(sessionStorage.getItem(STORAGE_KEY));
  } catch {
    return "runway";
  }
}

export function saveRunwayEmployeeSort(key: RunwayEmployeeSortKey): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, key);
  } catch {
    /* ignore */
  }
}

function compareName(a: EmployeeRunwaySummary, b: EmployeeRunwaySummary): number {
  return compareEmployeesByLastName(a.employee, b.employee);
}

/** Lower rank = appears earlier when sorting worst-first. */
function runwaySortRank(months: number | null): number {
  if (months === null) return Number.POSITIVE_INFINITY;
  return months;
}

export function compareEmployeeRunwaySummaries(
  a: EmployeeRunwaySummary,
  b: EmployeeRunwaySummary,
  sortKey: RunwayEmployeeSortKey,
  settings?: AppSettings
): number {
  if (sortKey === "runway") {
    const diff = runwaySortRank(a.blendedMonthsRunway) - runwaySortRank(b.blendedMonthsRunway);
    return diff !== 0 ? diff : compareName(a, b);
  }
  if (sortKey === "personnelGroup" && settings) {
    const groups = getPersonnelGroups(settings);
    const order = new Map(groups.map((g, i) => [g.id, i]));
    const ga = getEmployeePersonnelType(settings, a.employee.id);
    const gb = getEmployeePersonnelType(settings, b.employee.id);
    const ia = ga != null && order.has(ga) ? order.get(ga)! : 9999;
    const ib = gb != null && order.has(gb) ? order.get(gb)! : 9999;
    if (ia !== ib) return ia - ib;
    return compareName(a, b);
  }
  return compareName(a, b);
}

export function sortEmployeeRunwaySummaries(
  summaries: EmployeeRunwaySummary[],
  sortKey: RunwayEmployeeSortKey,
  settings?: AppSettings
): EmployeeRunwaySummary[] {
  return [...summaries].sort((a, b) =>
    compareEmployeeRunwaySummaries(a, b, sortKey, settings)
  );
}
