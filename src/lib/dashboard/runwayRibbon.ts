import { simulateProjections } from "@/lib/projections/simulate";
import { chartstringKeyForFundingSource, projectionSourceLabel } from "@/lib/projections/sources";
import { chartstringFundDeptProject, normalizeChartstring } from "@/lib/funding/chartstring";
import { getEmployeeEndDate } from "@/lib/employees/profile";
import { employeePersonKey } from "@/lib/employees/stableKey";
import { filterEmployeesForPlanning } from "@/lib/employees/roster";
import { getAllocations, getCurrentMonth } from "@/lib/calculations";
import { addMonthsYm, getProjectionOriginMonth } from "@/lib/projections/horizon";
import type { AppSettings, PayrollReportSnapshot, ProjectionHorizonPreset, WorkingPlan } from "@/types";
import type { AccountBalance } from "@/lib/funding/accountBalances";

/** Fallback when no scope is passed; the Dashboard always passes its own. */
export const RIBBON_HORIZON_MONTHS = 24;
/** Uncertainty hatch begins here — a fixed threshold, not a fitted confidence cone (no variance model exists to derive one). */
const UNCERTAINTY_START_MONTH_INDEX = 6;
/** Rows shown before truncating, matching the attention queue's cap. */
const MARKER_CAP = 5;

function rootOf(key: string): string {
  return chartstringFundDeptProject(key) ?? normalizeChartstring(key);
}

export interface RibbonBand {
  chartRoot: string;
  label: string;
  /** One value per month, aligned to RunwayRibbon.months. */
  values: number[];
  /** First month index this band's balance reaches zero or below, else null. */
  depletionMonthIndex: number | null;
  /** True when a currently active employee has non-zero effort charged here this planning month. */
  hasCurrentPersonnel: boolean;
  /** Accounts summed into this band — set only on the "other accounts" aggregate. */
  memberCount?: number;
  /** How many of those run dry inside the window. */
  depletedMemberCount?: number;
}

export interface RibbonMarker {
  monthIndex: number;
  month: string;
  employeeName: string;
  description: string;
}

export interface RunwayRibbon {
  months: string[];
  /** Sorted by current (month 0) balance, descending. */
  bands: RibbonBand[];
  totalByMonth: number[];
  /** First month index the total crosses zero, else null. */
  terminalIndex: number | null;
  markers: RibbonMarker[];
  hiddenMarkerCount: number;
  uncertaintyStartIndex: number;
  /** True when a band opens at an assumed end date's estimate, not a real balance. */
  hasEstimatedOpening: boolean;
}

/**
 * Funding-end markers, built to match exactly what simulateProjections itself
 * enforces (same rule precedence as its internal employmentEndMonth) — never
 * shows a date the simulation doesn't honor.
 */
export function buildMarkers(
  snapshot: PayrollReportSnapshot,
  settings: AppSettings,
  months: string[]
): { markers: RibbonMarker[]; hiddenMarkerCount: number } {
  const monthIndex = new Map(months.map((m, i) => [m, i]));
  const employees = filterEmployeesForPlanning(snapshot.employees, settings);
  const rules = settings.projectionRules ?? [];
  const ignoreRosterEndDates = new Set(settings.projectionIgnoreRosterEndDates ?? []);

  const all: RibbonMarker[] = [];

  for (const emp of employees) {
    const personKey = employeePersonKey(emp);

    const explicit = rules.find(
      (r) => r.personKey === personKey && !r.chartstringKey && r.trigger.type === "onDate"
    );
    let month: string | undefined;
    if (explicit && explicit.trigger.type === "onDate") {
      month = explicit.trigger.month;
    } else if (!ignoreRosterEndDates.has(personKey)) {
      const end = getEmployeeEndDate(settings, emp.id, emp);
      month = end ? end.slice(0, 7) : undefined;
    }
    const idx = month ? monthIndex.get(month) : undefined;
    if (month && idx !== undefined) {
      all.push({ monthIndex: idx, month, employeeName: emp.name, description: "Employment ends" });
    }

    for (const rule of rules) {
      if (rule.personKey !== personKey || !rule.chartstringKey) continue;
      if (rule.trigger.type !== "onDate") continue;
      const ruleIdx = monthIndex.get(rule.trigger.month);
      if (ruleIdx === undefined) continue;
      all.push({
        monthIndex: ruleIdx,
        month: rule.trigger.month,
        employeeName: emp.name,
        description: "Funding ends",
      });
    }
  }

  all.sort((a, b) => a.monthIndex - b.monthIndex);
  return {
    markers: all.slice(0, MARKER_CAP),
    hiddenMarkerCount: Math.max(0, all.length - MARKER_CAP),
  };
}

/**
 * Roots with at least one currently active employee charging non-zero effort
 * to them this planning month — the "current personnel" scope the ribbon
 * defaults to. Matches buildRunwayContext's own roster filter, so a person
 * counted here is a person the rest of the dashboard also treats as current.
 */
function currentPersonnelRoots(
  snapshot: PayrollReportSnapshot,
  workingPlan: WorkingPlan | null,
  settings: AppSettings
): Set<string> {
  const planningMonth = getCurrentMonth(snapshot);
  const activeEmployeeIds = new Set(
    filterEmployeesForPlanning(snapshot.employees, settings).map((e) => e.id)
  );
  const fundingSourceById = new Map(snapshot.fundingSources.map((fs) => [fs.id, fs]));

  const roots = new Set<string>();
  for (const a of getAllocations(snapshot, workingPlan)) {
    if (a.month !== planningMonth) continue;
    if (a.percentEffort <= 0) continue;
    if (!activeEmployeeIds.has(a.employeeId)) continue;
    const source = fundingSourceById.get(a.fundingSourceId);
    if (!source) continue;
    roots.add(rootOf(chartstringKeyForFundingSource(source)));
  }
  return roots;
}

/** Sum of the given bands per month, and the first index the sum crosses zero. Plain aggregation, not a new derivation. */
export function ribbonTotals(
  bands: RibbonBand[],
  monthCount: number
): { totalByMonth: number[]; terminalIndex: number | null } {
  const totalByMonth = Array.from({ length: monthCount }, (_, i) =>
    bands.reduce((sum, band) => sum + (band.values[i] ?? 0), 0)
  );
  const terminalIdx = totalByMonth.findIndex((v) => v <= 0);
  return { totalByMonth, terminalIndex: terminalIdx === -1 ? null : terminalIdx };
}

/**
 * Two accounts that differ only by department resolve to the same display
 * alias — 5020-801025-1111111 and 5020-801026-1111111 both read
 * "Fund 5020 · 1111111". Once bands are labelled directly on the chart those
 * land side by side, and one name for two accounts is unreadable.
 *
 * Colliding members fall back to their own fund-dept-project code, which is
 * unique by construction and *shorter* than the alias plus a qualifier — a
 * longer label would only be truncated back into the same collision. This is
 * the form the attention queue already shows accounts in.
 *
 * Scoped to this chart on purpose: projectionSourceLabel is shared with
 * Projections and Runway, so widening the alias itself is a separate call.
 */
function disambiguateLabels(labelByRoot: Map<string, string>): void {
  const rootsByLabel = new Map<string, string[]>();
  for (const [root, label] of labelByRoot) {
    rootsByLabel.set(label, [...(rootsByLabel.get(label) ?? []), root]);
  }
  for (const [, roots] of rootsByLabel) {
    if (roots.length < 2) continue;
    for (const root of roots) labelByRoot.set(root, root);
  }
}

/** Named bands before the rest collapse into one. */
export const RIBBON_BAND_CAP = 5;
/** chartRoot of the aggregate band; never a real fund-dept-project. */
export const RIBBON_OTHER_ROOT = "__other";

/**
 * The `cap` accounts that run dry soonest, plus one band summing the rest.
 *
 * Rendering every account defeated the chart: 33 of them meant a 66-series
 * stack whose opacity ramp stepped ~0.01 between neighbours, so no band could
 * be told from the next and the legend degenerated into a run-on list. Six
 * bands make both the ramp and direct end-labelling work.
 *
 * Pure reshaping — values are summed, never recomputed, so ribbonTotals and
 * terminalIndex are unchanged by collapsing.
 */
export function collapseBands(bands: RibbonBand[], cap = RIBBON_BAND_CAP): RibbonBand[] {
  if (bands.length <= cap + 1) return bands;

  const ranked = [...bands].sort((a, b) => {
    // Soonest to deplete first; accounts that never run dry rank last.
    const aIdx = a.depletionMonthIndex ?? Number.POSITIVE_INFINITY;
    const bIdx = b.depletionMonthIndex ?? Number.POSITIVE_INFINITY;
    if (aIdx !== bIdx) return aIdx - bIdx;
    return (b.values[0] ?? 0) - (a.values[0] ?? 0);
  });

  const named = ranked.slice(0, cap);
  const rest = ranked.slice(cap);
  const monthCount = bands[0]?.values.length ?? 0;

  const other: RibbonBand = {
    chartRoot: RIBBON_OTHER_ROOT,
    label: `${rest.length} other accounts`,
    values: Array.from({ length: monthCount }, (_, i) =>
      rest.reduce((sum, b) => sum + (b.values[i] ?? 0), 0)
    ),
    // The aggregate depletes only when every account inside it has: a summed
    // balance stays positive while individual accounts inside it run dry.
    depletionMonthIndex: rest.every((b) => b.depletionMonthIndex !== null)
      ? Math.max(...rest.map((b) => b.depletionMonthIndex!))
      : null,
    hasCurrentPersonnel: rest.some((b) => b.hasCurrentPersonnel),
    /**
     * Which is why the counts travel with it. Reporting only the summed band's
     * date let the legend say "30 other accounts hold past July 2027" directly
     * beneath a header saying 23 of 35 accounts run dry — both drawn from this
     * same list, and irreconcilable to a reader.
     */
    memberCount: rest.length,
    depletedMemberCount: rest.filter((b) => b.depletionMonthIndex !== null).length,
  };

  return [...named, other];
}

/**
 * Stacked per-account depletion across the Dashboard's selected scope. Reuses
 * simulateProjections (the only canonical month-by-month forward-projection
 * engine — never re-derives burn/effort/reassignment math) and just shapes
 * its remainingByRoot output into bands.
 */
export function buildRunwayRibbon({
  snapshot,
  workingPlan,
  settings,
  balances,
  horizonMonths = RIBBON_HORIZON_MONTHS,
  now,
}: {
  snapshot: PayrollReportSnapshot;
  workingPlan: WorkingPlan | null;
  settings: AppSettings;
  balances: Map<string, AccountBalance>;
  /** Months forward to project, from the Dashboard's scope control. */
  horizonMonths?: number;
  now?: Date;
}): RunwayRibbon {
  /**
   * "custom" with an explicit end month, never `String(horizonMonths)` cast to
   * a preset: the preset union has no "48" (nor "36"), and
   * resolveHorizonMonths has no default branch, so an unrecognized preset
   * silently yields 12 months. buildPersonnelCostTrend does the same.
   */
  const origin = getProjectionOriginMonth(now);
  const fixedHorizonSettings: AppSettings = {
    ...settings,
    projectionHorizon: {
      preset: "custom" as ProjectionHorizonPreset,
      customEndMonth: addMonthsYm(origin, Math.max(horizonMonths, 1) - 1),
    },
  };
  const result = simulateProjections({
    snapshot,
    workingPlan,
    settings: fixedHorizonSettings,
    balances,
    now,
  });

  const months = result.months;

  const roots = new Set<string>();
  for (const state of result.states) {
    for (const root of Object.keys(state.remainingByRoot)) roots.add(root);
  }

  const labelByRoot = new Map<string, string>();
  for (const fs of result.sources) {
    const root = rootOf(chartstringKeyForFundingSource(fs));
    if (!labelByRoot.has(root)) {
      labelByRoot.set(root, projectionSourceLabel(fs, settings));
    }
  }
  disambiguateLabels(labelByRoot);

  const currentRoots = currentPersonnelRoots(snapshot, workingPlan, settings);

  const bands: RibbonBand[] = [...roots].map((chartRoot) => {
    const values = result.states.map((s) => s.remainingByRoot[chartRoot] ?? 0);
    const depletionIdx = values.findIndex((v) => v <= 0);
    return {
      chartRoot,
      label: labelByRoot.get(chartRoot) ?? chartRoot,
      values,
      depletionMonthIndex: depletionIdx === -1 ? null : depletionIdx,
      hasCurrentPersonnel: currentRoots.has(chartRoot),
    };
  });
  bands.sort((a, b) => (b.values[0] ?? 0) - (a.values[0] ?? 0));

  const { totalByMonth, terminalIndex } = ribbonTotals(bands, months.length);

  const { markers, hiddenMarkerCount } = buildMarkers(snapshot, settings, months);

  return {
    months,
    bands,
    totalByMonth,
    terminalIndex,
    markers,
    hiddenMarkerCount,
    hasEstimatedOpening: (settings.runwayAssumedOkFunds ?? []).length > 0,
    uncertaintyStartIndex: Math.min(UNCERTAINTY_START_MONTH_INDEX, Math.max(months.length - 1, 0)),
  };
}
