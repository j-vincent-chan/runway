"use client";

import { useMemo } from "react";
import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { EmptyState } from "@/components/EmptyState";
import { useApp } from "@/context/AppContext";
import { calculateAccountBurden, getCurrentMonth } from "@/lib/calculations";
import { formatCurrency, formatCurrencyBalance } from "@/lib/utils/parse";
import { AliasEditor } from "@/components/funding/AliasEditor";
import {
  AccountCategoryLegend,
  AccountCategorySelect,
} from "@/components/funding/AccountCategorySelect";
import { resolveDisplayAlias } from "@/lib/funding/alias";
import { getFundingSourceNetBalance } from "@/lib/funding/accountBalance";
import { getFundingSourceCategory } from "@/lib/funding/accountCategory";
import { getAliasEntry } from "@/lib/funding/sourceKey";
import { getEmployeesOnFundingSource } from "@/lib/funding/accountEmployees";
import { EmployeeAvatarStack } from "@/components/employees/EmployeeAvatarStack";
import { cn } from "@/lib/utils/cn";
import { plannedToFundingSource, unmatchedPlannedSources } from "@/lib/projections/sources";

export default function AccountsPage() {
  const {
    hasData,
    snapshot,
    allocations,
    fundingSources,
    settings,
    portfolioImports,
    mergedPortfolioBalances,
    portfolioTitlesByChartstring,
    updateFundingSourceAlias,
    setFundingSourceCategory,
    updateSettings,
  } = useApp();

  const planned = unmatchedPlannedSources(settings, snapshot).map(plannedToFundingSource);
  const sorted = [...fundingSources, ...planned].sort((a, b) =>
    resolveDisplayAlias(
      a,
      getAliasEntry(settings.fundingSourceAliases, a)?.alias,
      a.accountString ? portfolioTitlesByChartstring.get(a.accountString) : undefined
    ).localeCompare(
      resolveDisplayAlias(
        b,
        getAliasEntry(settings.fundingSourceAliases, b)?.alias,
        b.accountString ? portfolioTitlesByChartstring.get(b.accountString) : undefined
      )
    )
  );

  const hasPortfolio = portfolioImports.length > 0;

  const employeesByFund = useMemo(() => {
    if (!snapshot) return new Map<string, ReturnType<typeof getEmployeesOnFundingSource>>();
    const map = new Map<string, ReturnType<typeof getEmployeesOnFundingSource>>();
    for (const fs of fundingSources) {
      map.set(fs.id, getEmployeesOnFundingSource(fs.id, snapshot, allocations));
    }
    return map;
  }, [snapshot, fundingSources, allocations]);

  return (
    <>
      <Header
        ledgerTitle
        title="Accounts"
        subtitle="Funding sources, balances, and payroll burden · imported from payroll funding report"
      />
      <main className="flex-1 overflow-auto p-6">
        {!hasData || !snapshot ? (
          <EmptyState />
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              Edit the <span className="font-medium">account alias</span> to a name you recognize.
              Chartstring is the payroll account ID. Classify each fund by type; balances come from
              MyPortfolio when uploaded.
            </p>
            <AccountCategoryLegend />
            {!hasPortfolio && (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                No MyPortfolio files yet.{" "}
                <Link href="/upload" className="font-medium underline hover:text-amber-950">
                  Upload balances
                </Link>{" "}
                to populate net balance.
              </p>
            )}
            <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-[#0c2340] text-xs text-white">
                  <tr>
                    <th className="min-w-[14rem] px-3 py-2">Account alias</th>
                    <th className="px-3 py-2">Chartstring</th>
                    <th className="min-w-[11.5rem] px-3 py-2">Type</th>
                    <th className="min-w-[6rem] px-3 py-2 text-center">Employees</th>
                    <th className="px-3 py-2 text-right">Current net balance</th>
                    <th className="px-3 py-2 text-right">Current monthly burden</th>
                  </tr>
                </thead>
                <tbody>
                  {sorted.map((fs) => {
                    const current = getCurrentMonth(snapshot);
                    const fundEmployees = employeesByFund.get(fs.id) ?? [];
                    const burden = calculateAccountBurden(fs.id, current, snapshot.monthlyCosts);
                    const isPlanned = planned.some((p) => p.id === fs.id);
                    const aliasEntry = getAliasEntry(settings.fundingSourceAliases, fs);
                    const custom = isPlanned ? fs.alias : aliasEntry?.alias;
                    const category = getFundingSourceCategory(settings, fs);
                    const netBalance = isPlanned
                      ? (settings.plannedFundingSources ?? []).find((p) => p.id === fs.id)
                          ?.openingBalance
                      : getFundingSourceNetBalance(fs, mergedPortfolioBalances);

                    return (
                      <tr key={fs.id} className="border-t hover:bg-slate-50/80">
                        <td className="whitespace-nowrap px-3 py-2">
                          <AliasEditor
                            source={fs}
                            customAlias={custom}
                            portfolioTitle={
                              fs.accountString
                                ? portfolioTitlesByChartstring.get(fs.accountString)
                                : undefined
                            }
                            showProjectSuffix={false}
                            fullWidth
                            onSave={(base) => {
                              if (isPlanned) {
                                updateSettings({
                                  plannedFundingSources: (settings.plannedFundingSources ?? []).map(
                                    (p) => (p.id === fs.id ? { ...p, alias: base } : p)
                                  ),
                                });
                              } else {
                                updateFundingSourceAlias(fs.id, base);
                              }
                            }}
                          />
                          {isPlanned && (
                            <span className="mt-1 inline-block rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-800">
                              Planned
                            </span>
                          )}
                        </td>
                        <td
                          className="max-w-[220px] truncate px-3 py-2 font-mono text-xs text-slate-500"
                          title={fs.accountString ?? fs.rawName}
                        >
                          {fs.accountString ?? fs.rawName.slice(0, 60)}
                        </td>
                        <td className="px-3 py-2">
                          <AccountCategorySelect
                            value={category}
                            onChange={(c) => setFundingSourceCategory(fs.id, c)}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <EmployeeAvatarStack employees={fundEmployees} settings={settings} />
                        </td>
                        <td
                          className={cn(
                            "px-3 py-2 text-right tabular-nums",
                            netBalance !== undefined && netBalance < 0 && "text-red-700"
                          )}
                        >
                          {netBalance !== undefined ? formatCurrencyBalance(netBalance) : "—"}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatCurrency(burden)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </>
  );
}
