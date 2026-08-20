import type { AccountCategory, AppSettings, FundingSource } from "@/types";
export type { AccountCategory };
import { fundingSourceKey } from "@/lib/funding/sourceKey";

export const ACCOUNT_CATEGORIES: {
  value: AccountCategory;
  label: string;
  pillClass: string;
  dotClass: string;
}[] = [
  {
    value: "startup",
    label: "Start-up",
    pillClass: "bg-[#0c2340] text-white ring-1 ring-[#0c2340]/30",
    dotClass: "bg-slate-200",
  },
  {
    value: "projects",
    label: "Projects",
    pillClass: "bg-[#f4a89a] text-[#5c2018] ring-1 ring-[#f4a89a]/50",
    dotClass: "bg-[#b42318]",
  },
  {
    value: "endowment",
    label: "Endowment",
    pillClass: "bg-[#9ee0c4] text-[#134d32] ring-1 ring-[#9ee0c4]/50",
    dotClass: "bg-[#047857]",
  },
  {
    value: "institutional",
    label: "Institutional support",
    pillClass: "bg-[#f5d76e] text-[#5c4a0a] ring-1 ring-[#f5d76e]/50",
    dotClass: "bg-[#a16207]",
  },
  {
    value: "largeGrants",
    label: "Large grants",
    pillClass: "bg-[#c4b5fd] text-[#3b2667] ring-1 ring-[#c4b5fd]/50",
    dotClass: "bg-[#6d28d9]",
  },
  {
    value: "researchPlanReviews",
    label: "Research plan reviews",
    pillClass: "bg-[#93c5fd] text-[#1e3a5f] ring-1 ring-[#93c5fd]/50",
    dotClass: "bg-[#1d4ed8]",
  },
];

export function getAccountCategoryMeta(value: AccountCategory) {
  return ACCOUNT_CATEGORIES.find((c) => c.value === value)!;
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
