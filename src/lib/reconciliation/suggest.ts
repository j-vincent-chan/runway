import type {
  Employee,
  FundingSource,
  MatchDismissal,
  PayrollReportSnapshot,
  PersonLink,
  PlannedHire,
  ProjectionRule,
} from "@/types";
import {
  employeePersonKey,
  employeePersonKeys,
  namesLooselyMatch,
} from "@/lib/employees/stableKey";
import { depletionRootOf } from "@/lib/projections/depletion";
import { formatMonthLabel } from "@/lib/projections/horizon";
import { chartstringKeyForFundingSource } from "@/lib/projections/sources";
import { hasPercentEffort } from "@/lib/utils/parse";
import { chargedMonths, firstChargedMonth } from "@/lib/reconciliation/closure";
import { looksLikePlaceholder, planAccountKeys } from "@/lib/reconciliation/plans";

export type MatchSignalId = "newInReport" | "startWindow" | "sharedAccount" | "title" | "name";
export type MatchSignalStatus = "pass" | "fail" | "neutral";

/** One of the five lines the dialog and the Upload card print, templated. */
export interface MatchSignal {
  id: MatchSignalId;
  status: MatchSignalStatus;
  label: string;
}

export interface MatchSuggestion {
  plannedHireId: string;
  employeeId: string;
  employeePersonKey: string;
  signals: MatchSignal[];
  /** Passing signals out of five. */
  passCount: number;
  firstChargedMonth: string;
}

/** yyyy-MM → months between, unsigned. */
export function monthsApart(a: string, b: string): number {
  const [ay, am] = a.split("-").map(Number);
  const [by, bm] = b.split("-").map(Number);
  if (!ay || !am || !by || !bm) return Number.POSITIVE_INFINITY;
  return Math.abs(ay * 12 + am - (by * 12 + bm));
}

const TITLE_STOP_WORDS = new Set(["the", "and", "for", "employee", "staff", "asst", "sr", "jr"]);

function titleTokens(text: string | undefined): string[] {
  return (text ?? "")
    .toLowerCase()
    .replace(/[^a-z]+/g, " ")
    .split(" ")
    .filter((w) => w.length >= 3 && !TITLE_STOP_WORDS.has(w));
}

/** "POSTDOC EMPLOYEE" vs "Postdoctoral scholar" match; "Lab manager" vs "POSTDOC EMPLOYEE" don't. */
export function titleMatchesRole(title: string | undefined, role: string | undefined): boolean {
  const t = titleTokens(title);
  const r = titleTokens(role);
  if (t.length === 0 || r.length === 0) return false;
  return r.some((rt) =>
    t.some(
      (tt) =>
        tt === rt ||
        (Math.min(tt.length, rt.length) >= 4 && (tt.startsWith(rt) || rt.startsWith(tt)))
    )
  );
}

function chargedEmployees(snapshot: PayrollReportSnapshot): Employee[] {
  return snapshot.employees.filter((e) => chargedMonths(snapshot, e.id).length > 0);
}

/**
 * People with posted pay in this fold and none in the fold of every earlier
 * report. With no earlier report there is no diff to take, so nobody is new.
 * Both HR-id and name keys are checked, so a report that gains or loses the
 * parenthesised ID does not make an old colleague look new.
 */
export function newPersonKeysInReport(
  snapshot: PayrollReportSnapshot,
  previousSnapshot: PayrollReportSnapshot | null
): Set<string> {
  if (!previousSnapshot) return new Set();
  const before = new Set(chargedEmployees(previousSnapshot).flatMap(employeePersonKeys));
  const out = new Set<string>();
  for (const emp of chargedEmployees(snapshot)) {
    if (employeePersonKeys(emp).some((k) => before.has(k))) continue;
    out.add(employeePersonKey(emp));
  }
  return out;
}

/** "Oct 2025 – Aug 2026" from a fold's Actual months, or null when it has none. */
export function actualMonthRangeLabel(snapshot: PayrollReportSnapshot | null): string | null {
  if (!snapshot) return null;
  const months = [...snapshot.actualMonths].sort();
  const first = months[0];
  const last = months[months.length - 1];
  if (!first || !last) return null;
  return first === last
    ? formatMonthLabel(first)
    : `${formatMonthLabel(first)} – ${formatMonthLabel(last)}`;
}

/** The last Actual month a fold covers — "the Sep 2026 report". */
export function latestActualMonth(snapshot: PayrollReportSnapshot | null): string | null {
  if (!snapshot) return null;
  const months = [...snapshot.actualMonths].sort();
  return months[months.length - 1] ?? snapshot.monthRange.end ?? null;
}

/** Accounts with posted pay for this person — future rows are payroll's plan, not a charge. */
function chargedRootsForEmployee(
  snapshot: PayrollReportSnapshot,
  employeeId: string
): Map<string, FundingSource> {
  const byId = new Map(snapshot.fundingSources.map((fs) => [fs.id, fs]));
  const actual = new Set(snapshot.actualMonths);
  const roots = new Map<string, FundingSource>();
  for (const a of snapshot.monthlyAllocations) {
    if (a.employeeId !== employeeId || !hasPercentEffort(a.percentEffort)) continue;
    if (a.sourceType !== "actual" && !actual.has(a.month)) continue;
    const fs = byId.get(a.fundingSourceId);
    if (!fs) continue;
    const root = depletionRootOf(chartstringKeyForFundingSource(fs));
    if (!roots.has(root)) roots.set(root, fs);
  }
  return roots;
}

export interface EvaluateSignalsInput {
  snapshot: PayrollReportSnapshot;
  previousSnapshot: PayrollReportSnapshot | null;
  plan: PlannedHire;
  employee: Employee;
  rules: ProjectionRule[];
  /** Precomputed by callers that loop; derived here otherwise. */
  newKeys?: Set<string>;
  reportMonth?: string | null;
  labelForSource?: (fs: FundingSource) => string;
}

/**
 * The five signals for one plan × person pair, each with pass / fail /
 * neutral and the sentence the UI prints. Shared by the suggestion gate and
 * the link dialog's "for the record" list, so both always show the same five.
 */
export function evaluateMatchSignals(input: EvaluateSignalsInput): {
  signals: MatchSignal[];
  passCount: number;
  firstChargedMonth: string | null;
} {
  const { snapshot, previousSnapshot, plan, employee, rules } = input;
  const newKeys = input.newKeys ?? newPersonKeysInReport(snapshot, previousSnapshot);
  const reportMonth = input.reportMonth ?? latestActualMonth(snapshot);
  const reportLabel = reportMonth ? `the ${formatMonthLabel(reportMonth)} report` : "this report";
  const previousRange = actualMonthRangeLabel(previousSnapshot);
  const label = input.labelForSource ?? ((fs: FundingSource) => fs.alias || fs.rawName);

  const isNew = newKeys.has(employeePersonKey(employee));
  const newInReport: MatchSignal = {
    id: "newInReport",
    status: isNew ? "pass" : "fail",
    label: !previousSnapshot
      ? "No earlier report to compare with"
      : isNew
        ? `New in ${reportLabel}${previousRange ? ` — not in ${previousRange}` : ""}`
        : `Already on earlier reports${previousRange ? ` (${previousRange})` : ""}`,
  };

  const first = firstChargedMonth(snapshot, employee.id);
  const within = first !== null && monthsApart(first, plan.startMonth) <= 1;
  const startWindow: MatchSignal = {
    id: "startWindow",
    status: within ? "pass" : "fail",
    label: first
      ? `First charged ${formatMonthLabel(first)} · planned start ${formatMonthLabel(plan.startMonth)}${
          within ? "" : " — more than a month apart"
        }`
      : `No posted pay yet · planned start ${formatMonthLabel(plan.startMonth)}`,
  };

  const planRoots = planAccountKeys(rules, plan.id).map(depletionRootOf);
  const charged = chargedRootsForEmployee(snapshot, employee.id);
  const sharedRoot = planRoots.find((root) => charged.has(root));
  const sharedAccount: MatchSignal =
    planRoots.length === 0
      ? { id: "sharedAccount", status: "neutral", label: "Plan names no accounts — not compared" }
      : sharedRoot
        ? {
            id: "sharedAccount",
            status: "pass",
            label: `Charged to ${label(charged.get(sharedRoot)!)} — an account the plan names`,
          }
        : { id: "sharedAccount", status: "fail", label: "Not charged to any account the plan names" };

  const planRole = plan.role?.trim();
  const payrollTitle = employee.role?.trim();
  const title: MatchSignal = !planRole
    ? { id: "title", status: "neutral", label: "Plan has no role — not compared" }
    : !payrollTitle
      ? { id: "title", status: "neutral", label: "No payroll title on the report — not compared" }
      : titleMatchesRole(payrollTitle, planRole)
        ? { id: "title", status: "pass", label: `Title “${payrollTitle}” matches role “${planRole}”` }
        : { id: "title", status: "fail", label: `Title “${payrollTitle}” does not match role “${planRole}”` };

  const name: MatchSignal = looksLikePlaceholder(plan.displayName)
    ? { id: "name", status: "neutral", label: "Plan has no name — not compared" }
    : namesLooselyMatch(plan.displayName, employee.name)
      ? { id: "name", status: "pass", label: `Name matches: ${employee.name}` }
      : { id: "name", status: "fail", label: `Names differ: ${plan.displayName} vs ${employee.name}` };

  const signals = [newInReport, startWindow, sharedAccount, title, name];
  return {
    signals,
    passCount: signals.filter((s) => s.status === "pass").length,
    firstChargedMonth: first,
  };
}

/** The gate: new in the report, first charged within a month of the start, and one shared signal. */
export function passesSuggestionGate(signals: MatchSignal[]): boolean {
  const by = new Map(signals.map((s) => [s.id, s.status]));
  const shared =
    by.get("sharedAccount") === "pass" || by.get("title") === "pass" || by.get("name") === "pass";
  return by.get("newInReport") === "pass" && by.get("startWindow") === "pass" && shared;
}

export function isPairDismissed(
  dismissals: MatchDismissal[],
  plannedHireId: string,
  employee: Pick<Employee, "id" | "employeeId" | "name">
): boolean {
  const keys = new Set(employeePersonKeys(employee));
  return dismissals.some((d) => d.plannedHireId === plannedHireId && keys.has(d.employeePersonKey));
}

/**
 * Suggested matches between open plans and people new in this report. Never
 * stored — recomputed from the fold, so a re-upload of the same file yields
 * the same set. Name or title alone never suggests; every suggestion carries
 * its five signals for display. Dismissed pairs and linked people are out.
 */
export function suggestMatches(input: {
  snapshot: PayrollReportSnapshot;
  previousSnapshot: PayrollReportSnapshot | null;
  plans: PlannedHire[];
  links: PersonLink[];
  dismissals: MatchDismissal[];
  rules: ProjectionRule[];
  reportMonth?: string | null;
  labelForSource?: (fs: FundingSource) => string;
}): MatchSuggestion[] {
  const { snapshot, previousSnapshot, plans, links, dismissals, rules } = input;
  const newKeys = newPersonKeysInReport(snapshot, previousSnapshot);
  if (newKeys.size === 0) return [];
  const active = links.filter((l) => !l.reversedAt);
  const linkedPlanIds = new Set(active.map((l) => l.plannedHireId));
  const linkedPersonKeys = new Set(active.map((l) => l.employeePersonKey));
  const candidates = snapshot.employees.filter(
    (e) =>
      newKeys.has(employeePersonKey(e)) &&
      !employeePersonKeys(e).some((k) => linkedPersonKeys.has(k))
  );

  const out: MatchSuggestion[] = [];
  for (const plan of plans) {
    if (linkedPlanIds.has(plan.id)) continue;
    for (const employee of candidates) {
      if (isPairDismissed(dismissals, plan.id, employee)) continue;
      const evaluated = evaluateMatchSignals({
        snapshot,
        previousSnapshot,
        plan,
        employee,
        rules,
        newKeys,
        reportMonth: input.reportMonth,
        labelForSource: input.labelForSource,
      });
      if (!passesSuggestionGate(evaluated.signals) || !evaluated.firstChargedMonth) continue;
      out.push({
        plannedHireId: plan.id,
        employeeId: employee.id,
        employeePersonKey: employeePersonKey(employee),
        signals: evaluated.signals,
        passCount: evaluated.passCount,
        firstChargedMonth: evaluated.firstChargedMonth,
      });
    }
  }
  return out.sort((a, b) => b.passCount - a.passCount || a.plannedHireId.localeCompare(b.plannedHireId));
}

/** Stable identity of a suggestion, for "suggestions unchanged" on re-upload. */
export function suggestionPairKey(s: Pick<MatchSuggestion, "plannedHireId" | "employeePersonKey">): string {
  return `${s.plannedHireId}|${s.employeePersonKey}`;
}
