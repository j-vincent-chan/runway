import { foldPayrollImports } from "@/lib/import/foldPayrollImports";
import { buildPersonnelCostTrend } from "@/lib/dashboard/metrics";
import { BURN_WINDOW_MONTHS, buildConstrainedRunway, trailingBurn } from "@/lib/dashboard/overview";
import { buildRunwayContext } from "@/lib/dashboard/attention";
import { monthLabelShort } from "@/lib/dashboard/month";
import { getAllocations } from "@/lib/calculations";
import { employeePersonKey } from "@/lib/employees/stableKey";
import { filterEmployeesForPlanning } from "@/lib/employees/roster";
import type {
  AppSettings,
  Employee,
  FundingSource,
  PayrollReportImport,
  PayrollReportSnapshot,
  WorkingPlan,
} from "@/types";
import type { MergedPortfolioBalance } from "@/lib/portfolio/mergeBalances";

/** Minimum |%| cost swing worth naming — below this reads as noise, not a change. */
export const COST_MATERIALITY = 0.01;
/** Minimum |months| runway swing worth stating as a consequence. */
export const RUNWAY_MATERIALITY = 0.05;
/** Names shown inline before collapsing to "+N more" — a prose list, not a table row. */
const NAME_CAP = 3;

export interface SinceLastReportSummary {
  priorLabel: string;
  costDeltaPct: number | null;
  newHireNames: string[];
  departureNames: string[];
  priorRunwayMonths: number | null;
  currentRunwayMonths: number | null;
  runwayDeltaMonths: number | null;
}

/**
 * Employees actually drawing pay in `planningMonth` — keyed by employeePersonKey,
 * not Employee.id. snapshot.employees only ever grows across folds (mergeEmployees
 * unions rosters, never removes anyone), so an employee-list diff could never detect
 * a departure; who has non-zero effort allocated in the report's own current month is
 * the real "active roster" signal, matching how buildRunwayContext / the ribbon's
 * "current personnel" scoping already treat "active" elsewhere on this dashboard.
 */
function activePersonKeys(
  snapshot: PayrollReportSnapshot,
  workingPlan: WorkingPlan | null,
  planningMonth: string,
  settings: AppSettings
): { keys: Set<string>; byKey: Map<string, Employee> } {
  const planningEmployees = filterEmployeesForPlanning(snapshot.employees, settings);
  const employeeById = new Map(planningEmployees.map((e) => [e.id, e]));
  const keys = new Set<string>();
  const byKey = new Map<string, Employee>();
  for (const a of getAllocations(snapshot, workingPlan)) {
    if (a.month !== planningMonth || a.percentEffort <= 0) continue;
    const emp = employeeById.get(a.employeeId);
    if (!emp) continue;
    const key = employeePersonKey(emp);
    keys.add(key);
    byKey.set(key, emp);
  }
  return { keys, byKey };
}

export function buildSinceLastReport(args: {
  payrollImports: PayrollReportImport[];
  currentSnapshot: PayrollReportSnapshot;
  currentPlanningMonth: string;
  currentMonthlyBurn: number;
  currentRunwayMonths: number | null;
  workingPlan: WorkingPlan | null;
  fundingSources: FundingSource[];
  settings: AppSettings;
  portfolio: Map<string, MergedPortfolioBalance>;
}): SinceLastReportSummary | null {
  const {
    payrollImports,
    currentSnapshot,
    currentPlanningMonth,
    currentMonthlyBurn,
    currentRunwayMonths,
    workingPlan,
    fundingSources,
    settings,
    portfolio,
  } = args;

  if (payrollImports.length < 2) return null;

  const sorted = [...payrollImports].sort((a, b) => a.uploadedAt.localeCompare(b.uploadedAt));
  const priorSnapshot = foldPayrollImports(sorted.slice(0, -1));
  if (!priorSnapshot) return null;

  const priorTrend = buildPersonnelCostTrend(priorSnapshot, settings);
  const { average: priorBurn } = trailingBurn(priorTrend.monthly, priorTrend.planningMonth, BURN_WINDOW_MONTHS);
  const costDeltaPct = priorBurn > 0 ? (currentMonthlyBurn - priorBurn) / priorBurn : null;

  // Prior side always reads as-imported allocations (workingPlan: null) — see the
  // runway-context call below for why a shared workingPlan can't be trusted here.
  const prior = activePersonKeys(priorSnapshot, null, priorTrend.planningMonth, settings);
  const current = activePersonKeys(currentSnapshot, workingPlan, currentPlanningMonth, settings);
  const newHireNames = [...current.keys]
    .filter((key) => !prior.keys.has(key))
    .map((key) => current.byKey.get(key)!.name);
  const departureNames = [...prior.keys]
    .filter((key) => !current.keys.has(key))
    .map((key) => prior.byKey.get(key)!.name);

  // Prior side always uses the as-imported baseline, never today's working
  // plan: PayrollReportSnapshot.id is stable across folds, so a shared
  // workingPlan would otherwise pass getAllocations' snapshotId check
  // against the prior (smaller) snapshot too and silently overlay today's
  // manual edits onto the historical comparison.
  const priorRunwayContext = buildRunwayContext(priorSnapshot, null, fundingSources, settings, portfolio);
  const priorRunwayMonths = buildConstrainedRunway(priorRunwayContext, priorSnapshot.employees, settings).months;

  const runwayDeltaMonths =
    currentRunwayMonths !== null && priorRunwayMonths !== null
      ? currentRunwayMonths - priorRunwayMonths
      : null;

  return {
    priorLabel: monthLabelShort(priorTrend.planningMonth),
    costDeltaPct,
    newHireNames,
    departureNames,
    priorRunwayMonths,
    currentRunwayMonths,
    runwayDeltaMonths,
  };
}

function nameList(names: string[]): string {
  if (names.length <= NAME_CAP) {
    if (names.length === 1) return names[0]!;
    return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
  }
  const shown = names.slice(0, NAME_CAP);
  const hidden = names.length - NAME_CAP;
  return `${shown.join(", ")}, and ${hidden} more`;
}

export function buildSinceLastReportSentence(summary: SinceLastReportSummary): string {
  const facts: string[] = [];

  if (summary.costDeltaPct !== null && Math.abs(summary.costDeltaPct) >= COST_MATERIALITY) {
    const pct = Math.round(Math.abs(summary.costDeltaPct) * 100);
    facts.push(`Personnel cost ${summary.costDeltaPct > 0 ? "rose" : "fell"} ${pct}%`);
  }
  if (summary.newHireNames.length > 0) {
    facts.push(`${nameList(summary.newHireNames)} joined`);
  }
  if (summary.departureNames.length > 0) {
    facts.push(`${nameList(summary.departureNames)} left`);
  }

  const hasRunwayConsequence =
    summary.runwayDeltaMonths !== null &&
    Math.abs(summary.runwayDeltaMonths) >= RUNWAY_MATERIALITY &&
    summary.currentRunwayMonths !== null;

  const factClause = facts.length > 0 ? facts.join("; ") : null;

  if (!hasRunwayConsequence) {
    return factClause ? `${factClause}.` : `No material change since the ${summary.priorLabel} report.`;
  }

  const direction = summary.runwayDeltaMonths! > 0 ? "extended" : "shortened";
  // Once overdrawn, "months" stops being a meaningful endpoint — the rest of
  // the dashboard states that state as a dollar deficit instead (Shortest
  // runway anchor), never a negative month count. State the delta on its own
  // rather than restate the endpoint in a unit this page never uses for it.
  const endpoint =
    summary.currentRunwayMonths! >= 0 ? `, to ${summary.currentRunwayMonths!.toFixed(1)} months` : "";
  const runwayClause = `runway ${direction} by ${Math.abs(summary.runwayDeltaMonths!).toFixed(1)} months${endpoint}`;

  if (!factClause) {
    return `${runwayClause[0]!.toUpperCase()}${runwayClause.slice(1)}.`;
  }
  return `${factClause} — ${runwayClause}.`;
}
