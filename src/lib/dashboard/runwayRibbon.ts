import { simulateProjections } from "@/lib/projections/simulate";
import { chartstringKeyForFundingSource, projectionSourceLabel } from "@/lib/projections/sources";
import { chartstringFundDeptProject, normalizeChartstring } from "@/lib/funding/chartstring";
import { getEmployeeEndDate } from "@/lib/employees/profile";
import { employeePersonKey } from "@/lib/employees/stableKey";
import { filterEmployeesForPlanning } from "@/lib/employees/roster";
import { getAllocations, getCurrentMonth } from "@/lib/calculations";
import { addMonthsYm, getProjectionOriginMonth } from "@/lib/projections/horizon";
import type { AppSettings, PayrollReportSnapshot, ProjectionHorizonPreset, WorkingPlan } from "@/types";
import type { MergedPortfolioBalance } from "@/lib/portfolio/mergeBalances";

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
 * Stacked per-account depletion across the Dashboard's selected scope. Reuses
 * simulateProjections (the only canonical month-by-month forward-projection
 * engine — never re-derives burn/effort/reassignment math) and just shapes
 * its remainingByRoot output into bands.
 */
export function buildRunwayRibbon({
  snapshot,
  workingPlan,
  settings,
  portfolio,
  horizonMonths = RIBBON_HORIZON_MONTHS,
  now,
}: {
  snapshot: PayrollReportSnapshot;
  workingPlan: WorkingPlan | null;
  settings: AppSettings;
  portfolio: Map<string, MergedPortfolioBalance>;
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
    portfolio,
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
    uncertaintyStartIndex: Math.min(UNCERTAINTY_START_MONTH_INDEX, Math.max(months.length - 1, 0)),
  };
}
