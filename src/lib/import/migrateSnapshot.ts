import type { PayrollReportSnapshot, WorkingPlan } from "@/types";
import { PARSER_VERSION } from "@/types";
import { consolidateAllocations } from "@/lib/import/consolidateAllocations";

export function migrateSnapshotIfNeeded(
  snapshot: PayrollReportSnapshot,
  workingPlan: WorkingPlan | null
): { snapshot: PayrollReportSnapshot; workingPlan: WorkingPlan | null; migrated: boolean } {
  if (snapshot.parserVersion === PARSER_VERSION) {
    return { snapshot, workingPlan, migrated: false };
  }

  const monthlyAllocations = consolidateAllocations(snapshot.monthlyAllocations);
  const nextSnapshot: PayrollReportSnapshot = {
    ...snapshot,
    monthlyAllocations,
    parserVersion: PARSER_VERSION,
  };

  const nextPlan: WorkingPlan = {
    snapshotId: snapshot.id,
    allocations: monthlyAllocations.map((a) => ({ ...a })),
    updatedAt: new Date().toISOString(),
  };

  return {
    snapshot: nextSnapshot,
    workingPlan: nextPlan,
    migrated: true,
  };
}
