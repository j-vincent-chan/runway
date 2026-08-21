import type { EmployeeRunwaySummary } from "@/lib/runway/calculate";
import { compareEmployeesByLastName } from "@/lib/employees/lastName";
import type { AppSettings } from "@/types";

export type RunwayEmployeeSortKey = "alphabetical" | "runway";

/** Worst runway first (deficits, then shortest remaining). */
export const RUNWAY_EMPLOYEE_SORT_OPTIONS: { value: RunwayEmployeeSortKey; label: string }[] = [
  { value: "runway", label: "Urgency" },
  { value: "alphabetical", label: "Last name" },
];

const STORAGE_KEY = "ledger.runwayEmployeeSort";

function normalizeStoredSort(raw: string | null): RunwayEmployeeSortKey {
  if (raw === "runway" || raw === "runway-asc") return "runway";
  if (raw === "alphabetical" || raw === "name" || raw === "personnelGroup") return "alphabetical";
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
  void settings;
  if (sortKey === "runway") {
    const diff = runwaySortRank(a.blendedMonthsRunway) - runwaySortRank(b.blendedMonthsRunway);
    return diff !== 0 ? diff : compareName(a, b);
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
