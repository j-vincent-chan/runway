import type { AppSettings, Employee } from "@/types";

export function hiddenFundKey(employeeId: string, fundingSourceId: string): string {
  return `${employeeId}|${fundingSourceId}`;
}

export function isEmployeeFundHidden(
  settings: AppSettings,
  employeeId: string,
  fundingSourceId: string
): boolean {
  const key = hiddenFundKey(employeeId, fundingSourceId);
  return (settings.hiddenEmployeeFunds ?? []).includes(key);
}

export function isRunwayFundAssumedOk(
  settings: AppSettings,
  employeeId: string,
  fundingSourceId: string
): boolean {
  const key = hiddenFundKey(employeeId, fundingSourceId);
  return (settings.runwayAssumedOkFunds ?? []).includes(key);
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

export function countHiddenFundsForEmployee(employeeId: string, settings: AppSettings): number {
  return (settings.hiddenEmployeeFunds ?? []).filter((k) => k.startsWith(`${employeeId}|`)).length;
}

export function countAllHiddenFunds(settings: AppSettings): number {
  return (settings.hiddenEmployeeFunds ?? []).length;
}

export function withoutHiddenFundsForEmployee(
  hidden: string[],
  employeeId: string
): string[] {
  const prefix = `${employeeId}|`;
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
  activePairs: { employeeId: string; fundingSourceId: string; accountKey: string }[],
  settings: AppSettings
): Set<string> {
  const byAccount = new Map<string, { total: number; hidden: number }>();
  for (const pair of activePairs) {
    const entry = byAccount.get(pair.accountKey) ?? { total: 0, hidden: 0 };
    entry.total += 1;
    if (isEmployeeFundHidden(settings, pair.employeeId, pair.fundingSourceId)) entry.hidden += 1;
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
