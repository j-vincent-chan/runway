import { addMonths, format, parse } from "date-fns";
import { calculateMonthlyCost } from "@/lib/calculations";
import { filterEmployeesForPlanning } from "@/lib/employees/roster";
import {
  buildFundingMixForEmployees,
  employeeGroupKey,
  groupLabel,
  type FundingMixSlice,
  type PersonnelCostTrendPoint,
  type PersonnelGroupBreakdown,
} from "@/lib/dashboard/metrics";
import type {
  AppSettings,
  FundingSource,
  MonthlyCostRecord,
  PayrollReportSnapshot,
} from "@/types";

export const RUNWAY_ATTENTION_MONTHS = 6;
export const MAX_DASHBOARD_INSIGHTS = 5;

export type DashboardInsightKind =
  | "cost_yoy"
  | "headcount"
  | "funding_mix"
  | "runway_attention"
  | "largest_cost_group";

export type DashboardInsightTone = "up" | "down" | "neutral" | "attention";

export interface DashboardInsight {
  id: string;
  kind: DashboardInsightKind;
  tone: DashboardInsightTone;
  headline: string;
  detail?: string;
  href?: string;
  hrefLabel?: string;
}

export function shiftMonth(ym: string, delta: number): string {
  const d = parse(`${ym}-01`, "yyyy-MM-dd", new Date());
  return format(addMonths(d, delta), "yyyy-MM");
}

function monthsAtOrBefore(months: string[], end: string): string[] {
  return months.filter((m) => m <= end);
}

function lastNMonths(months: string[], end: string, n: number): string[] {
  return monthsAtOrBefore(months, end).slice(-n);
}

function sumCosts(
  employeeIds: string[],
  months: string[],
  costs: MonthlyCostRecord[]
): number {
  let total = 0;
  for (const month of months) {
    for (const id of employeeIds) {
      total += calculateMonthlyCost(id, month, costs).total;
    }
  }
  return total;
}

function costsByGroup(
  employees: { id: string }[],
  months: string[],
  costs: MonthlyCostRecord[],
  settings: AppSettings
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const emp of employees) {
    const key = employeeGroupKey(settings, emp.id);
    totals.set(key, (totals.get(key) ?? 0) + sumCosts([emp.id], months, costs));
  }
  return totals;
}

function pctChange(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return ((current - previous) / previous) * 100;
}

function signedPctLabel(pct: number): string {
  const rounded = Math.round(Math.abs(pct));
  const arrow = pct >= 0 ? "↑" : "↓";
  return `${arrow} ${rounded}%`;
}

function mixShares(slices: FundingMixSlice[]): { name: string; key: string; share: number }[] {
  const total = slices.reduce((s, x) => s + x.value, 0);
  if (total <= 0) return [];
  return slices.map((s) => ({ key: s.key, name: s.name, share: s.value / total }));
}

function costYoyInsight(
  employees: { id: string }[],
  monthly: PersonnelCostTrendPoint[],
  planningMonth: string,
  costs: MonthlyCostRecord[],
  settings: AppSettings
): DashboardInsight | null {
  const months = monthly.map((m) => m.month);
  const currentMonths = lastNMonths(months, planningMonth, 12);
  if (currentMonths.length === 0) return null;

  const priorEnd = shiftMonth(currentMonths[0]!, -1);
  const priorMonths = lastNMonths(months, priorEnd, currentMonths.length);
  const comparable =
    priorMonths.length >= Math.max(3, Math.floor(currentMonths.length * 0.5));

  let currentCost: number;
  let priorCost: number;
  let currentWindow = currentMonths;
  let priorWindow = priorMonths;

  if (comparable) {
    currentCost = monthly
      .filter((m) => currentMonths.includes(m.month))
      .reduce((s, m) => s + m.total, 0);
    priorCost = monthly
      .filter((m) => priorMonths.includes(m.month))
      .reduce((s, m) => s + m.total, 0);
  } else {
    const priorMonth = monthsAtOrBefore(months, shiftMonth(planningMonth, -12)).at(-1);
    if (!priorMonth || priorMonth === planningMonth) return null;
    currentWindow = [planningMonth];
    priorWindow = [priorMonth];
    currentCost = monthly.find((m) => m.month === planningMonth)?.total ?? 0;
    priorCost = monthly.find((m) => m.month === priorMonth)?.total ?? 0;
  }

  const change = pctChange(currentCost, priorCost);
  if (change === null || Math.round(Math.abs(change)) < 1) return null;

  const currentByGroup = costsByGroup(employees, currentWindow, costs, settings);
  const priorByGroup = costsByGroup(employees, priorWindow, costs, settings);
  const keys = new Set([...currentByGroup.keys(), ...priorByGroup.keys()]);
  let topKey: string | null = null;
  let topDelta = 0;
  for (const key of keys) {
    const delta = (currentByGroup.get(key) ?? 0) - (priorByGroup.get(key) ?? 0);
    const better =
      change >= 0
        ? delta > topDelta
        : delta < topDelta || (topKey === null && delta < 0);
    if (better && Math.abs(delta) > 0) {
      topKey = key;
      topDelta = delta;
    }
  }

  const overallDelta = currentCost - priorCost;
  const shareOfDelta =
    overallDelta !== 0 && topKey !== null ? Math.abs(topDelta / overallDelta) : 0;
  const detail =
    topKey && shareOfDelta >= 0.3
      ? `Primarily from ${groupLabel(settings, topKey)}`
      : undefined;

  return {
    id: "cost_yoy",
    kind: "cost_yoy",
    tone: change >= 0 ? "up" : "down",
    headline: `Personnel costs ${signedPctLabel(change)} YoY`,
    detail,
  };
}

function headcountInsight(monthly: PersonnelCostTrendPoint[], planningMonth: string): DashboardInsight | null {
  const current = monthly.find((m) => m.month === planningMonth);
  if (!current) return null;
  const months = monthly.map((m) => m.month);
  const priorMonth = monthsAtOrBefore(months, shiftMonth(planningMonth, -12)).at(-1);
  if (!priorMonth || priorMonth === planningMonth) return null;
  const prior = monthly.find((m) => m.month === priorMonth);
  if (!prior) return null;
  if (current.headcount === prior.headcount) return null;

  const increased = current.headcount > prior.headcount;
  return {
    id: "headcount",
    kind: "headcount",
    tone: increased ? "up" : "down",
    headline: `Team size ${increased ? "increased" : "decreased"} ${prior.headcount} → ${current.headcount}`,
  };
}

function fundingMixInsight(
  snapshot: PayrollReportSnapshot,
  fundingSources: FundingSource[],
  settings: AppSettings,
  employees: { id: string }[],
  planningMonth: string,
  availableMonths: string[]
): DashboardInsight | null {
  const priorMonth = monthsAtOrBefore(availableMonths, shiftMonth(planningMonth, -12)).at(-1);
  if (!priorMonth || priorMonth === planningMonth) return null;

  const currentSlices = buildFundingMixForEmployees(
    employees,
    [planningMonth],
    snapshot,
    fundingSources,
    settings
  );
  const priorSlices = buildFundingMixForEmployees(
    employees,
    [priorMonth],
    snapshot,
    fundingSources,
    settings
  );
  const current = mixShares(currentSlices);
  const prior = mixShares(priorSlices);
  if (current.length === 0 || prior.length === 0) return null;

  let best:
    | { name: string; from: number; to: number; abs: number }
    | null = null;
  for (const slice of current) {
    const prev = prior.find((p) => p.key === slice.key);
    const from = prev?.share ?? 0;
    const abs = Math.abs(slice.share - from);
    if (!best || abs > best.abs) {
      best = { name: slice.name, from, to: slice.share, abs };
    }
  }
  for (const slice of prior) {
    if (current.some((c) => c.key === slice.key)) continue;
    const abs = slice.share;
    if (!best || abs > best.abs) {
      best = { name: slice.name, from: slice.share, to: 0, abs };
    }
  }

  if (!best || best.abs < 0.02) return null;
  const fromPct = Math.round(best.from * 100);
  const toPct = Math.round(best.to * 100);
  if (fromPct === toPct) return null;

  const decreased = toPct < fromPct;
  return {
    id: "funding_mix",
    kind: "funding_mix",
    tone: decreased ? "down" : "up",
    headline: `${best.name} funding ${decreased ? "decreased" : "increased"} ${fromPct}% → ${toPct}%`,
  };
}

function runwayInsight(
  employees: { id: string }[],
  runwayMonthsByEmployee: Map<string, number | null> | undefined
): DashboardInsight | null {
  if (!runwayMonthsByEmployee || runwayMonthsByEmployee.size === 0) return null;
  const needing = employees.filter((e) => {
    const months = runwayMonthsByEmployee.get(e.id);
    return months !== undefined && months !== null && months < RUNWAY_ATTENTION_MONTHS;
  }).length;
  if (needing <= 0) return null;
  const noun = needing === 1 ? "person requires" : "personnel require";
  return {
    id: "runway_attention",
    kind: "runway_attention",
    tone: "attention",
    headline: `${needing} ${noun} funding attention in the next six months`,
    href: "/runway",
    hrefLabel: "View Runway",
  };
}

function largestCostGroupInsight(
  groupBreakdown: PersonnelGroupBreakdown[]
): DashboardInsight | null {
  const withCost = [...groupBreakdown].sort((a, b) => b.cost - a.cost);
  const top = withCost[0];
  const total = withCost.reduce((s, g) => s + g.cost, 0);
  if (!top || total <= 0) return null;
  const share = Math.round((top.cost / total) * 100);
  return {
    id: "largest_cost_group",
    kind: "largest_cost_group",
    tone: "neutral",
    headline: `${top.label} is the largest cost group this month`,
    detail: `${share}% of personnel cost`,
  };
}

export function buildDashboardInsights({
  snapshot,
  fundingSources,
  settings,
  monthly,
  groupBreakdown,
  planningMonth,
  runwayMonthsByEmployee,
}: {
  snapshot: PayrollReportSnapshot;
  fundingSources: FundingSource[];
  settings: AppSettings;
  monthly: PersonnelCostTrendPoint[];
  groupBreakdown: PersonnelGroupBreakdown[];
  planningMonth: string;
  runwayMonthsByEmployee?: Map<string, number | null>;
}): DashboardInsight[] {
  const employees = filterEmployeesForPlanning(snapshot.employees, settings);
  const availableMonths = monthly.map((m) => m.month);

  const ranked: DashboardInsight[] = [];
  const cost = costYoyInsight(
    employees,
    monthly,
    planningMonth,
    snapshot.monthlyCosts,
    settings
  );
  const headcount = headcountInsight(monthly, planningMonth);
  const mix = fundingMixInsight(
    snapshot,
    fundingSources,
    settings,
    employees,
    planningMonth,
    availableMonths
  );
  const runway = runwayInsight(employees, runwayMonthsByEmployee);
  const largest = largestCostGroupInsight(groupBreakdown);

  for (const item of [cost, headcount, mix, runway]) {
    if (item) ranked.push(item);
  }
  if (ranked.length < 3 && largest) ranked.push(largest);

  return ranked.slice(0, MAX_DASHBOARD_INSIGHTS);
}
