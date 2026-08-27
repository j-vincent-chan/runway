"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Eye, EyeOff, ShieldCheck } from "lucide-react";
import type { AppSettings, Employee, FundingSource } from "@/types";
import { getEmployeePhotoUrlFor } from "@/lib/employees/roster";
import { EmployeeAvatar } from "@/components/employees/EmployeeAvatar";
import { chartstringFundDeptProject, normalizeChartstring } from "@/lib/funding/chartstring";
import { chartstringKeyForFundingSource, projectionSourceLabel } from "@/lib/projections/sources";
import type { ProjectionResult } from "@/lib/projections/simulate";
import { formatCurrency } from "@/lib/utils/parse";
import { cn } from "@/lib/utils/cn";
import { colorsForEmployeeVisibleSources } from "@/lib/timeline/visibleBarColors";
import { isEmployeeFundHidden } from "@/lib/funding/visibility";
import { isNotMyAccountKey } from "@/lib/net-position/accountGroup";
import { getAliasEntry } from "@/lib/funding/sourceKey";
import { AliasEditor } from "@/components/funding/AliasEditor";
import { depletionMonthIndexForRoot } from "@/lib/projections/depletion";
import { formatMonthLabel } from "@/lib/projections/horizon";
import {
  mergeByPercent,
  isProjectedMonth,
  PROJECTION_LABEL_COL,
  PROJECTION_MONTH_COL_MIN,
  PROJECTION_SCOPE_COL,
} from "@/lib/projections/grid";
import { ProjectionGridHeader } from "@/components/projections/ProjectionGridHeader";
import { FreezeableGrid } from "@/components/grid/FreezeableGrid";
import { ProjectionAllocationBar } from "@/components/projections/ProjectionAllocationBar";

function rootOf(key: string): string {
  return chartstringFundDeptProject(key) ?? normalizeChartstring(key);
}

export function ByAccountView({
  employees,
  settings,
  result,
  plannedSourceIds,
  displayMode,
  accountTitlesByChartstring,
  onEdit,
  showHiddenFunds,
  revealHidden,
  onRevealHidden,
  onToggleHiddenFund,
  onToggleNotMyAccount,
  onSaveAlias,
}: {
  employees: Employee[];
  settings: AppSettings;
  result: ProjectionResult;
  plannedSourceIds: Set<string>;
  displayMode: AppSettings["displayMode"];
  accountTitlesByChartstring?: Map<string, string>;
  onEdit: (employee: Employee, source: FundingSource) => void;
  showHiddenFunds: boolean;
  /** Funding-source ids revealed this session — the same set By Person keys by employee id. */
  revealHidden: Set<string>;
  onRevealHidden: (fundingSourceId: string) => void;
  onToggleHiddenFund: (employeeId: string, fundingSourceId: string) => void;
  onToggleNotMyAccount: (chartstring: string) => void;
  onSaveAlias: (fundingSourceId: string, aliasBase: string) => void;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const months = result.months;
  const tableMinWidth =
    PROJECTION_LABEL_COL + PROJECTION_SCOPE_COL + months.length * PROJECTION_MONTH_COL_MIN;
  const display = displayMode ?? "percent";
  const empById = new Map(employees.map((e) => [e.id, e]));

  return (
    <FreezeableGrid freeze={settings.freezeGridHeader !== false}>
      <table
        className="w-full table-fixed border-collapse text-xs"
        style={{ minWidth: tableMinWidth }}
      >
        <colgroup>
          <col style={{ width: PROJECTION_LABEL_COL }} />
          <col style={{ width: PROJECTION_SCOPE_COL }} />
          {months.map((m) => (
            <col key={m} />
          ))}
        </colgroup>
        <ProjectionGridHeader
          months={months}
          label="ACCOUNT / Person"
          scopeLabel="Left"
          frozen={settings.freezeGridHeader !== false}
          originMonth={result.originMonth}
        />
        <tbody>
          {result.sources.map((fs) => {
            const key = chartstringKeyForFundingSource(fs);
            const root = rootOf(key);
            const remainingSeries = result.states.map((s) => s.remainingByRoot[root] ?? 0);
            const isPlanned = plannedSourceIds.has(fs.id);
            const contributors: Employee[] = [];
            const seen = new Set<string>();
            for (const state of result.states) {
              for (const a of state.allocations) {
                if (a.chartstringKey !== key || seen.has(a.employeeId)) continue;
                const emp = empById.get(a.employeeId);
                if (emp) {
                  seen.add(emp.id);
                  contributors.push(emp);
                }
              }
            }
            const isCollapsed = collapsed.has(fs.id);
            const alias = projectionSourceLabel(fs, settings, accountTitlesByChartstring);
            const barColors = colorsForEmployeeVisibleSources(
              contributors.map((e) => ({ ...fs, id: e.id, alias: e.name, rawName: e.name })),
              () => false
            );

            return (
              <AccountBlock
                key={fs.id}
                fs={fs}
                alias={alias}
                isPlanned={isPlanned}
                remainingSeries={remainingSeries}
                contributors={contributors}
                months={months}
                result={result}
                display={display}
                isCollapsed={isCollapsed}
                barColors={barColors}
                settings={settings}
                accountTitlesByChartstring={accountTitlesByChartstring}
                revealHidden={showHiddenFunds || revealHidden.has(fs.id)}
                onRevealHidden={() => onRevealHidden(fs.id)}
                onToggleHiddenFund={onToggleHiddenFund}
                onToggleNotMyAccount={onToggleNotMyAccount}
                onSaveAlias={onSaveAlias}
                onToggle={() =>
                  setCollapsed((p) => {
                    const n = new Set(p);
                    if (n.has(fs.id)) n.delete(fs.id);
                    else n.add(fs.id);
                    return n;
                  })
                }
                onEdit={onEdit}
              />
            );
          })}
        </tbody>
      </table>
    </FreezeableGrid>
  );
}

function AccountBlock({
  fs,
  alias,
  isPlanned,
  remainingSeries,
  contributors,
  months,
  result,
  display,
  isCollapsed,
  barColors,
  settings,
  accountTitlesByChartstring,
  revealHidden,
  onRevealHidden,
  onToggleHiddenFund,
  onToggleNotMyAccount,
  onSaveAlias,
  onToggle,
  onEdit,
}: {
  fs: FundingSource;
  alias: string;
  isPlanned: boolean;
  remainingSeries: number[];
  contributors: Employee[];
  months: string[];
  result: ProjectionResult;
  display: "percent" | "dollars" | "both";
  isCollapsed: boolean;
  barColors: Map<string, string>;
  settings: AppSettings;
  accountTitlesByChartstring?: Map<string, string>;
  revealHidden: boolean;
  onRevealHidden: () => void;
  onToggleHiddenFund: (employeeId: string, fundingSourceId: string) => void;
  onToggleNotMyAccount: (chartstring: string) => void;
  onSaveAlias: (fundingSourceId: string, aliasBase: string) => void;
  onToggle: () => void;
  onEdit: (employee: Employee, source: FundingSource) => void;
}) {
  const key = chartstringKeyForFundingSource(fs);
  /**
   * Hiding is per employee-fund, so on this view it drops contributor rows
   * rather than the account itself — the account still has money and still
   * belongs in the projection, one of its people is just filtered out of view.
   */
  const visibleContributors = contributors.filter(
    (emp) => revealHidden || !isEmployeeFundHidden(settings, emp.id, fs.id)
  );
  const hiddenCount = contributors.length - visibleContributors.length;
  const notMine = isNotMyAccountKey(settings, rootOf(key));
  /**
   * Same selector the Dashboard's depletion chart reads, so the month named
   * here and the month marked there can never disagree — and both move
   * together when a distribution changes on this page.
   */
  const dryIndex = depletionMonthIndexForRoot(result, rootOf(key));
  const dryMonth = dryIndex === null ? null : months[dryIndex] ?? null;
  return (
    <>
      <tr className="bg-[#0c2340] text-white">
        <td
          className="sticky left-0 z-10 cursor-pointer bg-[#0c2340] px-2 py-1.5 font-semibold"
          style={{
            width: PROJECTION_LABEL_COL,
            minWidth: PROJECTION_LABEL_COL,
            maxWidth: PROJECTION_LABEL_COL,
          }}
          onClick={onToggle}
        >
          <div className="flex w-full items-center gap-1.5 overflow-hidden whitespace-nowrap">
            {isCollapsed ? (
              <ChevronRight className="h-3 w-3 shrink-0" />
            ) : (
              <ChevronDown className="h-3 w-3 shrink-0" />
            )}
            {/* The account's own row is where an account-level mark belongs, so
                the shield and the rename live here rather than on the people
                below — one value, same one Timeline and Settings write. */}
            <button
              type="button"
              className={cn(
                "shrink-0 rounded p-0.5",
                notMine
                  ? "bg-sky-200/90 text-sky-900 ring-1 ring-sky-100/60"
                  : "text-white/50 hover:bg-white/15 hover:text-white"
              )}
              title={
                notMine
                  ? "Apply runway to this account again"
                  : "Not my account — count it only to its end date"
              }
              onClick={(e) => {
                e.stopPropagation();
                onToggleNotMyAccount(fs.accountString ?? fs.rawName);
              }}
            >
              <ShieldCheck className="h-3.5 w-3.5" />
            </button>
            <span className="truncate" title={alias}>
              {alias.toUpperCase()}
            </span>
            <span onClick={(e) => e.stopPropagation()} className="shrink-0">
              <AliasEditor
                source={fs}
                customAlias={getAliasEntry(settings.fundingSourceAliases, fs)?.alias}
                accountTitle={
                  fs.accountString ? accountTitlesByChartstring?.get(fs.accountString) : undefined
                }
                compact
                onSave={(base) => onSaveAlias(fs.id, base)}
              />
            </span>
            {isPlanned && (
              <span className="shrink-0 rounded bg-white/15 px-1.5 py-0.5 text-[9px] font-semibold tracking-wide text-teal-100">
                PLANNED
              </span>
            )}
            {/* No badge: this account's own remaining-balance row below already
                turns red at zero, and the people's cells carry the hatch from
                that month on. */}
            {hiddenCount > 0 && !revealHidden && (
              <button
                type="button"
                className="ml-auto inline-flex shrink-0 items-center gap-0.5 rounded bg-white/15 px-1.5 py-0.5 text-[10px] font-medium tabular-nums hover:bg-white/25"
                title={`Show ${hiddenCount} hidden person row${hiddenCount === 1 ? "" : "s"} on this account`}
                onClick={(e) => {
                  e.stopPropagation();
                  onRevealHidden();
                }}
              >
                <EyeOff className="h-3 w-3" aria-hidden />
                <span>({hiddenCount})</span>
              </button>
            )}
          </div>
        </td>
        <td
          className="sticky z-10 bg-[#0c2340] text-center align-middle text-[9px] tabular-nums text-teal-100"
          style={{
            left: PROJECTION_LABEL_COL,
            width: PROJECTION_SCOPE_COL,
            minWidth: PROJECTION_SCOPE_COL,
          }}
        >
          $
        </td>
        {remainingSeries.map((v, i) => {
          const month = months[i]!;
          const projected = isProjectedMonth(month, result.originMonth);
          const empty = v <= 0.5;
          return (
          <td
            key={month}
            className={cn(
              "text-center text-[10px] tabular-nums",
              projected && "bg-white/10 text-white/80",
              // Quieter than the fill it sits above: the number reaching zero
              // is already the statement, the tint only has to group the run.
              empty && "bg-red-500/15 text-red-100",
              // A hard edge on the month it crosses zero, matching the same
              // mark on the people's cells directly below.
              i === dryIndex && "allocation-bar--dry-start"
            )}
            title={`Remaining ${formatCurrency(v)}${projected ? " · Projected" : ""}${
              empty ? " · Account is dry" : ""
            }`}
          >
            {formatCurrency(v).replace(".00", "")}
          </td>
          );
        })}
      </tr>
      {!isCollapsed &&
        visibleContributors.map((emp) => {
          const hidden = isEmployeeFundHidden(settings, emp.id, fs.id);
          /**
           * Grouped by projected-ness and by whether the account still has
           * money, so a merged run never straddles the zero crossing.
           */
          const segments = mergeByPercent(
            months,
            (month) => {
              return (
                result.states
                  .find((s) => s.month === month)
                  ?.allocations.find((a) => a.employeeId === emp.id && a.chartstringKey === key)
                  ?.percentEffort ?? 0
              );
            },
            (month) =>
              `${isProjectedMonth(month, result.originMonth)}|${
                dryIndex !== null && months.indexOf(month) >= dryIndex
              }`
          );
          return (
            <tr
              key={emp.id}
              className={cn(
                "border-t border-slate-100 hover:bg-slate-50/50",
                hidden && "bg-slate-50/90"
              )}
            >
              <td
                className={cn(
                  "sticky left-0 z-10 px-1 py-0.5 pl-4",
                  hidden ? "bg-slate-50/90" : "bg-white"
                )}
                style={{
                  width: PROJECTION_LABEL_COL,
                  minWidth: PROJECTION_LABEL_COL,
                  maxWidth: PROJECTION_LABEL_COL,
                }}
              >
                <div className="flex items-center gap-1 overflow-hidden whitespace-nowrap">
                  <button
                    type="button"
                    className={cn(
                      "shrink-0 rounded p-0.5 hover:bg-slate-100",
                      hidden ? "text-slate-500" : "text-slate-400 hover:text-slate-700"
                    )}
                    title={
                      hidden
                        ? "Include this fund in your view and totals"
                        : "Hide fund (not under your control)"
                    }
                    onClick={() => onToggleHiddenFund(emp.id, fs.id)}
                  >
                    {hidden ? (
                      <EyeOff className="h-3.5 w-3.5" />
                    ) : (
                      <Eye className="h-3.5 w-3.5" />
                    )}
                  </button>
                  <button
                    type="button"
                    className={cn(
                      "flex min-w-0 flex-1 items-center gap-1.5 text-left text-[11px] font-medium text-slate-700 hover:text-teal-800 hover:underline",
                      hidden && "opacity-50"
                    )}
                    onClick={() => onEdit(emp, fs)}
                  >
                    <EmployeeAvatar
                      name={emp.name}
                      photoUrl={getEmployeePhotoUrlFor(settings, emp)}
                      size="xs"
                    />
                    <span className="truncate">{emp.name}</span>
                  </button>
                </div>
              </td>
              <td
                className="sticky z-10 bg-white"
                style={{
                  left: PROJECTION_LABEL_COL,
                  width: PROJECTION_SCOPE_COL,
                  minWidth: PROJECTION_SCOPE_COL,
                }}
              />
              {segments.map((segment) => {
                const burnTotal = segment.months.reduce((sum, month) => {
                  const cell = result.states
                    .find((s) => s.month === month)
                    ?.allocations.find((a) => a.employeeId === emp.id && a.chartstringKey === key);
                  return sum + (cell?.monthlyBurn ?? 0);
                }, 0);
                const projected = isProjectedMonth(segment.months[0]!, result.originMonth);
                return (
                  <td
                    key={`${emp.id}-${segment.months[0]}`}
                    colSpan={segment.colspan}
                    className="border border-slate-200 p-0 align-middle"
                  >
                    <ProjectionAllocationBar
                      percentEffort={segment.value}
                      burnTotal={burnTotal}
                      display={display}
                      color={barColors.get(emp.id) ?? fs.color}
                      projected={projected}
                      months={segment.months}
                      titlePrefix={`${emp.name} · ${alias}`}
                      unfunded={
                        dryIndex !== null && months.indexOf(segment.months[0]!) >= dryIndex
                      }
                      dryStart={dryIndex !== null && months.indexOf(segment.months[0]!) === dryIndex}
                      dryMonthLabel={dryMonth ? formatMonthLabel(dryMonth) : undefined}
                      onClick={() => onEdit(emp, fs)}
                    />
                  </td>
                );
              })}
            </tr>
          );
        })}
    </>
  );
}
