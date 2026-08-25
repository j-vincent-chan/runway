import { parse } from "date-fns";
import { getAllMonths, getCurrentMonth } from "@/lib/calculations";
import { simulateProjections } from "@/lib/projections/simulate";
import { addMonthsYm } from "@/lib/projections/horizon";
import { lookupFundingSource } from "@/lib/projections/sources";
import { buildMarkers, type RibbonMarker } from "@/lib/dashboard/runwayRibbon";
import { getFundingSourceTypes } from "@/lib/funding/accountCategory";
import {
  buildFundingMixForEmployees,
  categoryForFund,
  sliceMeta,
  UNATTRIBUTED_MIX_KEY,
  type FundingChartKey,
  type FundingMixSlice,
} from "@/lib/dashboard/metrics";
import { getEmployeePersonnelType, getPersonnelGroups, getPersonnelTypeMeta } from "@/lib/employees/personnelType";
import { filterEmployeesForPlanning } from "@/lib/employees/roster";
import type {
  AppSettings,
  FundingSource,
  PayrollReportSnapshot,
  ProjectionHorizonPreset,
  WorkingPlan,
} from "@/types";
import type { MergedPortfolioBalance } from "@/lib/portfolio/mergeBalances";

/** Trailing history shown alongside the projection, matching the personnel-cost chart's window. */
export const EXPOSURE_HISTORY_WINDOW_MONTHS = 12;
/** "Cap at five named sources plus other" — docs/design-system.md. */
export const EXPOSURE_CATEGORY_CAP = 5;
const OTHER_KEY = "other";

export interface ExposureBand {
  key: FundingChartKey;
  label: string;
  color: string;
  /** $ per month, aligned to FundingExposureTimeline.months. */
  values: number[];
}

export interface FundingExposureTimeline {
  months: string[];
  /** Fixed order and membership across every month — never recomputed per-month. */
  bands: ExposureBand[];
  totalByMonth: number[];
  markers: RibbonMarker[];
  hiddenMarkerCount: number;
  /** Index of the first projected month. */
  uncertaintyStartIndex: number;
}

export function buildFundingExposureTimeline(args: {
  snapshot: PayrollReportSnapshot;
  workingPlan: WorkingPlan | null;
  fundingSources: FundingSource[];
  settings: AppSettings;
  portfolio: Map<string, MergedPortfolioBalance>;
  horizonMonths: number;
}): FundingExposureTimeline {
  const { snapshot, workingPlan, fundingSources, settings, portfolio, horizonMonths } = args;
  const employees = filterEmployeesForPlanning(snapshot.employees, settings);
  const planningMonth = getCurrentMonth(snapshot);

  const actualMonths = getAllMonths(snapshot)
    .filter((m) => m <= planningMonth)
    .slice(-EXPOSURE_HISTORY_WINDOW_MONTHS);

  // Per-actual-month category totals: a single-month window makes
  // buildFundingMixForEmployees return real dollars (divisor === 1), not an
  // average — the exact selector the removed donuts used, just called once
  // per month instead of once per averaged window.
  const actualByMonth = new Map<string, FundingMixSlice[]>();
  for (const month of actualMonths) {
    actualByMonth.set(month, buildFundingMixForEmployees(employees, [month], snapshot, fundingSources, settings));
  }

  const fixedHorizonSettings: AppSettings = {
    ...settings,
    projectionHorizon: {
      preset: "custom" as ProjectionHorizonPreset,
      customEndMonth: addMonthsYm(planningMonth, Math.max(horizonMonths, 1) - 1),
    },
  };
  const result = simulateProjections({
    snapshot,
    workingPlan,
    settings: fixedHorizonSettings,
    portfolio,
    now: parse(`${planningMonth}-01`, "yyyy-MM-dd", new Date()),
  });
  const lastActualMonth = actualMonths[actualMonths.length - 1] ?? planningMonth;
  const projectedStates = result.states
    .map((state, i) => ({ state, month: result.months[i]! }))
    .filter(({ month }) => month > lastActualMonth);

  const knownCategories = new Set(getFundingSourceTypes(settings).map((t) => t.id));
  const projectedByMonth = new Map<string, Map<FundingChartKey, number>>();
  for (const { state, month } of projectedStates) {
    const totals = new Map<FundingChartKey, number>();
    for (const allocation of state.allocations) {
      const source = lookupFundingSource(result.sources, allocation.chartstringKey);
      let key = source ? categoryForFund(source, settings) : "uncategorized";
      if (key !== "uncategorized" && !knownCategories.has(key)) key = "uncategorized";
      totals.set(key, (totals.get(key) ?? 0) + allocation.monthlyBurn);
    }
    projectedByMonth.set(month, totals);
  }

  const months = [...actualMonths, ...projectedStates.map((p) => p.month)];

  // Fixed top-N + "other" selection: summed once across the whole window,
  // then applied identically to every month, so bands never reorder.
  const windowTotals = new Map<FundingChartKey, number>();
  for (const slices of actualByMonth.values()) {
    for (const slice of slices) {
      windowTotals.set(slice.key, (windowTotals.get(slice.key) ?? 0) + slice.value);
    }
  }
  for (const totals of projectedByMonth.values()) {
    for (const [key, value] of totals) {
      windowTotals.set(key, (windowTotals.get(key) ?? 0) + value);
    }
  }

  const rankedKeys = [...windowTotals.entries()]
    .filter(([key]) => key !== UNATTRIBUTED_MIX_KEY)
    .sort((a, b) => b[1] - a[1])
    .map(([key]) => key);
  const topKeys = rankedKeys.slice(0, EXPOSURE_CATEGORY_CAP);
  const hasOther = rankedKeys.length > EXPOSURE_CATEGORY_CAP;
  const hasUnattributed = (windowTotals.get(UNATTRIBUTED_MIX_KEY) ?? 0) > 0;

  function bandKeyFor(key: FundingChartKey): FundingChartKey {
    if (key === UNATTRIBUTED_MIX_KEY) return UNATTRIBUTED_MIX_KEY;
    return topKeys.includes(key) ? key : OTHER_KEY;
  }

  const orderedKeys: FundingChartKey[] = [
    ...topKeys,
    ...(hasOther ? [OTHER_KEY] : []),
    ...(hasUnattributed ? [UNATTRIBUTED_MIX_KEY] : []),
  ];

  const bands: ExposureBand[] = orderedKeys.map((key) => {
    const meta = key === OTHER_KEY ? { name: "Other", color: "var(--muted)" } : sliceMeta(key, settings);
    const values = months.map((month) => {
      const actualSlices = actualByMonth.get(month);
      if (actualSlices) {
        return actualSlices.filter((s) => bandKeyFor(s.key) === key).reduce((sum, s) => sum + s.value, 0);
      }
      const totals = projectedByMonth.get(month);
      if (!totals) return 0;
      let sum = 0;
      for (const [k, v] of totals) {
        if (bandKeyFor(k) === key) sum += v;
      }
      return sum;
    });
    return { key, label: meta.name, color: meta.color, values };
  });

  const totalByMonth = months.map((_, i) => bands.reduce((sum, band) => sum + (band.values[i] ?? 0), 0));

  const { markers, hiddenMarkerCount } = buildMarkers(snapshot, settings, months);

  return {
    months,
    bands,
    totalByMonth,
    markers,
    hiddenMarkerCount,
    uncertaintyStartIndex: actualMonths.length,
  };
}

export interface ExposureMatrixCell {
  categoryKey: FundingChartKey;
  pct: number;
  amount: number;
}

export interface ExposureMatrixRow {
  groupKey: string;
  groupLabel: string;
  cells: ExposureMatrixCell[];
  total: number;
}

export interface FundingExposureMatrix {
  categories: { key: FundingChartKey; label: string; color: string }[];
  rows: ExposureMatrixRow[];
}

/**
 * Group x funding-type breakdown for the current planning month only — a
 * matrix is a point-in-time table, and the band above already carries the
 * time dimension. `categories` should be the band's own capped selection, so
 * both visuals name funding types identically.
 */
export function buildFundingExposureMatrix(args: {
  snapshot: PayrollReportSnapshot;
  fundingSources: FundingSource[];
  settings: AppSettings;
  planningMonth: string;
  categories: ExposureBand[];
}): FundingExposureMatrix {
  const { snapshot, fundingSources, settings, planningMonth, categories } = args;
  const employees = filterEmployeesForPlanning(snapshot.employees, settings);
  const categoryKeys = new Set(categories.map((c) => c.key));

  const personnelGroups = getPersonnelGroups(settings);
  const groups = [
    ...personnelGroups.map((t) => ({
      key: t.id,
      label: getPersonnelTypeMeta(t.id, settings).label,
      ids: employees.filter((e) => getEmployeePersonnelType(settings, e.id) === t.id).map((e) => e.id),
    })),
    {
      key: "unassigned",
      label: "Unassigned",
      ids: employees.filter((e) => !getEmployeePersonnelType(settings, e.id)).map((e) => e.id),
    },
  ];

  const rows: ExposureMatrixRow[] = groups
    .map((g) => {
      const slices = buildFundingMixForEmployees(
        g.ids.map((id) => ({ id })),
        [planningMonth],
        snapshot,
        fundingSources,
        settings
      );
      const total = slices.reduce((sum, s) => sum + s.value, 0);
      const amounts = new Map<FundingChartKey, number>();
      for (const slice of slices) {
        const key =
          slice.key === UNATTRIBUTED_MIX_KEY
            ? UNATTRIBUTED_MIX_KEY
            : categoryKeys.has(slice.key)
              ? slice.key
              : OTHER_KEY;
        amounts.set(key, (amounts.get(key) ?? 0) + slice.value);
      }
      const cells: ExposureMatrixCell[] = categories.map((c) => ({
        categoryKey: c.key,
        amount: amounts.get(c.key) ?? 0,
        pct: total > 0 ? ((amounts.get(c.key) ?? 0) / total) * 100 : 0,
      }));
      return { groupKey: g.key, groupLabel: g.label, cells, total };
    })
    .filter((row) => row.total > 0)
    // Cost descending, matching buildPersonnelGroupBreakdown, so a team sits in
    // the same position here as in the charts and lists above. `total` is the
    // same monthly cost those rank on — buildFundingMixForEmployees always sums
    // to calculateMonthlyCost for the same employees and month.
    .sort((a, b) => b.total - a.total || a.groupLabel.localeCompare(b.groupLabel));

  return {
    categories: categories.map((c) => ({ key: c.key, label: c.label, color: c.color })),
    rows,
  };
}
