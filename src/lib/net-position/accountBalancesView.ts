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
  series: NetPositionAccountSeries;
  isHidden: boolean;
  /** Latest reported ending balance */
  displayBalance: number;
  changeFromPrior: number | null;
  /** Latest period expenses from Net Position (withdrawals proxy); 0 when none */
  withdrawals: number;
  /** Assigned account group id when set */
  accountGroupId?: string;
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

/**
 * Prefer a saved alias keyed by fund-dept-project.
 *
 * Payroll chartstrings carry an activity segment that account keys do not, so
 * an alias saved from Timeline is stored under the longer key; the final sweep
 * matches those by root.
 */
export function resolveAccountBalanceAlias(
  aliases: AppSettings["fundingSourceAliases"] | undefined,
  accountKey: string
): string | undefined {
  if (!aliases) return undefined;
  const key = normalizeAccountBalanceKey(accountKey);
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
  aliases?: AppSettings["fundingSourceAliases"];
}): string {
  const alias = resolveAccountBalanceAlias(args.aliases, args.accountKey);
  if (alias) return alias;
  return args.projectDescription || args.project || args.accountKey;
}

/** One row per account in the Net Position Reports on file. */
export function buildAccountBalanceView(args: {
  netPositionImports: NetPositionReportImport[];
  hiddenKeys: string[];
  aliases?: AppSettings["fundingSourceAliases"];
  accountGroupByBalanceKey?: Record<string, string>;
  sort?: AccountBalanceSortKey;
}): AccountBalanceViewItem[] {
  const hidden = new Set(args.hiddenKeys.map(normalizeAccountBalanceKey));
  const groups = args.accountGroupByBalanceKey ?? {};

  const items = buildNetPositionAccountSeries(args.netPositionImports).map((series) => {
    const accountKey = normalizeAccountBalanceKey(series.accountKey);
    return {
      accountKey,
      displayKey: series.accountKey,
      title: resolveTitle({
        accountKey,
        projectDescription: series.projectDescription,
        project: series.project,
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
      series,
      isHidden: hidden.has(accountKey),
      displayBalance: series.latest.endingBalance,
      changeFromPrior: series.changeFromPrior,
      withdrawals: series.latest.expenses,
      accountGroupId: groups[accountKey],
    } satisfies AccountBalanceViewItem;
  });

  return sortAccountBalanceItems(items, args.sort ?? "balanceDesc");
}

export function sortAccountBalanceItems(
  items: AccountBalanceViewItem[],
  sort: AccountBalanceSortKey
): AccountBalanceViewItem[] {
  const list = [...items];
  const bal = (i: AccountBalanceViewItem) => i.displayBalance;
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
    "accountKey" | "displayKey" | "title" | "fund" | "project"
  >
): FundingSource {
  return {
    id: item.accountKey,
    rawName: item.displayKey || item.accountKey,
    alias: item.title,
    accountString: item.displayKey || item.accountKey,
    fund: item.fund || undefined,
    projectId: item.project || undefined,
    color: "#00778b",
  };
}
