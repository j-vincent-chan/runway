import type { AppSettings, Employee, FundingSource } from "@/types";
import { employeePersonKey } from "@/lib/employees/stableKey";
import { fundingSourceKey } from "@/lib/funding/sourceKey";

export function hiddenFundKey(employeeId: string, fundingSourceId: string): string {
  return `${employeeId}|${fundingSourceId}`;
}

/**
 * Re-key hiddenEmployeeFunds from legacy per-import ids to stable keys —
 * mirrors migrateAliasKeys (src/lib/funding/sourceKey.ts). Splits on the
 * first "|": employeePersonKey output never contains "|" (always "hr:..." or
 * "name:..."), so that half is always safe to split on even if a raw
 * chartstring/rawName happened to contain one.
 */
export function migrateHiddenFundKeys(
  hidden: string[],
  employees: Employee[],
  fundingSources: FundingSource[]
): string[] {
  const idToEmployee = new Map(employees.map((e) => [e.id, e]));
  const idToSource = new Map(fundingSources.map((f) => [f.id, f]));
  const result = new Set<string>();

  for (const key of hidden) {
    const sep = key.indexOf("|");
    if (sep === -1) {
      result.add(key);
      continue;
    }
    const empPart = key.slice(0, sep);
    const fundPart = key.slice(sep + 1);
    const emp = idToEmployee.get(empPart);
    const fs = idToSource.get(fundPart);
    const stableEmp = emp ? employeePersonKey(emp) : empPart;
    const stableFund = fs ? fundingSourceKey(fs) : fundPart;
    result.add(hiddenFundKey(stableEmp, stableFund));
  }

  return [...result];
}

/**
 * Keyed by stable identity (employeePersonKey/fundingSourceKey), not the raw
 * per-parse ids on Employee/FundingSource — those are reassigned whenever a
 * re-import folds snapshots together, which would otherwise silently detach
 * an existing hide from the person/fund it was set for.
 */
export function isEmployeeFundHidden(
  settings: AppSettings,
  employee: Pick<Employee, "id" | "employeeId" | "name">,
  fundingSource: Pick<FundingSource, "accountString" | "rawName">
): boolean {
  const key = hiddenFundKey(employeePersonKey(employee), fundingSourceKey(fundingSource));
  return (settings.hiddenEmployeeFunds ?? []).includes(key);
}

export function getEffectiveExpectedPercent(employee: Employee, settings: AppSettings): number {
  const scope = settings.employeePlanningScope?.[employee.id];
  return scope !== undefined ? scope : employee.appointmentPercent;
}

export interface CoverageOptions {
  excludedFundingSourceIds?: Set<string>;
  expectedPercentOverride?: number;
}

export function coverageOptionsFromSettings(
  employee: Employee,
  settings: AppSettings
): CoverageOptions | undefined {
  const scope = settings.employeePlanningScope?.[employee.id];
  if (scope === undefined) return undefined;
  return { expectedPercentOverride: scope };
}

export function countHiddenFundsForEmployee(
  employee: Pick<Employee, "id" | "employeeId" | "name">,
  settings: AppSettings
): number {
  const prefix = `${employeePersonKey(employee)}|`;
  return (settings.hiddenEmployeeFunds ?? []).filter((k) => k.startsWith(prefix)).length;
}

export function countAllHiddenFunds(settings: AppSettings): number {
  return (settings.hiddenEmployeeFunds ?? []).length;
}

/** `employeeKey` is a stable key (employeePersonKey), not a raw employee id. */
export function withoutHiddenFundsForEmployee(
  hidden: string[],
  employeeKey: string
): string[] {
  const prefix = `${employeeKey}|`;
  return hidden.filter((k) => !k.startsWith(prefix));
}

/**
 * Accounts that are hidden on Runway/Timeline for every person charging them.
 *
 * The per-person hide (`hiddenEmployeeFunds`, keyed employee|fund) and the
 * account-level one (`hiddenAccountBalanceKeys`, keyed fund-dept-project) are
 * different scopes, so hiding one person's row must not remove an account that
 * other staff are still paid from — that would conceal a live funding problem.
 * An account only counts as hidden once nobody has it visible.
 *
 * Derived, never stored: unhiding a person's fund brings the account straight
 * back without any state to reconcile.
 */
export function accountsHiddenForEveryone(
  activePairs: { employee: Employee; fundingSource: FundingSource; accountKey: string }[],
  settings: AppSettings
): Set<string> {
  const byAccount = new Map<string, { total: number; hidden: number }>();
  for (const pair of activePairs) {
    const entry = byAccount.get(pair.accountKey) ?? { total: 0, hidden: 0 };
    entry.total += 1;
    if (isEmployeeFundHidden(settings, pair.employee, pair.fundingSource)) entry.hidden += 1;
    byAccount.set(pair.accountKey, entry);
  }

  const out = new Set<string>();
  for (const [accountKey, { total, hidden }] of byAccount) {
    if (total > 0 && hidden === total) out.add(accountKey);
  }
  return out;
}

/**
 * The hidden set Account Balances and Settings should both honour: explicit
 * hides, plus accounts hidden on Runway for everyone, minus anything the user
 * has explicitly revealed.
 */
export function effectiveHiddenAccountKeys(
  settings: AppSettings,
  hiddenForEveryone: Set<string>
): string[] {
  const revealed = new Set(settings.unhiddenAccountBalanceKeys ?? []);
  const all = new Set([...(settings.hiddenAccountBalanceKeys ?? []), ...hiddenForEveryone]);
  return [...all].filter((key) => !revealed.has(key));
}
