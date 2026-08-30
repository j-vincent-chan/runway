import type { ProjectionResult } from "@/lib/projections/simulate";
import { chartstringFundDeptProject, normalizeChartstring } from "@/lib/funding/chartstring";

/** Account identity for depletion: fund-dept-project, the level a balance lives at. */
export function depletionRootOf(chartstringKey: string): string {
  return chartstringFundDeptProject(chartstringKey) ?? normalizeChartstring(chartstringKey);
}

/**
 * The first projected month an account's balance reaches zero, or null when it
 * holds through the whole window.
 *
 * One definition, shared by the Dashboard's depletion chart and the Projections
 * grid. Both run the same `simulateProjections`, so both were free to derive
 * this independently and drift; reading it from here means a distribution
 * changed on Projections moves the runs-dry month on Runway by the same
 * arithmetic, not by a parallel one that happens to agree today.
 *
 * Recomputes with the projection it is given: the burn behind each month comes
 * from that month's own allocations, so dropping someone from 35% to 20% pushes
 * the date out without anything here needing to know a rule fired.
 */
export function depletionMonthIndexForRoot(
  result: ProjectionResult,
  chartRoot: string
): number | null {
  /**
   * Absence is not depletion. Defaulting a missing root to 0 made any account
   * the projection does not track — a typo'd key, or one filtered out of this
   * run — report as empty in its opening month, which is a far louder claim
   * than "no data".
   */
  const idx = result.states.findIndex(
    (s) => chartRoot in s.remainingByRoot && s.remainingByRoot[chartRoot]! <= 0
  );
  return idx === -1 ? null : idx;
}

/** Every account in the projection, keyed by root, with the month index it empties. */
export function depletionMonthByRoot(result: ProjectionResult): Map<string, number | null> {
  const roots = new Set<string>();
  for (const state of result.states) {
    for (const root of Object.keys(state.remainingByRoot)) roots.add(root);
  }
  return new Map(
    [...roots].map((root) => [root, depletionMonthIndexForRoot(result, root)] as const)
  );
}
