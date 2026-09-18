import type {
  AppSettings,
  Employee,
  FundingSource,
  PayrollFoldOutcome,
  PayrollReportImport,
  PayrollReportSnapshot,
  PersonLink,
  PlannedHire,
  ReconciliationChoice,
} from "@/types";
import { foldPayrollImports } from "@/lib/import/foldPayrollImports";
import { formatMonthLabel } from "@/lib/projections/horizon";
import {
  lookupFundingSource,
  projectionFundingSources,
  projectionSourceLabel,
} from "@/lib/projections/sources";
import type { ProjectionResult } from "@/lib/projections/simulate";
import { formatCurrency } from "@/lib/utils/parse";
import { resolveForecastRate, type ForecastRate } from "@/lib/reconciliation/forecastRate";
import {
  choiceForLink,
  effectiveLinks,
  findEmployeeByPersonKey,
} from "@/lib/reconciliation/links";
import {
  plannedHireRules,
  plannedMonthlyComp,
  plannedPersonKey,
} from "@/lib/reconciliation/plans";
import {
  actualMonthRangeLabel,
  latestActualMonth,
  newPersonKeysInReport,
  suggestMatches,
  suggestionPairKey,
  type MatchSuggestion,
} from "@/lib/reconciliation/suggest";

export type PlannedHireStatus = "planned" | "suggested" | "expected" | "linked";

export interface PlannedAccountChip {
  chartstringKey: string;
  label: string;
  percent: number;
}

/** One plan as every surface describes it — status, counterpart, figures. */
export interface PlannedHireRow {
  plan: PlannedHire;
  personKey: string;
  status: PlannedHireStatus;
  /** ~ monthly salary and benefits at the plan's own rate. */
  monthlyComp: number;
  accounts: PlannedAccountChip[];
  link?: PersonLink;
  choice?: ReconciliationChoice;
  linkedEmployee?: Employee;
  /** The strongest suggestion for this plan, when status is "suggested". */
  suggestion?: MatchSuggestion;
  suggestedEmployee?: Employee;
  /** Resolved forecast rate, for linked rows. */
  rate?: ForecastRate;
}

export interface ReconciliationView {
  /** The last Actual month of the latest report — "the Sep 2026 report". */
  reportMonth: string | null;
  reportFile: string | null;
  /** "Oct 2025 – Aug 2026": what the earlier reports covered. */
  previousRange: string | null;
  previousSnapshot: PayrollReportSnapshot | null;
  newInReportKeys: Set<string>;
  suggestions: MatchSuggestion[];
  suggestionsByPersonKey: Map<string, MatchSuggestion[]>;
  rows: PlannedHireRow[];
  /** Plans without an active link — the Planned (n) count. */
  unlinkedCount: number;
  linksByPersonKey: Map<string, PlannedHireRow[]>;
}

/**
 * How far a report reaches: its last posted month. "The latest report" is
 * the one that reaches furthest, not the one uploaded last — backfilling an
 * older report must not turn last month's new hire into an old colleague, and
 * re-uploading the same report (renamed or re-run) reaches exactly as far as
 * before, so it is never an "earlier" report.
 */
export function reportCoverageKey(imp: PayrollReportImport): string {
  return latestActualMonth(imp.snapshot) ?? imp.monthRange.end ?? "";
}

export function latestPayrollImport(imports: PayrollReportImport[]): PayrollReportImport | null {
  if (imports.length === 0) return null;
  return (
    [...imports].sort(
      (a, b) =>
        reportCoverageKey(b).localeCompare(reportCoverageKey(a)) ||
        (b.snapshot.reportDate ?? "").localeCompare(a.snapshot.reportDate ?? "") ||
        b.uploadedAt.localeCompare(a.uploadedAt)
    )[0] ?? null
  );
}

/**
 * The fold of every report that reaches less far than the latest — what "new
 * in this report" is measured against. Uploads that reach as far as the
 * latest are the same report, or a re-run of it, not history.
 */
export function previousFold(imports: PayrollReportImport[]): PayrollReportSnapshot | null {
  const latest = latestPayrollImport(imports);
  if (!latest) return null;
  const latestKey = reportCoverageKey(latest);
  const earlier = imports
    .filter((imp) => reportCoverageKey(imp) < latestKey)
    .sort((a, b) => a.uploadedAt.localeCompare(b.uploadedAt));
  if (earlier.length === 0) return null;
  return foldPayrollImports(earlier);
}

function accountChips(
  plan: PlannedHire,
  settings: AppSettings,
  sources: FundingSource[],
  accountTitlesByChartstring?: Map<string, string>
): PlannedAccountChip[] {
  return plannedHireRules(settings.projectionRules, plan.id)
    .filter((r) => r.chartstringKey && r.trigger.type === "setEffort")
    .map((r) => {
      const fs = lookupFundingSource(sources, r.chartstringKey!);
      return {
        chartstringKey: r.chartstringKey!,
        label: fs ? projectionSourceLabel(fs, settings, accountTitlesByChartstring) : r.chartstringKey!,
        percent: r.trigger.type === "setEffort" ? r.trigger.percentEffort : 0,
      };
    })
    .sort((a, b) => b.percent - a.percent);
}

/**
 * The derived, never-stored view of every plan: suggestions, "new in this
 * report", each plan's status and counterpart. Employees, Projections and
 * Upload all read this one object, so chips, banners and the Upload block
 * cannot disagree about who is new or which match is suggested.
 */
export function buildReconciliationView(input: {
  snapshot: PayrollReportSnapshot | null;
  payrollImports: PayrollReportImport[];
  settings: AppSettings;
  accountTitlesByChartstring?: Map<string, string>;
}): ReconciliationView {
  const { snapshot, payrollImports, settings, accountTitlesByChartstring } = input;
  const plans = settings.plannedHires ?? [];
  const latest = latestPayrollImport(payrollImports);
  const previousSnapshot = snapshot ? previousFold(payrollImports) : null;
  const reportMonth = latest ? latestActualMonth(latest.snapshot) : latestActualMonth(snapshot);
  const employees = snapshot?.employees ?? [];
  // Same rule as the engine: a link whose person is not on the report acts
  // on nothing, so its plan reads — and simulates — as unlinked.
  const links = effectiveLinks(settings, employees);
  const sources = snapshot ? projectionFundingSources(snapshot, settings) : [];
  const labelForSource = (fs: FundingSource) =>
    projectionSourceLabel(fs, settings, accountTitlesByChartstring);

  const newInReportKeys = snapshot ? newPersonKeysInReport(snapshot, previousSnapshot) : new Set<string>();
  const suggestions = snapshot
    ? suggestMatches({
        snapshot,
        previousSnapshot,
        plans,
        links,
        dismissals: settings.matchDismissals ?? [],
        rules: settings.projectionRules ?? [],
        reportMonth,
        labelForSource,
      })
    : [];
  const suggestionsByPersonKey = new Map<string, MatchSuggestion[]>();
  for (const s of suggestions) {
    const list = suggestionsByPersonKey.get(s.employeePersonKey) ?? [];
    list.push(s);
    suggestionsByPersonKey.set(s.employeePersonKey, list);
  }

  const rows: PlannedHireRow[] = plans.map((plan) => {
    const base = {
      plan,
      personKey: plannedPersonKey(plan.id),
      monthlyComp: plannedMonthlyComp(plan),
      accounts: accountChips(plan, settings, sources, accountTitlesByChartstring),
    };
    const link = links.find((l) => l.plannedHireId === plan.id);
    if (link) {
      const linkedEmployee = findEmployeeByPersonKey(employees, link.employeePersonKey);
      const choice = choiceForLink(settings, link.id);
      const rate =
        linkedEmployee && snapshot
          ? resolveForecastRate({ plan, employee: linkedEmployee, snapshot, choice })
          : undefined;
      return { ...base, status: "linked" as const, link, choice, linkedEmployee, rate };
    }
    const suggestion = suggestions.find((s) => s.plannedHireId === plan.id);
    if (suggestion) {
      return {
        ...base,
        status: "suggested" as const,
        suggestion,
        suggestedEmployee: employees.find((e) => e.id === suggestion.employeeId),
      };
    }
    // "Not in report" is a claim about who is new, which takes an earlier
    // report to know. With one report there is nothing to compare, so the
    // plan simply stays planned.
    const expected = Boolean(previousSnapshot && reportMonth && plan.startMonth <= reportMonth);
    return { ...base, status: expected ? ("expected" as const) : ("planned" as const) };
  });

  const linksByPersonKey = new Map<string, PlannedHireRow[]>();
  for (const row of rows) {
    if (!row.link) continue;
    const list = linksByPersonKey.get(row.link.employeePersonKey) ?? [];
    list.push(row);
    linksByPersonKey.set(row.link.employeePersonKey, list);
  }

  return {
    reportMonth,
    reportFile: latest?.sourceFileName ?? snapshot?.sourceFileName ?? null,
    previousRange: actualMonthRangeLabel(previousSnapshot),
    previousSnapshot,
    newInReportKeys,
    suggestions,
    suggestionsByPersonKey,
    rows,
    unlinkedCount: rows.filter((r) => r.status !== "linked").length,
    linksByPersonKey,
  };
}

export function describeFoldOutcome(input: {
  before: ReconciliationView;
  after: ReconciliationView;
  replacedMonths: string[];
  preservedMonths: string[];
  newEmployees: Employee[];
  eventsAdded: number;
}): PayrollFoldOutcome {
  const beforeKeys = new Set(input.before.suggestions.map(suggestionPairKey));
  const afterKeys = input.after.suggestions.map(suggestionPairKey);
  const unchanged =
    afterKeys.length > 0 &&
    afterKeys.length === beforeKeys.size &&
    afterKeys.every((k) => beforeKeys.has(k));
  return {
    replacedMonths: input.replacedMonths,
    preservedMonths: input.preservedMonths,
    newEmployees: input.newEmployees.map((e) => ({ name: e.name, employeeId: e.employeeId })),
    suggestionCount: input.after.suggestions.length,
    suggestionsUnchanged: unchanged,
    linkCount: input.after.rows.filter((r) => r.status === "linked").length,
    eventsAdded: input.eventsAdded,
  };
}

function monthListLabel(months: string[]): string {
  const sorted = [...months].sort();
  if (sorted.length === 0) return "";
  if (sorted.length <= 3) return ` (${sorted.map(formatMonthLabel).join(", ")})`;
  return ` (${formatMonthLabel(sorted[0]!)} – ${formatMonthLabel(sorted[sorted.length - 1]!)})`;
}

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * "Replaced 1 month (Sep 2026), preserved 11 · 1 new employee: Ana Ruiz
 * (02987654) · 1 suggested match" — or, on a re-upload of the same file,
 * "… · 0 new employees · links unchanged (1) · suggestions unchanged (1) ·
 * no events added". Every clause handles zero, one and many.
 */
export function formatFoldOutcome(o: PayrollFoldOutcome): string {
  const parts: string[] = [];
  parts.push(
    `Replaced ${plural(o.replacedMonths.length, "month", "months")}${monthListLabel(
      o.replacedMonths
    )}, preserved ${o.preservedMonths.length}`
  );
  if (o.newEmployees.length === 0) {
    parts.push("0 new employees");
  } else {
    const names = o.newEmployees
      .map((e) => (e.employeeId ? `${e.name} (${e.employeeId})` : e.name))
      .join(", ");
    parts.push(`${plural(o.newEmployees.length, "new employee", "new employees")}: ${names}`);
  }
  if (o.linkCount > 0 && o.newEmployees.length === 0) {
    parts.push(`links unchanged (${o.linkCount})`);
  }
  if (o.suggestionsUnchanged) {
    parts.push(`suggestions unchanged (${o.suggestionCount})`);
  } else if (o.suggestionCount === 0) {
    parts.push("no suggested matches");
  } else {
    parts.push(plural(o.suggestionCount, "suggested match", "suggested matches"));
  }
  parts.push(o.eventsAdded === 0 ? "no events added" : plural(o.eventsAdded, "event added", "events added"));
  return parts.join(" · ");
}

/**
 * The banner's "both rows count" line, read from the projection: for each
 * account the plan names, the planned burn and — when the suggested person is
 * charged there too — the imported burn, in the first month both are on the
 * grid. No arithmetic of its own; both figures are the engine's monthlyBurn.
 */
export function doubleCountLines(input: {
  row: PlannedHireRow;
  employee: Employee;
  result: ProjectionResult;
  settings: AppSettings;
  accountTitlesByChartstring?: Map<string, string>;
}): string[] {
  const { row, employee, result, settings, accountTitlesByChartstring } = input;
  const month =
    result.months.find((m) => m >= row.plan.startMonth && m >= result.originMonth) ??
    result.originMonth;
  const state = result.states.find((s) => s.month === month);
  if (!state) return [];
  const label = (key: string) => {
    const fs = lookupFundingSource(result.sources, key);
    return fs ? projectionSourceLabel(fs, settings, accountTitlesByChartstring) : key;
  };
  return row.accounts.map((acct) => {
    const planned = state.allocations
      .filter((a) => a.personKey === row.personKey && a.chartstringKey === acct.chartstringKey)
      .reduce((s, a) => s + a.monthlyBurn, 0);
    const imported = state.allocations
      .filter((a) => a.employeeId === employee.id && a.chartstringKey === acct.chartstringKey)
      .reduce((s, a) => s + a.monthlyBurn, 0);
    const importedPart = imported > 0 ? ` + ${formatCurrency(imported)}/mo imported` : "";
    return `${label(acct.chartstringKey)} ~${formatCurrency(planned)}/mo planned${importedPart}`;
  });
}
