import type { AccountCategory, AppSettings, FundingSource, FundingSourceTypeDef } from "@/types";
export type { AccountCategory };
import { fundingSourceKey } from "@/lib/funding/sourceKey";
import { chartstringFundDeptProject, normalizeChartstring } from "@/lib/funding/chartstring";
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

/**
 * The funding source type for one payroll account.
 *
 * Types are assigned per account on Settings → Accounts, where a row is a
 * fund-dept-project. A payroll chartstring may carry an activity segment the
 * account key does not, so the root lookup is what makes an account-level
 * assignment reach every chartstring under it. Exact keys still win, so an
 * assignment saved before accounts became the unit of classification is kept.
 */
export function getFundingSourceCategory(
  settings: AppSettings,
  fs: FundingSource
): AccountCategory | undefined {
  const categories = settings.fundingSourceCategories;
  if (!categories) return undefined;
  const key = fundingSourceKey(fs);
  const root = chartstringFundDeptProject(fs.accountString ?? fs.rawName);
  return (
    categories[key] ??
    (root ? categories[root] : undefined) ??
    categories[fs.id]
  );
}

/**
 * The type shown for an Accounts row. Falls back to whatever the payroll
 * chartstrings under this account carry, so an assignment made before
 * accounts became the unit of classification does not read as unset.
 */
export function getFundingSourceCategoryForAccountKey(
  settings: AppSettings,
  accountKey: string,
  fundingSources: FundingSource[]
): AccountCategory | undefined {
  const categories = settings.fundingSourceCategories;
  if (!categories) return undefined;
  const root = normalizeChartstring(accountKey);
  if (categories[root]) return categories[root];
  for (const fs of fundingSources) {
    const chart = fs.accountString ?? fs.rawName;
    if (chartstringFundDeptProject(chart) !== root && normalizeChartstring(chart) !== root) {
      continue;
    }
    const found = categories[fundingSourceKey(fs)] ?? categories[fs.id];
    if (found) return found;
  }
  return undefined;
}

/**
 * Assign a type to an account, clearing any per-chartstring entries beneath
 * it. One account can never show two funding types — which is the only way
 * the Accounts column can be honest about what it is telling you.
 */
export function setCategoryForAccountKey(
  categories: Record<string, AccountCategory> | undefined,
  accountKey: string,
  category: AccountCategory | null
): Record<string, AccountCategory> {
  const root = normalizeChartstring(accountKey);
  const next: Record<string, AccountCategory> = {};
  for (const [key, value] of Object.entries(categories ?? {})) {
    if (normalizeChartstring(key) === root) continue;
    if (chartstringFundDeptProject(key) === root) continue;
    next[key] = value;
  }
  if (category !== null) next[root] = category;
  return next;
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
