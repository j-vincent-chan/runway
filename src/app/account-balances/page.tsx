"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
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
  normalizeAccountBalanceKey,
  resolveAccountBalanceAlias,
  sectionAccountBalanceItemsByGroup,
  syntheticFundingSourceForAccount,
  type AccountBalanceViewItem,
} from "@/lib/net-position/accountBalancesView";
import {
  netPositionPeriodLabel,
  type NetPositionAccountSeries,
} from "@/lib/net-position/buildAccountSeries";
import { getAliasEntry } from "@/lib/funding/sourceKey";
import { formatCurrency, formatCurrencyBalance } from "@/lib/utils/parse";
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
  if (value === null) return <span className="text-xs text-muted">—</span>;
  const positive = value > 0;
  const negative = value < 0;
  return (
    <span
      className={cn(
        "text-xs font-medium tabular-nums",
        positive && "text-healthy",
        negative && "text-critical",
        !positive && !negative && "text-ink-2"
      )}
    >
      {positive ? "+" : ""}
      {formatCurrency(value)}
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
        "inline-flex items-center gap-1 rounded-full bg-inset px-1.5 py-0.5 text-[10px] font-medium text-ink-2 ring-1 ring-rule"
      )}
      title={meta.label}
    >
      {meta.label}
    </span>
  );
}

function Sparkline({ series }: { series: NetPositionAccountSeries }) {
  if (series.points.length < 2) {
    return <div className="h-12 w-28 text-[10px] text-muted">Need 2+ periods</div>;
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
    <div className="rounded-lg border border-rule bg-surface px-3 py-2 text-xs shadow-md">
      <p className="font-medium text-ink">{row.label}</p>
      <p className="mt-1 text-ink-2">
        Ending:{" "}
        <span className="font-medium text-ink">{formatCurrencyBalance(row.balance)}</span>
      </p>
    </div>
  );
}

function AccountDetail({ item }: { item: AccountBalanceViewItem }) {
  const series = item.series;

  const chartData = series.points.map((p) => ({
    key: p.periodKey,
    label: formatPeriodAxis(p.periodKey),
    balance: p.endingBalance,
    netChange: p.netChange,
    expenses: p.expenses,
  }));

  return (
    <div className="space-y-4 border-t border-rule px-5 py-4">
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

      {series.points.length >= 2 ? (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
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
            <tr className="border-b border-rule text-xs uppercase tracking-wide text-muted">
              <th className="pb-2 pr-3 font-semibold">Period</th>
              <th className="pb-2 pr-3 text-right font-semibold">Beginning</th>
              <th className="pb-2 pr-3 text-right font-semibold">Expenses</th>
              <th className="pb-2 pr-3 text-right font-semibold">Net change</th>
              <th className="pb-2 text-right font-semibold">Ending</th>
            </tr>
          </thead>
          <tbody>
            {[...series.points].reverse().map((p) => (
              <tr key={`${p.importId}-${p.periodKey}`} className="border-b border-rule">
                <td className="py-2 pr-3 text-ink-2">
                  {netPositionPeriodLabel(p)}
                  <span className="mt-0.5 block text-[11px] text-muted">
                    Run {p.reportRunDate}
                  </span>
                </td>
                <td className="py-2 pr-3 text-right tabular-nums text-ink-2">
                  {formatCurrencyBalance(p.beginningBalance)}
                </td>
                <td className="py-2 pr-3 text-right tabular-nums text-ink-2">
                  {formatCurrencyBalance(p.expenses)}
                </td>
                <td className="py-2 pr-3 text-right">
                  <ChangeBadge value={p.netChange} />
                </td>
                <td className="py-2 text-right tabular-nums font-medium text-ink">
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
      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-0.5 text-sm text-ink-2">{value}</p>
    </div>
  );
}

function AccountCard({
  item,
  open,
  showPriorColumn,
  onToggleExpand,
  onToggleHidden,
}: {
  item: AccountBalanceViewItem;
  open: boolean;
  /** False when no visible account has two periods — the column would be all em-dashes. */
  showPriorColumn: boolean;
  onToggleExpand: () => void;
  onToggleHidden: () => void;
}) {
  const {
    snapshot,
    allocations,
    fundingSources,
    settings,
    accountTitlesByChartstring,
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
    resolveAccountBalanceAlias(settings.fundingSourceAliases, item.accountKey);
  const accountTitle =
    (primarySource.accountString
      ? accountTitlesByChartstring.get(primarySource.accountString)
      : undefined) ?? item.projectDescription;

  return (
    /* One row in the section's shared bordered block — an account is a row in
       a ledger, not its own card. The expanded row tints instead of ringing so
       it needs no rounded corners mid-block. */
    <li
      className={cn(
        "transition-colors",
        "hover:bg-inset/80",
        open && "bg-accent-soft/40",
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
          className="shrink-0 rounded p-1 text-muted hover:bg-inset hover:text-ink"
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
                accountTitle={accountTitle}
                showProjectSuffix={false}
                fullWidth
                onSave={(base) => {
                  updateFundingSourceAlias(primarySource.id, base);
                }}
              />
            </div>
            <GroupBadge groupId={item.accountGroupId} />
            {item.isHidden ? (
              <span className="text-[10px] font-medium uppercase tracking-wide text-muted">
                Hidden
              </span>
            ) : null}
          </div>
          <p className="mt-0.5 truncate text-xs text-muted">
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
          <div className="hidden h-12 w-28 shrink-0 items-center text-[10px] text-muted sm:flex">
            Snapshot only
          </div>
        )}
        {showPriorColumn && (
          <div className="hidden w-28 shrink-0 text-right sm:block">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
              vs prior
            </p>
            <ChangeBadge value={item.changeFromPrior} />
          </div>
        )}
        <div className="w-28 shrink-0 text-right sm:w-32">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
            Ending
          </p>
          <p
            className={cn(
              "text-base font-semibold tabular-nums",
              item.displayBalance !== null && item.displayBalance < 0
                ? "text-critical"
                : "text-ink"
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
    settings,
    hiddenAccountKeys,
    updateSettings,
  } = useApp();
  const [query, setQuery] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showHidden, setShowHidden] = useState(false);

  const sortKey: AccountBalanceSortKey = settings.accountBalanceSort ?? "balanceDesc";
  const accountGroups = getAccountGroups(settings);

  const allItems = useMemo(
    () =>
      buildAccountBalanceView({
        netPositionImports,
        hiddenKeys: hiddenAccountKeys,
        aliases: settings.fundingSourceAliases,
        accountGroupByBalanceKey: settings.accountGroupByBalanceKey,
        sort: sortKey,
      }),
    [
      netPositionImports,
      hiddenAccountKeys,
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

  /**
   * With a single Net Position period, every "vs prior" is an em-dash — a
   * whole column saying the same nothing on every row. One sentence above the
   * list says it instead, and the column returns when a second period exists.
   */
  const anyPriorData = useMemo(
    () => visibleItems.some((i) => i.changeFromPrior !== null),
    [visibleItems]
  );

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

  const hasAnySource = netPositionImports.length > 0;
  const hasVisibleContent = allItems.length > 0;

  /**
   * Writes both lists, because an account can be hidden without ever being in
   * hiddenAccountBalanceKeys — hiding the fund for every person on Runway
   * hides it too, and that is derived. Revealing therefore has to be recorded
   * explicitly or the derived rule would immediately hide it again.
   */
  const toggleHidden = (accountKey: string) => {
    const norm = normalizeAccountBalanceKey(accountKey);
    const isHidden = hiddenAccountKeys.some((k) => normalizeAccountBalanceKey(k) === norm);
    const explicitHidden = new Set<string>(
      (settings.hiddenAccountBalanceKeys ?? []).map(normalizeAccountBalanceKey)
    );
    const revealed = new Set<string>(
      (settings.unhiddenAccountBalanceKeys ?? []).map(normalizeAccountBalanceKey)
    );

    if (isHidden) {
      explicitHidden.delete(norm);
      revealed.add(norm);
    } else {
      explicitHidden.add(norm);
      revealed.delete(norm);
    }

    updateSettings({
      hiddenAccountBalanceKeys: [...explicitHidden],
      unhiddenAccountBalanceKeys: [...revealed],
    });
  };

  /**
   * This page reads Net Position Reports, so its provenance line must name
   * one — it cited the Payroll Funding Report, which is not where any figure
   * here comes from. Newest report wins, matching the balances shown.
   */
  const netPositionProvenance = useMemo(() => {
    const latest = [...netPositionImports].sort((a, b) =>
      (a.reportRunDate ?? a.uploadedAt).localeCompare(b.reportRunDate ?? b.uploadedAt)
    ).at(-1);
    if (!latest) return undefined;
    return {
      sourceFileName:
        netPositionImports.length > 1
          ? `${latest.sourceFileName} + ${netPositionImports.length - 1} more`
          : latest.sourceFileName,
      importedAt: latest.uploadedAt,
    };
  }, [netPositionImports]);

  return (
    <>
      <Header
        ledgerTitle
        title="Account Balances"
        subtitle="Ending balances from your Net Position Reports"
        provenance={netPositionProvenance}
        topAction={
          hasAnySource ? { label: "Upload another", href: "/upload" } : undefined
        }
      />
      <main className="flex-1 overflow-auto bg-inset/60 p-6">
        <div className="mx-auto max-w-7xl space-y-6">
          {!hasAnySource ? (
            <EmptyState
              title="No account balance data yet"
              message="Upload a Net Position Report on the Upload page. Every account it covers appears here."
              actionLabel="Go to Upload"
              actionHref="/upload"
            />
          ) : !hasVisibleContent ? (
            <div className="space-y-4">
              <EmptyState
                title="No accounts on this list yet"
                message="Every account is hidden, or the report covered none."
                actionLabel="Go to Upload"
                actionHref="/upload"
              />
              <div className="flex justify-center">
              </div>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div className="flex flex-wrap gap-6">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                      Accounts
                    </p>
                    <p className="text-lg font-semibold tabular-nums text-ink">
                      {filtered.length}
                      {filtered.length !== visibleItems.length ? (
                        <span className="text-sm font-normal text-muted">
                          {" "}
                          of {visibleItems.length}
                        </span>
                      ) : null}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                      Total ending
                    </p>
                    <p className="text-lg font-semibold tabular-nums text-ink">
                      {formatCurrency(totalEnding)}
                    </p>
                  </div>
                  {latestPeriod && (
                    <div>
                      <p className="text-[10px] font-semibold uppercase tracking-wide text-muted">
                        Latest NP period
                      </p>
                      <p className="text-lg font-semibold text-ink">{latestPeriod}</p>
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
                  {hiddenCount > 0 && (
                    <button
                      type="button"
                      onClick={() => setShowHidden((v) => !v)}
                      className={cn(
                        "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium",
                        showHidden
                          ? "border-accent bg-accent-soft text-accent"
                          : "border-rule bg-surface text-ink-2 hover:bg-inset"
                      )}
                    >
                      {showHidden ? (
                        <EyeOff className="h-3.5 w-3.5" />
                      ) : (
                        <Eye className="h-3.5 w-3.5" />
                      )}
                      {showHidden
                        ? "Collapse hidden accounts"
                        : `Show ${hiddenCount} hidden account${hiddenCount === 1 ? "" : "s"}`}
                    </button>
                  )}
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Filter by project, fund, dept…"
                    className="w-full max-w-xs rounded-lg border border-rule bg-surface px-3 py-2 text-sm text-ink shadow-sm placeholder:text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                </div>
              </div>

              <p className="rounded-lg border border-rule bg-surface px-3 py-2 text-xs text-ink-2">
                {netPositionImports.length} Net Position report
                {netPositionImports.length === 1 ? "" : "s"}.
                {!anyPriorData && (
                  <> Change vs prior needs two report periods — upload another to see movement.</>
                )}{" "}
                <Link href="/upload" className="font-medium underline hover:text-ink">
                  Manage uploads
                </Link>
              </p>

              {!hasVisibleContent ? (
                <div className="rounded-xl border border-dashed border-control bg-surface px-6 py-12 text-center text-sm text-ink-2">
                  No accounts on the list yet. Upload a Net Position Report.
                </div>
              ) : filtered.length === 0 ? (
                <div className="rounded-xl border border-dashed border-control bg-surface px-6 py-12 text-center text-sm text-ink-2">
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
                        <h3 className="flex items-center gap-2 text-sm font-semibold text-ink">
                          {section.label}
                          <span className="font-normal text-muted">
                            ({section.items.length})
                          </span>
                        </h3>
                      ) : null}
                      <ul className="divide-y divide-rule overflow-hidden rounded-xl border border-rule bg-surface shadow-sm">
                        {section.items.map((s) => (
                          <AccountCard
                            key={s.accountKey}
                            item={s}
                            showPriorColumn={anyPriorData}
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
