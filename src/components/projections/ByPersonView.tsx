"use client";

import { useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Eye,
  EyeOff,
  Settings2,
  Landmark,
  Trash2,
  SendHorizontal,
} from "lucide-react";
import type { AppSettings, Employee, FundingSource } from "@/types";
import { employeePersonKey } from "@/lib/employees/stableKey";
import { getEmployeePhotoUrlFor } from "@/lib/employees/roster";
import { EmployeeAvatar } from "@/components/employees/EmployeeAvatar";
import { chartstringKeyForFundingSource, projectionSourceLabel } from "@/lib/projections/sources";
import { ruleChipLabel, rulesForPair } from "@/lib/projections/rules";
import type { ProjectionResult } from "@/lib/projections/simulate";
import { formatPercent } from "@/lib/utils/parse";
import { cn } from "@/lib/utils/cn";
import { colorsForEmployeeVisibleSources } from "@/lib/timeline/visibleBarColors";
import { isEmployeeFundHidden, countHiddenFundsForEmployee } from "@/lib/funding/visibility";
import { isNotMyAccountKey } from "@/lib/net-position/accountGroup";
import { chartstringFundDeptProject } from "@/lib/funding/chartstring";
import { getAliasEntry } from "@/lib/funding/sourceKey";
import { AliasEditor } from "@/components/funding/AliasEditor";
import { depletionMonthIndexForRoot, depletionRootOf } from "@/lib/projections/depletion";
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

export function ByPersonView({
  employees,
  settings,
  result,
  displayMode,
  accountTitlesByChartstring,
  onEdit,
  showHiddenFunds,
  revealHidden,
  onRevealHidden,
  onToggleHiddenFund,
  onToggleNotMyAccount,
  onSaveAlias,
  onRemoveChartstring,
  onLockIn,
  lockInReady,
}: {
  employees: Employee[];
  settings: AppSettings;
  result: ProjectionResult;
  displayMode: AppSettings["displayMode"];
  accountTitlesByChartstring?: Map<string, string>;
  onEdit: (employee: Employee, source: FundingSource) => void;
  /** Same declutter model as Timeline — see the page-level state that owns this. */
  showHiddenFunds: boolean;
  /** Employee ids revealed for this session, same semantics as Timeline's per-row reveal. */
  revealHidden: Set<string>;
  onRevealHidden: (employeeId: string) => void;
  onToggleHiddenFund: (employeeId: string, fundingSourceId: string) => void;
  onToggleNotMyAccount: (chartstring: string) => void;
  onSaveAlias: (fundingSourceId: string, aliasBase: string) => void;
  onRemoveChartstring: (employee: Employee, source: FundingSource) => void;
  /** Formal handoff to the analyst; false disables with an explanation. */
  onLockIn: (employee: Employee) => void;
  lockInReady: boolean;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const months = result.months;
  const tableMinWidth =
    PROJECTION_LABEL_COL + PROJECTION_SCOPE_COL + months.length * PROJECTION_MONTH_COL_MIN;
  const display = displayMode ?? "percent";

  const aliasFor = (key: string) => {
    const fs = result.sources.find((s) => chartstringKeyForFundingSource(s) === key);
    if (!fs) return key;
    return projectionSourceLabel(fs, settings, accountTitlesByChartstring);
  };

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
          label="EMPLOYEE / Funding Source"
          scopeLabel="Scope"
          frozen={settings.freezeGridHeader !== false}
          originMonth={result.originMonth}
        />
        <tbody>
          {employees.map((emp) => {
            const personKey = employeePersonKey(emp);
            const keys = new Set<string>();
            for (const state of result.states) {
              for (const a of state.allocations) {
                if (a.employeeId === emp.id) keys.add(a.chartstringKey);
              }
            }
            for (const rule of settings.projectionRules ?? []) {
              if (rule.personKey === personKey && rule.chartstringKey) keys.add(rule.chartstringKey);
            }
            const sources = result.sources.filter((s) =>
              keys.has(chartstringKeyForFundingSource(s))
            );
            const isCollapsed = collapsed.has(emp.id);
            return (
              <EmployeeBlock
                key={emp.id}
                emp={emp}
                personKey={personKey}
                sources={sources}
                settings={settings}
                result={result}
                display={display}
                isCollapsed={isCollapsed}
                aliasFor={aliasFor}
                accountTitlesByChartstring={accountTitlesByChartstring}
                revealHidden={showHiddenFunds || revealHidden.has(emp.id)}
                onRevealHidden={() => onRevealHidden(emp.id)}
                onToggleHiddenFund={onToggleHiddenFund}
                onToggleNotMyAccount={onToggleNotMyAccount}
                onSaveAlias={onSaveAlias}
                onRemoveChartstring={onRemoveChartstring}
                onLockIn={onLockIn}
                lockInReady={lockInReady}
                onToggle={() =>
                  setCollapsed((p) => {
                    const n = new Set(p);
                    if (n.has(emp.id)) n.delete(emp.id);
                    else n.add(emp.id);
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

function EmployeeBlock({
  emp,
  personKey,
  sources,
  settings,
  result,
  display,
  isCollapsed,
  aliasFor,
  accountTitlesByChartstring,
  revealHidden,
  onRevealHidden,
  onToggleHiddenFund,
  onToggleNotMyAccount,
  onSaveAlias,
  onRemoveChartstring,
  onLockIn,
  lockInReady,
  onToggle,
  onEdit,
}: {
  emp: Employee;
  personKey: string;
  sources: FundingSource[];
  settings: AppSettings;
  result: ProjectionResult;
  display: "percent" | "dollars" | "both";
  isCollapsed: boolean;
  aliasFor: (key: string) => string;
  accountTitlesByChartstring?: Map<string, string>;
  revealHidden: boolean;
  onRevealHidden: () => void;
  onToggleHiddenFund: (employeeId: string, fundingSourceId: string) => void;
  onToggleNotMyAccount: (chartstring: string) => void;
  onSaveAlias: (fundingSourceId: string, aliasBase: string) => void;
  onRemoveChartstring: (employee: Employee, source: FundingSource) => void;
  onLockIn: (employee: Employee) => void;
  lockInReady: boolean;
  onToggle: () => void;
  onEdit: (employee: Employee, source: FundingSource) => void;
}) {
  const months = result.months;
  /**
   * Same rule getTimelineFundingSources applies: a hidden fund drops out of the
   * grid unless revealed. The projection itself still counts it — hiding is a
   * view concern on every page that offers it.
   */
  const visibleSources = sources.filter(
    (fs) => revealHidden || !isEmployeeFundHidden(settings, emp.id, fs.id)
  );
  const hiddenCount = countHiddenFundsForEmployee(emp.id, settings);
  const barColors = useMemo(
    () =>
      colorsForEmployeeVisibleSources(sources, (fs) =>
        isEmployeeFundHidden(settings, emp.id, fs.id)
      ),
    [sources, settings, emp.id]
  );

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
          <div className="flex w-full items-center gap-1.5 whitespace-nowrap">
            {isCollapsed ? (
              <ChevronRight className="h-3 w-3 shrink-0" />
            ) : (
              <ChevronDown className="h-3 w-3 shrink-0" />
            )}
            <EmployeeAvatar
              name={emp.name}
              photoUrl={getEmployeePhotoUrlFor(settings, emp)}
              size="xs"
              className="ring-white/40"
            />
            <span className="truncate" title={emp.name}>
              {emp.name.toUpperCase()}
            </span>
            {emp.employeeId && (
              <span className="shrink-0 text-[9px] font-normal text-white/60" title="HR employee ID">
                · {emp.employeeId}
              </span>
            )}
            {/* Only a person whose plan differs from today's distribution has
                anything to hand off, so the button follows the rules. */}
            {(settings.projectionRules ?? []).some((r) => r.personKey === personKey) && (
              <button
                type="button"
                disabled={!lockInReady}
                className="ml-auto inline-flex shrink-0 items-center gap-1 rounded bg-white/15 px-1.5 py-0.5 text-[10px] font-medium hover:bg-white/25 disabled:opacity-50"
                title={
                  lockInReady
                    ? `Hand ${emp.name}'s distribution change to your analyst`
                    : "Sign in with cloud sync to hand off changes to your analyst"
                }
                onClick={(e) => {
                  e.stopPropagation();
                  onLockIn(emp);
                }}
              >
                <SendHorizontal className="h-3 w-3" aria-hidden />
                Lock In
              </button>
            )}
            {hiddenCount > 0 && !revealHidden && (
              <button
                type="button"
                className="ml-auto inline-flex shrink-0 items-center gap-0.5 rounded bg-white/15 px-1.5 py-0.5 text-[10px] font-medium tabular-nums hover:bg-white/25"
                title={`Show ${hiddenCount} hidden fund row${hiddenCount === 1 ? "" : "s"} for this employee`}
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
          className="sticky z-10 bg-[#0c2340] text-center align-middle text-[10px] tabular-nums text-teal-100"
          style={{
            left: PROJECTION_LABEL_COL,
            width: PROJECTION_SCOPE_COL,
            minWidth: PROJECTION_SCOPE_COL,
          }}
        >
          {result.states[0]?.coverageByEmployee[emp.id]?.expectedPercent.toFixed(0) ?? "—"}%
        </td>
        {months.map((m) => {
          const c = result.states.find((s) => s.month === m)?.coverageByEmployee[emp.id];
          const projected = isProjectedMonth(m, result.originMonth);
          return (
            <td
              key={m}
              className={cn(
                "text-center text-[10px]",
                projected && "bg-white/10 text-white/80",
                c?.status === "overallocated" && "bg-red-500/20",
                c?.status === "underallocated" && "bg-amber-500/20"
              )}
              title={
                c
                  ? `${c.allocatedPercent.toFixed(0)}% of ${c.expectedPercent}% scope${
                      projected ? " · Projected" : ""
                    }`
                  : undefined
              }
            >
              {c ? `${c.allocatedPercent.toFixed(0)}%` : "—"}
            </td>
          );
        })}
      </tr>
      {!isCollapsed && visibleSources.length === 0 && (
        <tr className="border-t border-slate-100">
          <td
            className="sticky left-0 z-10 bg-white px-3 py-2 pl-8 text-slate-500"
            colSpan={2 + months.length}
          >
            No projected distribution yet. Use Set from origin or add a chartstring.
          </td>
        </tr>
      )}
      {!isCollapsed &&
        visibleSources.map((fs) => {
          const key = chartstringKeyForFundingSource(fs);
          const hidden = isEmployeeFundHidden(settings, emp.id, fs.id);
          const notMine = isNotMyAccountKey(
            settings,
            chartstringFundDeptProject(fs.accountString ?? fs.rawName) ??
              (fs.accountString ?? fs.rawName)
          );
          /**
           * The account's own depletion, shown on the person's row because
           * that is where the distribution driving it is edited: change this
           * person from 35% to 20% and the date moves out here, on the same
           * selector the Dashboard's depletion chart reads.
           */
          const dryIndex = depletionMonthIndexForRoot(result, depletionRootOf(key));
          const dryMonth = dryIndex === null ? null : months[dryIndex] ?? null;
          const chips = rulesForPair(settings, personKey, key).map((r) =>
            ruleChipLabel(r, aliasFor)
          );
          /**
           * Group by projected-ness *and* by whether the account still has
           * money, so a merged run never straddles the month the balance hits
           * zero — a single cell cannot be half funded.
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
              key={fs.id}
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
                {/* Eye and landmark first, same order as Timeline's fund row and
                    the same two shared settings. Then a dedicated icon to open
                    the distribution rule (a control Timeline has no equivalent
                    of), and the rename input last. */}
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
                      "shrink-0 rounded p-0.5",
                      notMine
                        ? "bg-sky-100 text-sky-800 ring-1 ring-sky-200/90 hover:bg-sky-200"
                        : "text-slate-400 hover:bg-sky-50 hover:text-sky-700"
                    )}
                    title={
                      notMine
                        ? "Apply runway to this account again"
                        : "Not my account — count it only to its end date"
                    }
                    onClick={() => onToggleNotMyAccount(fs.accountString ?? fs.rawName)}
                  >
                    <Landmark className="h-3.5 w-3.5" />
                  </button>
                  {/*
                    A truncating text button here used to be the only way to
                    open the distribution rule editor. It sat in the same flex
                    row as the always-visible rename input below, competing for
                    a shrinking share of a 300px column — the input is
                    shrink-0 and fixed-width, so the button that opened the
                    editor was squeezed toward zero width and became
                    unclickable, with no visible sign that it was still there.
                    A small icon, sized like its eye/landmark neighbours, cannot
                    be squeezed the same way.
                  */}
                  <button
                    type="button"
                    className="shrink-0 rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                    title={`Edit distribution rule — ${[aliasFor(key), ...chips].join(" · ")}`}
                    onClick={() => onEdit(emp, fs)}
                  >
                    <Settings2 className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    className="shrink-0 rounded p-0.5 text-slate-400 hover:bg-red-50 hover:text-red-700"
                    title={`Remove ${aliasFor(key)} from ${emp.name}'s list`}
                    onClick={() => onRemoveChartstring(emp, fs)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                  <AliasEditor
                    source={fs}
                    customAlias={getAliasEntry(settings.fundingSourceAliases, fs)?.alias}
                    accountTitle={
                      fs.accountString
                        ? accountTitlesByChartstring?.get(fs.accountString)
                        : undefined
                    }
                    compact
                    onSave={(base) => onSaveAlias(fs.id, base)}
                    className={cn("shrink-0", hidden && "opacity-50")}
                  />
                </div>
                {/* No sub-line: the rule's effect is the effort change already
                    drawn across these cells, and the account running dry is
                    drawn on them too. Both stay in the row's hover text. */}
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
                    key={`${fs.id}-${segment.months[0]}`}
                    colSpan={segment.colspan}
                    className="border border-slate-200 p-0 align-middle"
                  >
                    <ProjectionAllocationBar
                      percentEffort={segment.value}
                      burnTotal={burnTotal}
                      display={display}
                      color={barColors.get(fs.id) ?? fs.color}
                      projected={projected}
                      months={segment.months}
                      titlePrefix={`${emp.name} · ${aliasFor(key)}`}
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
      {!isCollapsed && (
        <tr className="border-t border-slate-100">
          <td
            className="sticky left-0 z-10 bg-white px-1 py-0.5 pl-8 text-[11px] font-medium text-amber-800"
            style={{
              width: PROJECTION_LABEL_COL,
              minWidth: PROJECTION_LABEL_COL,
              maxWidth: PROJECTION_LABEL_COL,
            }}
          >
            Uncovered
          </td>
          <td
            className="sticky z-10 bg-white"
            style={{
              left: PROJECTION_LABEL_COL,
              width: PROJECTION_SCOPE_COL,
              minWidth: PROJECTION_SCOPE_COL,
            }}
          />
          {mergeByPercent(
            months,
            (month) => {
              const cov = result.states.find((s) => s.month === month)?.coverageByEmployee[emp.id];
              return cov?.status === "underallocated" ? cov.unallocatedPercent : 0;
            },
            (month) => isProjectedMonth(month, result.originMonth)
          ).map((segment) => {
            const projected = isProjectedMonth(segment.months[0]!, result.originMonth);
            return (
            <td
              key={`gap-${emp.id}-${segment.months[0]}`}
              colSpan={segment.colspan}
              className="border border-slate-200 p-0 align-middle"
            >
              {segment.value > 0.5 ? (
                <div
                  className={cn(
                    "flex h-8 w-full items-center justify-center text-[10px] font-medium",
                    projected ? "bg-amber-50 text-amber-800/80" : "bg-amber-100 text-amber-900"
                  )}
                  title={`Uncovered ${formatPercent(segment.value)}${projected ? " · Projected" : ""}`}
                >
                  {formatPercent(segment.value)}
                </div>
              ) : (
                <div className={cn("h-8 w-full", projected ? "bg-slate-50" : "bg-white")} />
              )}
            </td>
            );
          })}
        </tr>
      )}
    </>
  );
}
