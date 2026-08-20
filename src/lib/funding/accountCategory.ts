import type { AccountCategory, AppSettings, FundingSource, FundingSourceTypeDef } from "@/types";
export type { AccountCategory };
import { fundingSourceKey } from "@/lib/funding/sourceKey";
import { DEFAULT_FUNDING_SOURCE_TYPES } from "@/lib/catalog/defaults";

/** @deprecated Prefer getFundingSourceTypes(settings) */
export const ACCOUNT_CATEGORIES = DEFAULT_FUNDING_SOURCE_TYPES.map((c) => ({
  value: c.id as AccountCategory,
  label: c.label,
  pillClass: c.pillClass,
  dotClass: c.dotClass,
}));

export function getFundingSourceTypes(settings: AppSettings): FundingSourceTypeDef[] {
  const types = settings.fundingSourceTypes ?? [];
  if (types.length === 0) return DEFAULT_FUNDING_SOURCE_TYPES;
  return [...types].sort((a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label));
}

export function getAccountCategoryMeta(value: AccountCategory, settings?: AppSettings) {
  const types = settings ? getFundingSourceTypes(settings) : DEFAULT_FUNDING_SOURCE_TYPES;
  const found = types.find((c) => c.id === value);
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

export function getFundingSourceCategory(
  settings: AppSettings,
  fs: FundingSource
): AccountCategory | undefined {
  const key = fundingSourceKey(fs);
  return settings.fundingSourceCategories?.[key] ?? settings.fundingSourceCategories?.[fs.id];
}

/** Re-key categories from legacy per-import IDs to chartstring keys. */
export function migrateCategoryKeys(
  categories: Record<string, AccountCategory> | undefined,
  sources: FundingSource[]
): Record<string, AccountCategory> {
  if (!categories) return {};
  const idToSource = new Map(sources.map((s) => [s.id, s]));
  const result: Record<string, AccountCategory> = {};
  for (const [key, category] of Object.entries(categories)) {
    const fs = idToSource.get(key);
    const stableKey = fs ? fundingSourceKey(fs) : key;
    if (!result[stableKey]) result[stableKey] = category;
  }
  return result;
}

export function ensureFundingSourceTypes(settings: AppSettings): AppSettings {
  if ((settings.fundingSourceTypes?.length ?? 0) > 0) return settings;
  return { ...settings, fundingSourceTypes: DEFAULT_FUNDING_SOURCE_TYPES };
}
