import type { AppSettings, FundingSource } from "@/types";

/** Stable key for aliases — survives clear data + re-import (IDs change each parse). */
export function fundingSourceKey(
  fs: Pick<FundingSource, "accountString" | "rawName">
): string {
  return (fs.accountString ?? fs.rawName).trim().toLowerCase();
}

export type FundingSourceAliasEntry = AppSettings["fundingSourceAliases"][string];

export function getAliasEntry(
  aliases: AppSettings["fundingSourceAliases"],
  fs: FundingSource
): FundingSourceAliasEntry | undefined {
  const key = fundingSourceKey(fs);
  return aliases[key] ?? aliases[fs.id];
}

/** Re-key aliases from legacy per-import IDs to chartstring keys. */
export function migrateAliasKeys(
  aliases: AppSettings["fundingSourceAliases"],
  sources: FundingSource[]
): AppSettings["fundingSourceAliases"] {
  const idToSource = new Map(sources.map((s) => [s.id, s]));
  const result: AppSettings["fundingSourceAliases"] = {};

  for (const [key, entry] of Object.entries(aliases)) {
    const fs = idToSource.get(key);
    const stableKey = fs ? fundingSourceKey(fs) : key;
    if (!result[stableKey]) {
      result[stableKey] = entry;
    }
  }

  return result;
}
