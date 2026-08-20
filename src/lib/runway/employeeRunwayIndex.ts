import type { AppSettings, PayrollReportSnapshot, WorkingPlan } from "@/types";
import type { FundingSource } from "@/types";
import type { MergedPortfolioBalance } from "@/lib/portfolio/mergeBalances";
import { buildSharedAccountBurnIndex, computeEmployeeRunway } from "@/lib/runway/calculate";

export function buildEmployeeBlendedRunwayMap(
  snapshot: PayrollReportSnapshot,
  workingPlan: WorkingPlan | null,
  fundingSources: FundingSource[],
  settings: AppSettings,
  mergedPortfolioBalances: Map<string, MergedPortfolioBalance>
): Map<string, number | null> {
  const sharedBurnIndex = buildSharedAccountBurnIndex(
    snapshot,
    workingPlan,
    fundingSources,
    settings
  );
  const map = new Map<string, number | null>();
  for (const emp of snapshot.employees) {
    const summary = computeEmployeeRunway(
      emp,
      snapshot,
      workingPlan,
      fundingSources,
      settings,
      mergedPortfolioBalances,
      sharedBurnIndex,
      { revealHidden: false }
    );
    const hasIncluded = summary.accounts.some((a) => !a.isHidden && !a.isAssumedOk);
    map.set(emp.id, hasIncluded ? summary.blendedMonthsRunway : null);
  }
  return map;
}
