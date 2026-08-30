import type {
  AppSettings,
  FundingSource,
  PayrollReportSnapshot,
  PlannedFundingSource,
} from "@/types";
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
