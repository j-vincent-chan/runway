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
    pillClass: "bg-slate-200 text-slate-700 ring-1 ring-slate-200/50",
    dotClass: "bg-slate-500",
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
