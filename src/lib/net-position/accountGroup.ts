import type { AccountGroupDef, AppSettings } from "@/types";
import { normalizeChartstring } from "@/lib/funding/chartstring";

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

export function ensureAccountGroups(settings: AppSettings): AppSettings {
  if (settings.accountGroups) return settings;
  return { ...settings, accountGroups: [] };
}
