"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { AppSettings, Employee, FundingSource } from "@/types";
import { getEmployeePhotoUrlFor } from "@/lib/employees/roster";
import { EmployeeAvatar } from "@/components/employees/EmployeeAvatar";
import { chartstringFundDeptProject, normalizeChartstring } from "@/lib/funding/chartstring";
import { chartstringKeyForFundingSource, projectionSourceLabel } from "@/lib/projections/sources";
import type { ProjectionResult } from "@/lib/projections/simulate";
import { formatCurrency } from "@/lib/utils/parse";
import { cn } from "@/lib/utils/cn";
import { colorsForEmployeeVisibleSources } from "@/lib/timeline/visibleBarColors";
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
}: {
  employees: Employee[];
  settings: AppSettings;
  result: ProjectionResult;
  plannedSourceIds: Set<string>;
  displayMode: AppSettings["displayMode"];
  accountTitlesByChartstring?: Map<string, string>;
  onEdit: (employee: Employee, source: FundingSource) => void;
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
  onToggle: () => void;
  onEdit: (employee: Employee, source: FundingSource) => void;
}) {
  const key = chartstringKeyForFundingSource(fs);
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
            <span className="truncate" title={alias}>
              {alias.toUpperCase()}
            </span>
            {isPlanned && (
              <span className="shrink-0 rounded bg-white/15 px-1.5 py-0.5 text-[9px] font-semibold tracking-wide text-teal-100">
                PLANNED
              </span>
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
          return (
          <td
            key={month}
            className={cn(
              "text-center text-[10px] tabular-nums",
              projected && "bg-white/10 text-white/80",
              v <= 0.5 && "bg-red-500/20"
            )}
            title={`Remaining ${formatCurrency(v)}${projected ? " · Projected" : ""}`}
          >
            {formatCurrency(v).replace(".00", "")}
          </td>
          );
        })}
      </tr>
      {!isCollapsed &&
        contributors.map((emp) => {
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
            (month) => isProjectedMonth(month, result.originMonth)
          );
          return (
            <tr key={emp.id} className="border-t border-slate-100 hover:bg-slate-50/50">
              <td
                className="sticky left-0 z-10 bg-white px-1 py-0.5 pl-8"
                style={{
                  width: PROJECTION_LABEL_COL,
                  minWidth: PROJECTION_LABEL_COL,
                  maxWidth: PROJECTION_LABEL_COL,
                }}
              >
                <button
                  type="button"
                  className="flex max-w-full items-center gap-1.5 text-left text-[11px] font-medium text-slate-700 hover:text-teal-800 hover:underline"
                  onClick={() => onEdit(emp, fs)}
                >
                  <EmployeeAvatar
                    name={emp.name}
                    photoUrl={getEmployeePhotoUrlFor(settings, emp)}
                    size="xs"
                  />
                  <span className="truncate">{emp.name}</span>
                </button>
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
