"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Eye, EyeOff, Plus, X } from "lucide-react";
import { Line, LineChart, Tooltip, XAxis, YAxis } from "recharts";
import { Header } from "@/components/layout/Header";
import { EmptyState } from "@/components/EmptyState";
import { ChartResponsive } from "@/components/charts/ChartResponsive";
import { AliasEditor } from "@/components/funding/AliasEditor";
import { EmployeeAvatarStack } from "@/components/employees/EmployeeAvatarStack";
import { AccountBalanceSort } from "@/components/net-position/AccountBalanceSort";
import { AccountGroupFilter } from "@/components/net-position/AccountGroupFilter";
import { getAccountGroupMeta, getAccountGroups } from "@/lib/net-position/accountGroup";
import { useApp } from "@/context/AppContext";
import {
  buildAccountBalanceView,
  filterAccountBalanceItemsByGroup,
  fundingSourcesForAccountKey,
  getEmployeesOnAccountKey,
  listPortfolioWatchCandidates,
  resolveAccountBalanceAlias,
  sectionAccountBalanceItemsByGroup,
  syntheticFundingSourceForAccount,
  toggleKeyInList,
  type AccountBalanceViewItem,
} from "@/lib/net-position/accountBalancesView";
import {
  netPositionPeriodLabel,
  type NetPositionAccountSeries,
} from "@/lib/net-position/buildAccountSeries";
import { getAliasEntry } from "@/lib/funding/sourceKey";
import { formatCurrency, formatCurrencyBalance, formatIsoDateDisplay } from "@/lib/utils/parse";
import { cn } from "@/lib/utils/cn";
import type { AccountBalanceSortKey } from "@/types";

const SPARK_HEIGHT = 48;
const DETAIL_CHART_HEIGHT = 220;
const BALANCE_COLOR = "#00778b";

function formatPeriodAxis(key: string): string {
  if (/^\d{4}-\d{2}$/.test(key)) {
    const [y, m] = key.split("-");
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return `${months[Number(m) - 1] ?? m} ${y}`;
  }
  return key;
}

function ChangeBadge({ value }: { value: number | null }) {
  if (value === null) return <span className="text-xs text-slate-400">—</span>;
  const positive = value > 0;
  const negative = value < 0;
  return (
    <span
      className={cn(
        "text-xs font-medium tabular-nums",
        positive && "text-emerald-700",
        negative && "text-red-700",
        !positive && !negative && "text-slate-600"
      )}
    >
      {positive ? "+" : ""}
      {formatCurrency(value)}
    </span>
  );
}

function SourceBadge({ source }: { source: AccountBalanceViewItem["source"] }) {
  const label =
    source === "both" ? "Net Position · MyPortfolio" : source === "netPosition" ? "Net Position" : "MyPortfolio";
  return (
    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
      {label}
    </span>
  );
}

function GroupBadge({ groupId }: { groupId?: string }) {
  const { settings } = useApp();
  if (!groupId) return null;
  const meta = getAccountGroupMeta(groupId, settings);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
        meta.pillClass
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", meta.dotClass)} aria-hidden />
      {meta.label}
    </span>
  );
}

function Sparkline({ series }: { series: NetPositionAccountSeries }) {
  if (series.points.length < 2) {
    return <div className="h-12 w-28 text-[10px] text-slate-400">Need 2+ periods</div>;
  }
  const data = series.points.map((p) => ({
    key: p.periodKey,
    balance: p.endingBalance,
  }));
  return (
    <ChartResponsive height={SPARK_HEIGHT} width={112} className="shrink-0">
      <LineChart data={data} margin={{ top: 4, right: 2, left: 2, bottom: 0 }}>
        <Line
          type="monotone"
          dataKey="balance"
          stroke={BALANCE_COLOR}
          strokeWidth={1.5}
          dot={false}
          isAnimationActive={false}
        />
      </LineChart>
    </ChartResponsive>
  );
}

function BalanceTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload?: { label: string; balance: number } }[];
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
      <p className="font-medium text-slate-800">{row.label}</p>
      <p className="mt-1 text-slate-600">
        Ending:{" "}
        <span className="font-medium text-[#0c2340]">{formatCurrencyBalance(row.balance)}</span>
      </p>
    </div>
  );
}

function AccountDetail({ item }: { item: AccountBalanceViewItem }) {
  const series = item.series;

  if (!series) {
    return (
      <div className="space-y-3 border-t border-slate-100 px-5 py-4">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Meta label="Fund" value={item.fund || "—"} />
          <Meta label="Dept" value={item.dept || "—"} />
          <Meta label="Project" value={item.project || "—"} />
          <Meta
            label="Chartstring"
            value={item.portfolioChartstring || item.displayKey || "—"}
          />
        </div>
        {item.portfolioBalance !== undefined ? (
          <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
            MyPortfolio net balance{" "}
            <span className="font-semibold tabular-nums text-[#0c2340]">
              {formatCurrencyBalance(item.portfolioBalance)}
            </span>
            {item.portfolioAsOf && formatIsoDateDisplay(item.portfolioAsOf) ? (
              <span className="text-slate-500">
                {" "}
                as of {formatIsoDateDisplay(item.portfolioAsOf)}
              </span>
            ) : null}
            . Upload a Net Position Report to see ending balance trends over time.
          </p>
        ) : (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            No balance yet for this account. Upload a Net Position Report or a MyPortfolio file that
            includes it.
          </p>
        )}
      </div>
    );
  }

  const chartData = series.points.map((p) => ({
    key: p.periodKey,
    label: formatPeriodAxis(p.periodKey),
    balance: p.endingBalance,
    netChange: p.netChange,
    expenses: p.expenses,
  }));

  return (
    <div className="space-y-4 border-t border-slate-100 px-5 py-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Meta
          label="Fund"
          value={`${series.fund}${series.fundDescription ? ` · ${series.fundDescription}` : ""}`}
        />
        <Meta
          label="Dept"
          value={`${series.dept}${series.deptDescription ? ` · ${series.deptDescription}` : ""}`}
        />
        <Meta
          label="Parent / Award"
          value={
            series.parentAwardId
              ? `${series.parentAwardId}${
                  series.parentAwardDescription ? ` · ${series.parentAwardDescription}` : ""
                }`
              : "—"
          }
        />
        <Meta label="Bus unit" value={series.busUnit || "—"} />
      </div>

      {item.portfolioBalance !== undefined && (
        <p className="text-xs text-slate-500">
          Listed balance uses MyPortfolio
          {item.portfolioAsOf && formatIsoDateDisplay(item.portfolioAsOf)
            ? ` (as of ${formatIsoDateDisplay(item.portfolioAsOf)})`
            : ""}
          . Trend chart and period history use Net Position ending balances
          {series
            ? ` (latest NP: ${formatCurrencyBalance(series.latest.endingBalance)})`
            : ""}
          .
        </p>
      )}

      {series.points.length >= 2 ? (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Ending balance over time
          </p>
          <ChartResponsive height={DETAIL_CHART_HEIGHT}>
            <LineChart data={chartData} margin={{ top: 8, right: 12, left: 8, bottom: 0 }}>
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: "#64748b" }}
                axisLine={{ stroke: "#e2e8f0" }}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: "#64748b" }}
                axisLine={false}
                tickLine={false}
                width={72}
                tickFormatter={(v: number) => formatCurrency(v).replace(".00", "")}
              />
              <Tooltip content={<BalanceTooltip />} />
              <Line
                type="monotone"
                dataKey="balance"
                stroke={BALANCE_COLOR}
                strokeWidth={2}
                dot={{ r: 3, fill: BALANCE_COLOR }}
                isAnimationActive={false}
              />
            </LineChart>
          </ChartResponsive>
        </div>
      ) : null}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-500">
              <th className="pb-2 pr-3 font-semibold">Period</th>
              <th className="pb-2 pr-3 text-right font-semibold">Beginning</th>
              <th className="pb-2 pr-3 text-right font-semibold">Expenses</th>
              <th className="pb-2 pr-3 text-right font-semibold">Net change</th>
              <th className="pb-2 text-right font-semibold">Ending</th>
            </tr>
          </thead>
          <tbody>
            {[...series.points].reverse().map((p) => (
              <tr key={`${p.importId}-${p.periodKey}`} className="border-b border-slate-50">
                <td className="py-2 pr-3 text-slate-700">
                  {netPositionPeriodLabel(p)}
                  <span className="mt-0.5 block text-[11px] text-slate-400">
                    Run {p.reportRunDate}
                  </span>
                </td>
                <td className="py-2 pr-3 text-right tabular-nums text-slate-700">
                  {formatCurrencyBalance(p.beginningBalance)}
                </td>
                <td className="py-2 pr-3 text-right tabular-nums text-slate-700">
                  {formatCurrencyBalance(p.expenses)}
                </td>
                <td className="py-2 pr-3 text-right">
                  <ChangeBadge value={p.netChange} />
                </td>
                <td className="py-2 text-right tabular-nums font-medium text-[#0c2340]">
                  {formatCurrencyBalance(p.endingBalance)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-0.5 text-sm text-slate-700">{value}</p>
    </div>
  );
}

function WatchPortfolioPanel({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const {
    portfolioImports,
    mergedPortfolioBalances,
    netPositionImports,
    settings,
    updateSettings,
  } = useApp();
  const [query, setQuery] = useState("");

  const candidates = useMemo(
    () =>
      listPortfolioWatchCandidates(
        mergedPortfolioBalances,
        netPositionImports,
        settings.watchedPortfolioAccountKeys ?? []
      ),
    [mergedPortfolioBalances, netPositionImports, settings.watchedPortfolioAccountKeys]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter((c) => {
      const hay = [c.title, c.chartstring, c.accountKey, c.fund, c.dept, c.project]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [candidates, query]);

  if (!open) return null;

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-[#0c2340]">Add more accounts</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Add accounts from MyPortfolio that are not already tracked via Net Position Reports.
            Matching uses fund–dept–project (activity segment ignored).
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          aria-label="Close"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {portfolioImports.length === 0 ? (
        <div className="px-4 py-8 text-center text-sm text-slate-600">
          No MyPortfolio files yet.{" "}
          <Link href="/upload" className="font-medium underline hover:text-slate-900">
            Upload on Data Sources
          </Link>
        </div>
      ) : (
        <div className="space-y-3 p-4">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter MyPortfolio accounts…"
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm placeholder:text-slate-400 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600"
          />
          {filtered.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">No accounts match.</p>
          ) : (
            <ul className="max-h-80 space-y-1 overflow-y-auto">
              {filtered.map((c) => {
                const locked = c.hasNetPosition;
                const checked = locked || c.isWatched;
                return (
                  <li key={c.accountKey}>
                    <label
                      className={cn(
                        "flex cursor-pointer items-start gap-3 rounded-lg px-2 py-2 hover:bg-slate-50",
                        locked && "cursor-default opacity-80"
                      )}
                    >
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={checked}
                        disabled={locked}
                        onChange={() => {
                          if (locked) return;
                          updateSettings({
                            watchedPortfolioAccountKeys: toggleKeyInList(
                              settings.watchedPortfolioAccountKeys,
                              c.accountKey
                            ),
                          });
                        }}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium text-[#0c2340]">
                          {c.title}
                        </span>
                        <span className="mt-0.5 block truncate font-mono text-[11px] text-slate-500">
                          {c.chartstring}
                        </span>
                        {locked ? (
                          <span className="mt-1 inline-block text-[10px] font-medium text-teal-700">
                            Already on list from Net Position
                          </span>
                        ) : null}
                      </span>
                      <span className="shrink-0 text-right text-sm tabular-nums text-slate-700">
                        {formatCurrency(c.balance)}
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function AccountCard({
  item,
  open,
  onToggleExpand,
  onToggleHidden,
}: {
  item: AccountBalanceViewItem;
  open: boolean;
  onToggleExpand: () => void;
  onToggleHidden: () => void;
}) {
  const {
    snapshot,
    allocations,
    fundingSources,
    settings,
    portfolioTitlesByChartstring,
    updateFundingSourceAlias,
  } = useApp();

  const matchingSources = useMemo(
    () => fundingSourcesForAccountKey(item.accountKey, fundingSources),
    [item.accountKey, fundingSources]
  );
  const primarySource = matchingSources[0] ?? syntheticFundingSourceForAccount(item);
  const employees = useMemo(
    () => getEmployeesOnAccountKey(item.accountKey, fundingSources, snapshot, allocations),
    [item.accountKey, fundingSources, snapshot, allocations]
  );

  const aliasEntry = matchingSources[0]
    ? getAliasEntry(settings.fundingSourceAliases, matchingSources[0])
    : undefined;
  const customAlias =
    aliasEntry?.alias ??
    resolveAccountBalanceAlias(
      settings.fundingSourceAliases,
      item.accountKey,
      item.portfolioChartstring
    );
  const portfolioTitle =
    (primarySource.accountString
      ? portfolioTitlesByChartstring.get(primarySource.accountString)
      : undefined) ?? item.projectDescription;

  return (
    <li
      className={cn(
        "overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-colors",
        "hover:border-slate-300 hover:bg-slate-50/80",
        open && "border-teal-200 ring-1 ring-teal-100",
        item.isHidden && "opacity-70"
      )}
    >
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center gap-2 px-3 py-3 sm:gap-3 sm:px-5 sm:py-4"
        onClick={onToggleExpand}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggleExpand();
          }
        }}
      >
        <button
          type="button"
          title={item.isHidden ? "Show on Account Balances" : "Hide from Account Balances"}
          aria-label={item.isHidden ? "Unhide account" : "Hide account"}
          className="shrink-0 rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
          onClick={(e) => {
            e.stopPropagation();
            onToggleHidden();
          }}
        >
          {item.isHidden ? (
            <EyeOff className="h-3.5 w-3.5" />
          ) : (
            <Eye className="h-3.5 w-3.5" />
          )}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <div
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
            >
              <AliasEditor
                source={primarySource}
                customAlias={customAlias}
                portfolioTitle={portfolioTitle}
                showProjectSuffix={false}
                fullWidth
                onSave={(base) => {
                  updateFundingSourceAlias(primarySource.id, base);
                }}
              />
            </div>
            <SourceBadge source={item.source} />
            <GroupBadge groupId={item.accountGroupId} />
            {item.isHidden ? (
              <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
                Hidden
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 truncate text-xs text-slate-500">
            {item.displayKey}
            {item.parentAwardDescription
              ? ` · ${item.parentAwardDescription}`
              : item.parentAwardId
                ? ` · ${item.parentAwardId}`
                : ""}
          </p>
        </div>

        {employees.length > 0 ? (
          <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
            <EmployeeAvatarStack employees={employees} settings={settings} />
          </div>
        ) : null}

        {item.series ? (
          <Sparkline series={item.series} />
        ) : (
          <div className="hidden h-12 w-28 shrink-0 items-center text-[10px] text-slate-400 sm:flex">
            Snapshot only
          </div>
        )}
        <div className="hidden w-28 shrink-0 text-right sm:block">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            vs prior
          </p>
          <ChangeBadge value={item.changeFromPrior} />
        </div>
        <div className="w-28 shrink-0 text-right sm:w-32">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
            Ending
          </p>
          <p
            className={cn(
              "text-base font-semibold tabular-nums",
              item.displayBalance !== null && item.displayBalance < 0
                ? "text-red-700"
                : "text-[#0c2340]"
            )}
          >
            {item.displayBalance !== null ? formatCurrency(item.displayBalance) : "—"}
          </p>
        </div>
      </div>
      {open ? <AccountDetail item={item} /> : null}
    </li>
  );
}

export default function AccountBalancesPage() {
  const {
    netPositionImports,
    portfolioImports,
    mergedPortfolioBalances,
    settings,
    updateSettings,
  } = useApp();
  const [query, setQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showHidden, setShowHidden] = useState(false);
  const [watchPanelOpen, setWatchPanelOpen] = useState(false);

  const sortKey: AccountBalanceSortKey = settings.accountBalanceSort ?? "balanceDesc";
  const accountGroups = getAccountGroups(settings);

  const allItems = useMemo(
    () =>
      buildAccountBalanceView({
        netPositionImports,
        portfolioBalances: mergedPortfolioBalances,
        hiddenKeys: settings.hiddenAccountBalanceKeys ?? [],
        watchedPortfolioKeys: settings.watchedPortfolioAccountKeys ?? [],
        aliases: settings.fundingSourceAliases,
        accountGroupByBalanceKey: settings.accountGroupByBalanceKey,
        sort: sortKey,
      }),
    [
      netPositionImports,
      mergedPortfolioBalances,
      settings.hiddenAccountBalanceKeys,
      settings.watchedPortfolioAccountKeys,
      settings.fundingSourceAliases,
      settings.accountGroupByBalanceKey,
      sortKey,
    ]
  );

  const hiddenCount = useMemo(() => allItems.filter((i) => i.isHidden).length, [allItems]);

  const visibleItems = useMemo(() => {
    if (showHidden) return allItems;
    return allItems.filter((i) => !i.isHidden);
  }, [allItems, showHidden]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = filterAccountBalanceItemsByGroup(visibleItems, settings.accountGroupFilter);
    if (!q) return list;
    return list.filter((s) => {
      const hay = [
        s.accountKey,
        s.displayKey,
        s.title,
        s.project,
        s.projectDescription,
        s.fund,
        s.fundDescription,
        s.dept,
        s.deptDescription,
        s.parentAwardId,
        s.parentAwardDescription,
        s.portfolioChartstring,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [visibleItems, query, settings.accountGroupFilter]);

  const sections = useMemo(
    () => sectionAccountBalanceItemsByGroup(filtered, settings),
    [filtered, settings]
  );

  const totalEnding = useMemo(
    () =>
      filtered.reduce((sum, s) => {
        if (s.isHidden && !showHidden) return sum;
        return sum + (s.displayBalance ?? 0);
      }, 0),
    [filtered, showHidden]
  );

  const latestPeriod = useMemo(() => {
    for (const item of allItems) {
      if (item.series?.latest) return netPositionPeriodLabel(item.series.latest);
    }
    return null;
  }, [allItems]);

  const hasAnySource = netPositionImports.length > 0 || portfolioImports.length > 0;
  const hasVisibleContent = allItems.length > 0;

  const toggleHidden = (accountKey: string) => {
    updateSettings({
      hiddenAccountBalanceKeys: toggleKeyInList(settings.hiddenAccountBalanceKeys, accountKey),
    });
  };

  return (
    <>
      <Header
        ledgerTitle
        title="Account Balances"
        subtitle="Ending balances for watched accounts · MyPortfolio balance wins when both sources overlap"
        topAction={
          hasAnySource ? { label: "Upload another", href: "/upload" } : undefined
        }
      />
      <main className="flex-1 overflow-auto bg-slate-50/60 p-6">
        <div className="mx-auto max-w-7xl space-y-6">
          {!hasAnySource ? (
            <EmptyState
              title="No account balance data yet"
              message="Upload a Net Position Report and/or MyPortfolio file on the Upload page. Net Position accounts appear here automatically; pick MyPortfolio accounts to watch."
              actionLabel="Go to Upload"
              actionHref="/upload"
            />
          ) : !hasVisibleContent && !watchPanelOpen ? (
            <div className="space-y-4">
              <EmptyState
                title="No accounts on this list yet"
                message={
                  netPositionImports.length === 0
                    ? "Upload a Net Position Report, or add more accounts below."
                    : "All accounts are hidden, or there is nothing to show."
                }
                actionLabel="Go to Upload"
                actionHref="/upload"
              />
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={() => setWatchPanelOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50"
                >
                  <Plus className="h-4 w-4" />
                  Add more accounts
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div className="flex flex-wrap gap-6">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                      Accounts
                    </p>
                    <p className="text-lg font-semibold tabular-nums text-[#0c2340]">
                      {filtered.length}
                      {filtered.length !== visibleItems.length ? (
                        <span className="text-sm font-normal text-slate-500">
                          {" "}
                          of {visibleItems.length}
                        </span>
                      ) : null}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                      Total ending
                    </p>
                    <p className="text-lg font-semibold tabular-nums text-[#0c2340]">
                      {formatCurrency(totalEnding)}
                    </p>
                  </div>
                  {latestPeriod && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                        Latest NP period
                      </p>
                      <p className="text-lg font-semibold text-[#0c2340]">{latestPeriod}</p>
                    </div>
                  )}
                </div>
                <div className="flex flex-wrap items-end gap-3">
                  <AccountBalanceSort
                    value={sortKey}
                    onChange={(key) => updateSettings({ accountBalanceSort: key })}
                  />
                  {accountGroups.length > 0 ? (
                    <AccountGroupFilter
                      value={settings.accountGroupFilter ?? []}
                      onChange={(ids) => updateSettings({ accountGroupFilter: ids })}
                    />
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setWatchPanelOpen((v) => !v)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium",
                      watchPanelOpen
                        ? "border-teal-600 bg-teal-50 text-teal-800"
                        : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                    )}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add more accounts
                  </button>
                  {hiddenCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowHidden((v) => !v)}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium",
                        showHidden
                          ? "border-teal-600 bg-teal-50 text-teal-800"
                          : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                      )}
                    >
                      {showHidden ? (
                        <EyeOff className="h-3.5 w-3.5" />
                      ) : (
                        <Eye className="h-3.5 w-3.5" />
                      )}
                      {showHidden ? "Collapse hidden" : `Show hidden (${hiddenCount})`}
                    </button>
                  )}
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Filter by project, fund, dept…"
                    className="w-full max-w-xs rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm placeholder:text-slate-400 focus:border-teal-600 focus:outline-none focus:ring-1 focus:ring-teal-600"
                  />
                </div>
              </div>

              <p className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
                {netPositionImports.length} Net Position report
                {netPositionImports.length === 1 ? "" : "s"}
                {portfolioImports.length > 0
                  ? ` · ${portfolioImports.length} MyPortfolio file${
                      portfolioImports.length === 1 ? "" : "s"
                    }`
                  : ""}
                .{" "}
                <Link href="/upload" className="font-medium underline hover:text-slate-900">
                  Manage uploads
                </Link>
              </p>

              {watchPanelOpen ? (
                <WatchPortfolioPanel open onClose={() => setWatchPanelOpen(false)} />
              ) : null}

              {!hasVisibleContent ? (
                <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-sm text-slate-600">
                  No accounts on the list yet. Add more accounts above, or upload a Net Position
                  Report.
                </div>
              ) : filtered.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 bg-white px-6 py-12 text-center text-sm text-slate-600">
                  {query.trim()
                    ? `No accounts match “${query.trim()}”.`
                    : (settings.accountGroupFilter?.length ?? 0) > 0
                      ? "No accounts in the selected account groups."
                      : hiddenCount > 0 && !showHidden
                        ? `All ${hiddenCount} account${hiddenCount === 1 ? "" : "s"} are hidden. Use “Show hidden” to restore.`
                        : "No accounts to show."}
                </div>
              ) : (
                <div className="space-y-6">
                  {sections.map((section) => (
                    <div key={section.key} className="space-y-3">
                      {accountGroups.length > 0 && section.key !== "all" ? (
                        <h3 className="flex items-center gap-2 text-sm font-semibold text-[#0c2340]">
                          {section.key !== "unassigned" ? (
                            <span
                              className={cn(
                                "h-2.5 w-2.5 rounded-full",
                                getAccountGroupMeta(section.key, settings).dotClass
                              )}
                              aria-hidden
                            />
                          ) : (
                            <span className="h-2.5 w-2.5 rounded-full bg-slate-400" aria-hidden />
                          )}
                          {section.label}
                          <span className="font-normal text-slate-500">
                            ({section.items.length})
                          </span>
                        </h3>
                      ) : null}
                      <ul className="space-y-3">
                        {section.items.map((s) => (
                          <AccountCard
                            key={s.accountKey}
                            item={s}
                            open={expandedId === s.accountKey}
                            onToggleExpand={() =>
                              setExpandedId((id) =>
                                id === s.accountKey ? null : s.accountKey
                              )
                            }
                            onToggleHidden={() => toggleHidden(s.accountKey)}
                          />
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </main>
    </>
  );
}
