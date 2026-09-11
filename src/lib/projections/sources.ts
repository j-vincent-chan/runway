import type {
  AppSettings,
  Employee,
  FundingSource,
  PayrollReportSnapshot,
  PlannedFundingSource,
} from "@/types";
import type { ProjectionResult } from "@/lib/projections/simulate";
import { fundingSourceKey, getAliasEntry } from "@/lib/funding/sourceKey";
import { normalizeChartstring } from "@/lib/funding/chartstring";
import { resolveDisplayAlias } from "@/lib/funding/alias";
import { FUNDING_COLORS } from "@/types";

export function plannedSourceKey(source: PlannedFundingSource): string {
  return source.chartstringKey;
}

export function chartstringKeyForFundingSource(
  fs: Pick<FundingSource, "accountString" | "rawName" | "id">
): string {
  return fundingSourceKey(fs);
}

/** Planned sources that are not already present in the payroll snapshot. */
export function unmatchedPlannedSources(
  settings: AppSettings,
  snapshot: PayrollReportSnapshot | null
): PlannedFundingSource[] {
  const planned = settings.plannedFundingSources ?? [];
  if (!snapshot) return planned;
  const payrollKeys = new Set(snapshot.fundingSources.map(chartstringKeyForFundingSource));
  return planned.filter((p) => !payrollKeys.has(p.chartstringKey));
}

export function plannedToFundingSource(planned: PlannedFundingSource): FundingSource {
  const account = planned.accountString?.trim();
  return {
    id: planned.id,
    rawName: account || planned.alias,
    alias: planned.alias,
    accountString: account || undefined,
    color: planned.color,
  };
}

export function projectionFundingSources(
  snapshot: PayrollReportSnapshot,
  settings: AppSettings
): FundingSource[] {
  const extra = unmatchedPlannedSources(settings, snapshot).map(plannedToFundingSource);
  return [...snapshot.fundingSources, ...extra];
}

export function lookupFundingSource(
  sources: FundingSource[],
  chartstringKey: string
): FundingSource | undefined {
  return sources.find((fs) => chartstringKeyForFundingSource(fs) === chartstringKey);
}

export function nextPlannedColor(existing: PlannedFundingSource[]): string {
  return FUNDING_COLORS[existing.length % FUNDING_COLORS.length] ?? FUNDING_COLORS[0]!;
}

export function makePlannedChartstringKey(id: string, accountString?: string): string {
  const account = accountString?.trim();
  if (account) return normalizeChartstring(account);
  return `planned:${id}`;
}

/** Alias/title · project # for projection rule pickers (not "Fund 4000"). */
export function projectionSourceLabel(
  fs: FundingSource,
  settings: AppSettings,
  accountTitlesByChartstring?: Map<string, string>
): string {
  const custom = getAliasEntry(settings.fundingSourceAliases, fs)?.alias;
  const accountTitle = fs.accountString
    ? accountTitlesByChartstring?.get(fs.accountString)
    : undefined;
  return resolveDisplayAlias(fs, custom, accountTitle);
}

/**
 * Every chartstring a person's Projections row lists: each account the
 * projection charges them to in any month of the horizon, plus any account
 * one of their rules names (a rule can point at an account that has no
 * effort yet). By Person renders from this and the CSV exports from it, so
 * the file cannot list a different set than the screen.
 */
export function chartstringKeysForPerson(
  result: ProjectionResult,
  settings: AppSettings,
  emp: Employee,
  personKey: string
): Set<string> {
  const keys = new Set<string>();
  for (const state of result.states) {
    for (const a of state.allocations) {
      if (a.employeeId === emp.id) keys.add(a.chartstringKey);
    }
  }
  for (const rule of settings.projectionRules ?? []) {
    if (rule.personKey === personKey && rule.chartstringKey) keys.add(rule.chartstringKey);
  }
  return keys;
}

/**
 * The people an account's By Account block lists: everyone the projection
 * charges to it in any month of the horizon, in first-appearance order.
 */
export function contributorsForSource(
  result: ProjectionResult,
  chartstringKey: string,
  employees: Employee[]
): Employee[] {
  const empById = new Map(employees.map((e) => [e.id, e]));
  const contributors: Employee[] = [];
  const seen = new Set<string>();
  for (const state of result.states) {
    for (const a of state.allocations) {
      if (a.chartstringKey !== chartstringKey || seen.has(a.employeeId)) continue;
      const emp = empById.get(a.employeeId);
      if (emp) {
        seen.add(emp.id);
        contributors.push(emp);
      }
    }
  }
  return contributors;
}
