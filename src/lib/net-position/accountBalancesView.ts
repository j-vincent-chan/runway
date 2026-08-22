import type {
  AccountBalanceSortKey,
  AppSettings,
  Employee,
  FundingSource,
  MonthlyAllocation,
  NetPositionReportImport,
  PayrollReportSnapshot,
} from "@/types";
import {
  chartstringFundDeptProject,
  normalizeChartstring,
} from "@/lib/funding/chartstring";
import type { MergedPortfolioBalance } from "@/lib/portfolio/mergeBalances";
import {
  buildNetPositionAccountSeries,
  type NetPositionAccountSeries,
} from "@/lib/net-position/buildAccountSeries";
import { getEmployeesOnFundingSource } from "@/lib/funding/accountEmployees";
import { getAccountGroups } from "@/lib/net-position/accountGroup";

/** Canonical Account Balances identity: fund-dept-project, lowercase. */
export function normalizeAccountBalanceKey(key: string): string {
  return normalizeChartstring(key);
}

/** Resolve fund-dept-project key from a MyPortfolio chartstring (may include activity). */
export function accountKeyFromPortfolioChartstring(chartstring: string): string | null {
  return chartstringFundDeptProject(chartstring);
}

export type AccountBalanceDataSource = "netPosition" | "myPortfolio" | "both";

export interface AccountBalanceViewItem {
  /** Normalized fund-dept-project key */
  accountKey: string;
  /** Display form (prefer Net Position casing when available) */
  displayKey: string;
  title: string;
  fund: string;
  fundDescription?: string;
  dept: string;
  deptDescription?: string;
  project: string;
  projectDescription?: string;
  parentAwardId?: string;
  parentAwardDescription?: string;
  busUnit?: string;
  source: AccountBalanceDataSource;
  /** Present when Net Position history exists */
  series: NetPositionAccountSeries | null;
  /** Snapshot balance from MyPortfolio when available */
  portfolioBalance?: number;
  portfolioAsOf?: string;
  portfolioChartstring?: string;
  isHidden: boolean;
  isWatchedFromPortfolio: boolean;
  /** Balance shown in the list (MyPortfolio preferred when both exist) */
  displayBalance: number | null;
  changeFromPrior: number | null;
  /** Latest period expenses from Net Position (withdrawals proxy); 0 when none */
  withdrawals: number;
  /** Assigned account group id when set */
  accountGroupId?: string;
}

export interface PortfolioWatchCandidate {
  accountKey: string;
  displayKey: string;
  chartstring: string;
  title: string;
  fund: string;
  dept: string;
  project: string;
  balance: number;
  reportRunDate: string;
  /** Already appears via a Net Position import */
  hasNetPosition: boolean;
  isWatched: boolean;
}

export const ACCOUNT_BALANCE_SORT_OPTIONS: {
  value: AccountBalanceSortKey;
  label: string;
}[] = [
  { value: "titleAsc", label: "Alphabetically by title" },
  { value: "balanceAsc", label: "Lowest balance" },
  { value: "balanceDesc", label: "Highest balance" },
  { value: "withdrawalsDesc", label: "Highest withdrawals" },
  { value: "withdrawalsAsc", label: "Lowest withdrawals" },
];

function displayBalanceFor(item: {
  series: NetPositionAccountSeries | null;
  portfolioBalance?: number;
}): number | null {
  if (item.portfolioBalance !== undefined) return item.portfolioBalance;
  if (item.series) return item.series.latest.endingBalance;
  return null;
}

/** Prefer saved alias keyed by chartstring or fund-dept-project. */
export function resolveAccountBalanceAlias(
  aliases: AppSettings["fundingSourceAliases"] | undefined,
  accountKey: string,
  portfolioChartstring?: string
): string | undefined {
  if (!aliases) return undefined;
  const key = normalizeAccountBalanceKey(accountKey);
  if (portfolioChartstring) {
    const full = normalizeChartstring(portfolioChartstring);
    if (aliases[full]?.alias?.trim()) return aliases[full]!.alias.trim();
    const root = chartstringFundDeptProject(portfolioChartstring);
    if (root && aliases[root]?.alias?.trim()) return aliases[root]!.alias.trim();
  }
  if (aliases[key]?.alias?.trim()) return aliases[key]!.alias.trim();
  for (const [aliasKey, entry] of Object.entries(aliases)) {
    if (!entry?.alias?.trim()) continue;
    if (chartstringFundDeptProject(aliasKey) === key) return entry.alias.trim();
  }
  return undefined;
}

function resolveTitle(args: {
  accountKey: string;
  projectDescription?: string;
  project?: string;
  portfolioTitle?: string;
  portfolioChartstring?: string;
  aliases?: AppSettings["fundingSourceAliases"];
}): string {
  const alias = resolveAccountBalanceAlias(
    args.aliases,
    args.accountKey,
    args.portfolioChartstring
  );
  if (alias) return alias;
  return (
    args.projectDescription ||
    args.portfolioTitle ||
    args.project ||
    args.accountKey
  );
}

/**
 * Merge Net Position time series with opted-in MyPortfolio accounts.
 * Same fund-dept-project from both sources → one row; MyPortfolio balance
 * supersedes Net Position for the listed balance; NP series kept for trends.
 */
export function buildAccountBalanceView(args: {
  netPositionImports: NetPositionReportImport[];
  portfolioBalances: Map<string, MergedPortfolioBalance>;
  hiddenKeys: string[];
  watchedPortfolioKeys: string[];
  aliases?: AppSettings["fundingSourceAliases"];
  accountGroupByBalanceKey?: Record<string, string>;
  sort?: AccountBalanceSortKey;
}): AccountBalanceViewItem[] {
  const hidden = new Set(args.hiddenKeys.map(normalizeAccountBalanceKey));
  const watched = new Set(args.watchedPortfolioKeys.map(normalizeAccountBalanceKey));
  const groups = args.accountGroupByBalanceKey ?? {};

  const portfolioByAccountKey = new Map<string, MergedPortfolioBalance>();
  for (const row of args.portfolioBalances.values()) {
    const key = accountKeyFromPortfolioChartstring(row.chartstring);
    if (!key) continue;
    const existing = portfolioByAccountKey.get(key);
    if (!existing || row.reportRunDate >= existing.reportRunDate) {
      portfolioByAccountKey.set(key, row);
    }
  }

  const npSeries = buildNetPositionAccountSeries(args.netPositionImports);
  const byKey = new Map<string, AccountBalanceViewItem>();

  for (const series of npSeries) {
    const accountKey = normalizeAccountBalanceKey(series.accountKey);
    const portfolio = portfolioByAccountKey.get(accountKey);
    const source: AccountBalanceDataSource = portfolio ? "both" : "netPosition";
    const item: AccountBalanceViewItem = {
      accountKey,
      displayKey: series.accountKey,
      title: resolveTitle({
        accountKey,
        projectDescription: series.projectDescription,
        project: series.project,
        portfolioTitle: portfolio?.projectTitle,
        portfolioChartstring: portfolio?.chartstring,
        aliases: args.aliases,
      }),
      fund: series.fund,
      fundDescription: series.fundDescription,
      dept: series.dept,
      deptDescription: series.deptDescription,
      project: series.project,
      projectDescription: series.projectDescription,
      parentAwardId: series.parentAwardId,
      parentAwardDescription: series.parentAwardDescription,
      busUnit: series.busUnit,
      source,
      series,
      portfolioBalance: portfolio?.balance,
      portfolioAsOf: portfolio?.reportRunDate,
      portfolioChartstring: portfolio?.chartstring,
      isHidden: hidden.has(accountKey),
      isWatchedFromPortfolio: watched.has(accountKey),
      displayBalance: null,
      // Period delta is NP-only; omit when MyPortfolio owns the listed balance.
      changeFromPrior: portfolio ? null : series.changeFromPrior,
      withdrawals: series.latest.expenses,
      accountGroupId: groups[accountKey],
    };
    item.displayBalance = displayBalanceFor(item);
    byKey.set(accountKey, item);
  }

  for (const watchKey of watched) {
    if (byKey.has(watchKey)) continue;
    const portfolio = portfolioByAccountKey.get(watchKey);
    if (!portfolio) {
      // Watched but no longer in MyPortfolio imports — still list as pending
      byKey.set(watchKey, {
        accountKey: watchKey,
        displayKey: watchKey,
        title: resolveTitle({
          accountKey: watchKey,
          aliases: args.aliases,
        }),
        fund: watchKey.split("-")[0] ?? "",
        dept: watchKey.split("-")[1] ?? "",
        project: watchKey.split("-")[2] ?? "",
        source: "myPortfolio",
        series: null,
        isHidden: hidden.has(watchKey),
        isWatchedFromPortfolio: true,
        displayBalance: null,
        changeFromPrior: null,
        withdrawals: 0,
        accountGroupId: groups[watchKey],
      });
      continue;
    }
    const parts = watchKey.split("-");
    const item: AccountBalanceViewItem = {
      accountKey: watchKey,
      displayKey: chartstringFundDeptProject(portfolio.chartstring) ?? watchKey,
      title: resolveTitle({
        accountKey: watchKey,
        projectDescription: portfolio.projectTitle,
        project: portfolio.project,
        portfolioTitle: portfolio.projectTitle,
        portfolioChartstring: portfolio.chartstring,
        aliases: args.aliases,
      }),
      fund: portfolio.fund || parts[0] || "",
      dept: portfolio.dept || parts[1] || "",
      project: portfolio.project || parts[2] || "",
      projectDescription: portfolio.projectTitle,
      source: "myPortfolio",
      series: null,
      portfolioBalance: portfolio.balance,
      portfolioAsOf: portfolio.reportRunDate,
      portfolioChartstring: portfolio.chartstring,
      isHidden: hidden.has(watchKey),
      isWatchedFromPortfolio: true,
      displayBalance: portfolio.balance,
      changeFromPrior: null,
      withdrawals: 0,
      accountGroupId: groups[watchKey],
    };
    byKey.set(watchKey, item);
  }

  return sortAccountBalanceItems([...byKey.values()], args.sort ?? "balanceDesc");
}

export function sortAccountBalanceItems(
  items: AccountBalanceViewItem[],
  sort: AccountBalanceSortKey
): AccountBalanceViewItem[] {
  const list = [...items];
  const bal = (i: AccountBalanceViewItem) =>
    i.displayBalance ?? Number.NEGATIVE_INFINITY;
  switch (sort) {
    case "titleAsc":
      return list.sort((a, b) => a.title.localeCompare(b.title) || a.accountKey.localeCompare(b.accountKey));
    case "balanceAsc":
      return list.sort((a, b) => bal(a) - bal(b) || a.title.localeCompare(b.title));
    case "withdrawalsDesc":
      return list.sort(
        (a, b) => b.withdrawals - a.withdrawals || a.title.localeCompare(b.title)
      );
    case "withdrawalsAsc":
      return list.sort(
        (a, b) => a.withdrawals - b.withdrawals || a.title.localeCompare(b.title)
      );
    case "balanceDesc":
    default:
      return list.sort((a, b) => bal(b) - bal(a) || a.title.localeCompare(b.title));
  }
}

export function filterAccountBalanceItemsByGroup(
  items: AccountBalanceViewItem[],
  filter: string[] | undefined
): AccountBalanceViewItem[] {
  if (!filter || filter.length === 0) return items;
  const selected = new Set(filter);
  return items.filter((item) => {
    const id = item.accountGroupId;
    if (id == null || id === "") return selected.has("unassigned");
    return selected.has(id);
  });
}

export type AccountBalanceSortGroup = {
  key: string;
  label: string;
  items: AccountBalanceViewItem[];
};

/** Group filtered items under account group section headers when a filter is active. */
export function groupAccountBalanceItems(
  items: AccountBalanceViewItem[],
  settings: AppSettings
): AccountBalanceSortGroup[] {
  const filter = settings.accountGroupFilter;
  if (!filter || filter.length === 0) {
    return [{ key: "all", label: "All accounts", items }];
  }
  const groups = getAccountGroups(settings);
  const buckets = new Map<string, AccountBalanceViewItem[]>();
  for (const g of groups) buckets.set(g.id, []);
  buckets.set("unassigned", []);
  for (const item of items) {
    const id = item.accountGroupId;
    if (id && buckets.has(id)) buckets.get(id)!.push(item);
    else buckets.get("unassigned")!.push(item);
  }
  const selected = new Set(filter);
  const result: AccountBalanceSortGroup[] = [];
  for (const g of groups) {
    if (!selected.has(g.id)) continue;
    const list = buckets.get(g.id) ?? [];
    if (list.length > 0) result.push({ key: g.id, label: g.label, items: list });
  }
  if (selected.has("unassigned")) {
    const unassigned = buckets.get("unassigned") ?? [];
    if (unassigned.length > 0) {
      result.push({ key: "unassigned", label: "Unassigned", items: unassigned });
    }
  }
  return result;
}

/** Always group by account group (for sectioned list when groups exist). */
export function sectionAccountBalanceItemsByGroup(
  items: AccountBalanceViewItem[],
  settings: AppSettings
): AccountBalanceSortGroup[] {
  const groups = getAccountGroups(settings);
  if (groups.length === 0) {
    return [{ key: "all", label: "All accounts", items }];
  }
  const buckets = new Map<string, AccountBalanceViewItem[]>();
  for (const g of groups) buckets.set(g.id, []);
  buckets.set("unassigned", []);
  for (const item of items) {
    const id = item.accountGroupId;
    if (id && buckets.has(id)) buckets.get(id)!.push(item);
    else buckets.get("unassigned")!.push(item);
  }
  const result: AccountBalanceSortGroup[] = [];
  for (const g of groups) {
    const list = buckets.get(g.id) ?? [];
    if (list.length > 0) result.push({ key: g.id, label: g.label, items: list });
  }
  const unassigned = buckets.get("unassigned") ?? [];
  if (unassigned.length > 0) {
    result.push({ key: "unassigned", label: "Unassigned", items: unassigned });
  }
  return result;
}

/** Funding sources whose chartstring root matches a fund-dept-project account key. */
export function fundingSourcesForAccountKey(
  accountKey: string,
  fundingSources: FundingSource[]
): FundingSource[] {
  const key = normalizeAccountBalanceKey(accountKey);
  return fundingSources.filter((fs) => {
    const chart = fs.accountString ?? fs.rawName;
    const root = chartstringFundDeptProject(chart);
    return root === key || normalizeChartstring(chart) === key;
  });
}

/** Employees drawing from any payroll funding source under this account key. */
export function getEmployeesOnAccountKey(
  accountKey: string,
  fundingSources: FundingSource[],
  snapshot: PayrollReportSnapshot | null,
  allocations: MonthlyAllocation[]
): Employee[] {
  if (!snapshot) return [];
  const matching = fundingSourcesForAccountKey(accountKey, fundingSources);
  const byId = new Map<string, Employee>();
  for (const fs of matching) {
    for (const emp of getEmployeesOnFundingSource(fs.id, snapshot, allocations)) {
      byId.set(emp.id, emp);
    }
  }
  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/** Synthetic FundingSource for AliasEditor when no payroll row exists. */
export function syntheticFundingSourceForAccount(
  item: Pick<
    AccountBalanceViewItem,
    "accountKey" | "displayKey" | "title" | "portfolioChartstring" | "fund" | "project"
  >
): FundingSource {
  return {
    id: item.accountKey,
    rawName: item.displayKey || item.accountKey,
    alias: item.title,
    accountString: item.portfolioChartstring || item.displayKey || item.accountKey,
    fund: item.fund || undefined,
    projectId: item.project || undefined,
    color: "#00778b",
  };
}

/** MyPortfolio accounts available to watch on Account Balances. */
export function listPortfolioWatchCandidates(
  portfolioBalances: Map<string, MergedPortfolioBalance>,
  netPositionImports: NetPositionReportImport[],
  watchedPortfolioKeys: string[]
): PortfolioWatchCandidate[] {
  const watched = new Set(watchedPortfolioKeys.map(normalizeAccountBalanceKey));
  const npKeys = new Set(
    buildNetPositionAccountSeries(netPositionImports).map((s) =>
      normalizeAccountBalanceKey(s.accountKey)
    )
  );

  const byKey = new Map<string, PortfolioWatchCandidate>();
  for (const row of portfolioBalances.values()) {
    const accountKey = accountKeyFromPortfolioChartstring(row.chartstring);
    if (!accountKey) continue;
    const existing = byKey.get(accountKey);
    if (existing && row.reportRunDate < existing.reportRunDate) continue;
    byKey.set(accountKey, {
      accountKey,
      displayKey: accountKey,
      chartstring: row.chartstring,
      title: row.projectTitle || row.project || accountKey,
      fund: row.fund || "",
      dept: row.dept || "",
      project: row.project || "",
      balance: row.balance,
      reportRunDate: row.reportRunDate,
      hasNetPosition: npKeys.has(accountKey),
      isWatched: watched.has(accountKey),
    });
  }

  return [...byKey.values()].sort((a, b) => a.title.localeCompare(b.title));
}

export function toggleKeyInList(keys: string[] | undefined, key: string): string[] {
  const norm = normalizeAccountBalanceKey(key);
  const set = new Set((keys ?? []).map(normalizeAccountBalanceKey));
  if (set.has(norm)) set.delete(norm);
  else set.add(norm);
  return [...set];
}
