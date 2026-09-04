"use client";

import { useMemo, useState } from "react";
import { Header } from "@/components/layout/Header";
import { EmptyState } from "@/components/EmptyState";
import { useApp } from "@/context/AppContext";
import { RunwayEmployeeSection } from "@/components/runway/RunwayEmployeeSection";
import { buildSharedAccountBurnIndex, computeEmployeeRunway } from "@/lib/runway/calculate";
import { filterEmployeesForPlanning } from "@/lib/employees/roster";
import { filterEmployeesByPersonnelGroups } from "@/lib/employees/personnelType";
import { RunwayEmployeeSort } from "@/components/runway/RunwayEmployeeSort";
import { PersonnelGroupFilter } from "@/components/employees/PersonnelGroupFilter";
import { countAllHiddenFunds } from "@/lib/funding/visibility";
import {
  loadRunwayEmployeeSort,
  saveRunwayEmployeeSort,
  sortEmployeeRunwaySummaries,
  type RunwayEmployeeSortKey,
} from "@/lib/runway/sortEmployees";
import { cn } from "@/lib/utils/cn";
import { Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { DEEP_LINK_PARAM } from "@/lib/navigation/deepLinks";
import { useDeepLinkTarget } from "@/lib/navigation/useDeepLinkTarget";

export default function RunwayPage() {
  const {
    hasData,
    snapshot,
    workingPlan,
    fundingSources,
    settings,
    accountBalances,
    netPositionImports,
    updateSettings,
    setRunwayBalanceOverride,
    setRunwayBurnOverride,
    clearRunwayBurnOverride,
    toggleHiddenEmployeeFund,
    toggleNotMyAccount,
    setRunwayAssumedEndDate,
  } = useApp();

  // The Dashboard's "Review" rows land here with an account preselected.
  const deepLinkedAccount = useDeepLinkTarget("account", DEEP_LINK_PARAM.account);

  const [showHiddenFunds, setShowHiddenFunds] = useState(false);
  const [query, setQuery] = useState("");
  const [revealHiddenForEmployees, setRevealHiddenForEmployees] = useState<Set<string>>(
    () => new Set()
  );
  const [employeeSort, setEmployeeSort] = useState<RunwayEmployeeSortKey>(() =>
    loadRunwayEmployeeSort()
  );

  const handleEmployeeSortChange = (key: RunwayEmployeeSortKey) => {
    setEmployeeSort(key);
    saveRunwayEmployeeSort(key);
  };

  const totalHiddenFunds = countAllHiddenFunds(settings);

  const sharedBurnIndex = useMemo(() => {
    if (!snapshot) return new Map();
    return buildSharedAccountBurnIndex(snapshot, workingPlan, fundingSources, settings);
  }, [snapshot, workingPlan, fundingSources, settings]);

  const naturalOrder = useMemo(() => {
    if (!snapshot) return [];
    const rows = filterEmployeesByPersonnelGroups(
      filterEmployeesForPlanning(snapshot.employees, settings),
      settings
    )
      .map((emp) =>
        computeEmployeeRunway(
          emp,
          snapshot,
          workingPlan,
          fundingSources,
          settings,
          accountBalances,
          sharedBurnIndex,
          {
            revealHidden:
              showHiddenFunds || revealHiddenForEmployees.has(emp.id),
          }
        )
      )
      .filter((s) => s.accounts.length > 0 || s.hiddenAccountCount > 0);
    return sortEmployeeRunwaySummaries(rows, employeeSort, settings);
  }, [
    snapshot,
    workingPlan,
    fundingSources,
    settings,
    accountBalances,
    sharedBurnIndex,
    showHiddenFunds,
    revealHiddenForEmployees,
    employeeSort,
  ]);

  /**
   * Hiding an account changes that person's blended runway, which under the
   * Urgency sort moves their row mid-click — so hiding a second account means
   * hunting for it again. The order is captured once and held while you work,
   * and re-taken only on an explicit change: a different sort, a new import,
   * or a page refresh. Rows that appear later fall to the end rather than
   * pushing existing ones around.
   */
  const orderKey = `${employeeSort}|${snapshot?.id ?? ""}`;
  const [heldOrder, setHeldOrder] = useState<{ key: string; ids: string[] }>({
    key: "",
    ids: [],
  });

  // Adjusting state during render rather than in an effect: React re-renders
  // immediately without committing the first pass, so the list never paints in
  // one order and then jumps to another.
  if (heldOrder.key !== orderKey && naturalOrder.length > 0) {
    setHeldOrder({ key: orderKey, ids: naturalOrder.map((s) => s.employee.id) });
  }

  const frozenOrder = heldOrder.key === orderKey ? heldOrder.ids : null;
  const setFrozenOrder = (ids: string[]) => setHeldOrder({ key: orderKey, ids });

  const summaries = useMemo(() => {
    if (!frozenOrder) return naturalOrder;
    const rank = new Map(frozenOrder.map((id, i) => [id, i]));
    return [...naturalOrder].sort(
      (a, b) =>
        (rank.get(a.employee.id) ?? Number.MAX_SAFE_INTEGER) -
        (rank.get(b.employee.id) ?? Number.MAX_SAFE_INTEGER)
    );
  }, [naturalOrder, frozenOrder]);

  /**
   * The same free-text filter Account Balances has — the fastest control in
   * the app, matching people and the accounts under them.
   */
  const visibleSummaries = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return summaries;
    return summaries.filter((s) => {
      if (s.employee.name.toLowerCase().includes(q)) return true;
      return s.accounts.some(
        (a) =>
          a.displayName.toLowerCase().includes(q) ||
          a.chartstring.toLowerCase().includes(q)
      );
    });
  }, [summaries, query]);

  /** True once the held order no longer matches what the sort would produce. */
  const orderIsHeld = useMemo(
    () =>
      summaries.length > 1 &&
      summaries.some((s, i) => s.employee.id !== naturalOrder[i]?.employee.id),
    [summaries, naturalOrder]
  );

  return (
    <>
      <Header
        ledgerTitle
        title="Runway"
        subtitle="Months of payroll remaining by active account · balances from your Net Position Report or manual entry"
      />
      <main className="flex-1 overflow-auto p-6">
        <div className="mx-auto w-full max-w-7xl space-y-6">
          {!hasData || !snapshot ? (
            <EmptyState message="Runway uses each person’s active payroll accounts from your funding timeline. Import a Payroll Funding Report on Upload, then return here." />
          ) : summaries.length === 0 ? (
            <EmptyState
              title="No active accounts found"
              message="No personnel have funded accounts in the imported payroll data."
            />
          ) : (
            <div className="space-y-4">
              {netPositionImports.length === 0 && (
                <p className="rounded-lg border border-caution bg-caution-soft px-3 py-2 text-xs text-caution">
                  No Net Position Reports uploaded yet.{" "}
                  <Link href="/upload" className="font-medium underline hover:text-caution">
                    Upload balances on the Upload page
                  </Link>{" "}
                  or enter balances manually on each account row.
                </p>
              )}
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div className="flex flex-wrap items-end gap-5">
                  <PersonnelGroupFilter
                    value={settings.personnelGroupFilter ?? []}
                    onChange={(personnelGroupFilter) => updateSettings({ personnelGroupFilter })}
                  />
                  <RunwayEmployeeSort value={employeeSort} onChange={handleEmployeeSortChange} />
                  <input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Filter by person or account…"
                    className="w-full max-w-xs rounded-lg border border-rule bg-surface px-3 py-2 text-sm text-ink shadow-sm placeholder:text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                  {orderIsHeld && (
                    <button
                      type="button"
                      onClick={() => setFrozenOrder(naturalOrder.map((s) => s.employee.id))}
                      title="Rows keep their positions while you hide accounts, so a hidden row's neighbours stay put."
                      className="inline-flex min-h-11 items-center gap-1.5 text-xs font-medium text-ink-2 underline underline-offset-2 hover:text-accent"
                    >
                      Order held · re-sort now
                    </button>
                  )}
                </div>
                {totalHiddenFunds > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setShowHiddenFunds((v) => !v);
                      if (showHiddenFunds) setRevealHiddenForEmployees(new Set());
                    }}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium",
                      showHiddenFunds
                        ? "border-accent bg-accent-soft text-accent"
                        : "border-rule bg-surface text-ink-2 hover:bg-inset"
                    )}
                  >
                    {showHiddenFunds ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    {showHiddenFunds
                      ? "Collapse hidden funds"
                      : `Show ${totalHiddenFunds} hidden fund${totalHiddenFunds === 1 ? "" : "s"}`}
                  </button>
                )}
              </div>
              {visibleSummaries.length === 0 && query.trim() !== "" && (
                <p className="py-6 text-center text-sm text-muted">
                  No person or account matches “{query.trim()}”.
                </p>
              )}
              {visibleSummaries.map((summary) => {
                const revealHidden =
                  showHiddenFunds || revealHiddenForEmployees.has(summary.employee.id);
                return (
                  <RunwayEmployeeSection
                    key={summary.employee.id}
                    summary={summary}
                    revealHidden={revealHidden}
                    highlightAccount={deepLinkedAccount}
                    onRevealHidden={() =>
                      setRevealHiddenForEmployees((prev) => new Set(prev).add(summary.employee.id))
                    }
                    onToggleHidden={(fundingSourceId) =>
                      toggleHiddenEmployeeFund(summary.employee.id, fundingSourceId)
                    }
                    onToggleAssumedOk={(chartstring) => toggleNotMyAccount(chartstring)}
                    onAssumedEndDateChange={(chartstring, endDate) =>
                      setRunwayAssumedEndDate(chartstring, endDate)
                    }
                    onBalanceChange={(chartstring, value) =>
                      setRunwayBalanceOverride(summary.employee.id, chartstring, value)
                    }
                    onBurnChange={(fundingSourceId, percentEffort, monthlyBurn) =>
                      setRunwayBurnOverride(
                        summary.employee.id,
                        fundingSourceId,
                        percentEffort,
                        monthlyBurn
                      )
                    }
                    onBurnReset={(fundingSourceId) =>
                      clearRunwayBurnOverride(summary.employee.id, fundingSourceId)
                    }
                  />
                );
              })}
            </div>
          )}
        </div>
      </main>
    </>
  );
}
