import type { AccountGroupDef, AppSettings } from "@/types";
import { normalizeChartstring } from "@/lib/funding/chartstring";
import {
  DEFAULT_ACCOUNT_GROUPS,
  NOT_MY_ACCOUNTS_GROUP_ID,
} from "@/lib/catalog/defaults";

export function getAccountGroups(settings: AppSettings): AccountGroupDef[] {
  const groups = settings.accountGroups ?? [];
  return [...groups].sort(
    (a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label)
  );
}

export function getAccountGroupMeta(value: string, settings?: AppSettings) {
  const groups = settings ? getAccountGroups(settings) : [];
  const found = groups.find((g) => g.id === value);
  if (found) {
    return {
      value: found.id,
      label: found.label,
      pillClass: found.pillClass,
      dotClass: found.dotClass,
      chartColor: found.chartColor,
    };
  }
  return {
    value,
    label: value,
    pillClass: "bg-inset text-ink-2 ring-1 ring-rule",
    dotClass: "bg-muted",
    chartColor: "#94a3b8",
  };
}

export function getAccountGroupForBalanceKey(
  settings: AppSettings,
  accountKey: string
): string | undefined {
  const key = normalizeChartstring(accountKey);
  return settings.accountGroupByBalanceKey?.[key];
}

/**
 * Guarantee both built-in groups exist, without disturbing custom ones.
 *
 * Deliberately not an early return on `settings.accountGroups` being present:
 * every existing workspace already has an empty array there, and a short-circuit
 * would skip seeding for exactly the users who need it.
 */
export function ensureAccountGroups(settings: AppSettings): AppSettings {
  const existing = settings.accountGroups ?? [];
  const missing = DEFAULT_ACCOUNT_GROUPS.filter(
    (d) => !existing.some((g) => g.id === d.id)
  );
  if (missing.length === 0) return settings;
  return { ...settings, accountGroups: [...missing, ...existing] };
}

/** True when this account is one the user does not control. */
export function isNotMyAccountKey(settings: AppSettings, accountKey: string): boolean {
  return getAccountGroupForBalanceKey(settings, accountKey) === NOT_MY_ACCOUNTS_GROUP_ID;
}

/**
 * Convert a pre-group workspace: "not my account" used to be stored per
 * person-and-fund in `runwayAssumedOkFunds`, with end dates keyed the same way.
 * Both move up to the account, which is what they were always describing.
 *
 * Where two people marked one account with different end dates the later wins —
 * the account is funded until the last person stops drawing on it, the same rule
 * the depletion estimate already applies.
 *
 * Idempotent, and returns the input untouched when there is nothing to convert,
 * so it does not trigger a settings write on every load.
 */
export function migrateAssumedOkToAccountGroups(
  settings: AppSettings,
  accountKeyForFundingSourceId: (fundingSourceId: string) => string | null
): AppSettings {
  const marked = settings.runwayAssumedOkFunds ?? [];
  const oldDates = settings.runwayAssumedEndDates ?? {};
  const pairKeys = Object.keys(oldDates).filter((k) => k.includes("|"));
  if (marked.length === 0 && pairKeys.length === 0) return settings;

  const groups = { ...(settings.accountGroupByBalanceKey ?? {}) };
  const dates = { ...oldDates };

  for (const pair of marked) {
    const [, fundingSourceId] = pair.split("|");
    const accountKey = fundingSourceId ? accountKeyForFundingSourceId(fundingSourceId) : null;
    if (accountKey) groups[normalizeChartstring(accountKey)] = NOT_MY_ACCOUNTS_GROUP_ID;
  }

  for (const pair of pairKeys) {
    const [, fundingSourceId] = pair.split("|");
    const accountKey = fundingSourceId ? accountKeyForFundingSourceId(fundingSourceId) : null;
    delete dates[pair];
    if (!accountKey) continue;
    const key = normalizeChartstring(accountKey);
    const existing = dates[key];
    if (!existing || oldDates[pair]! > existing) dates[key] = oldDates[pair]!;
  }

  return {
    ...settings,
    accountGroupByBalanceKey: groups,
    runwayAssumedEndDates: dates,
    // The old store is dead; leaving it would invite something to read it again.
    runwayAssumedOkFunds: [],
  };
}
