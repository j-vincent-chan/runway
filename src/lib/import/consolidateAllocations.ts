import type { MonthlyAllocation } from "@/types";
import { hasPercentEffort } from "@/lib/utils/parse";

/** Merge duplicate employee+source+month rows (e.g. old X/Y double-parse). */
export function consolidateAllocations(allocations: MonthlyAllocation[]): MonthlyAllocation[] {
  const map = new Map<string, MonthlyAllocation>();
  for (const a of allocations) {
    const key = `${a.employeeId}|${a.fundingSourceId}|${a.month}`;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, { ...a });
      continue;
    }
    existing.percentEffort += a.percentEffort;
    if (a.status === "edited") existing.status = "edited";
  }
  return [...map.values()].filter((a) => hasPercentEffort(a.percentEffort));
}
