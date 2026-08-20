"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
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
  portfolioTitlesByChartstring,
  onEdit,
}: {
  employees: Employee[];
  settings: AppSettings;
  result: ProjectionResult;
  displayMode: AppSettings["displayMode"];
  portfolioTitlesByChartstring?: Map<string, string>;
  onEdit: (employee: Employee, source: FundingSource) => void;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const months = result.months;
  const tableMinWidth =
    PROJECTION_LABEL_COL + PROJECTION_SCOPE_COL + months.length * PROJECTION_MONTH_COL_MIN;
  const display = displayMode ?? "percent";

  const aliasFor = (key: string) => {
    const fs = result.sources.find((s) => chartstringKeyForFundingSource(s) === key);
    if (!fs) return key;
    return projectionSourceLabel(fs, settings, portfolioTitlesByChartstring);
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
  onToggle: () => void;
  onEdit: (employee: Employee, source: FundingSource) => void;
}) {
  const months = result.months;
  const barColors = useMemo(
    () => colorsForEmployeeVisibleSources(sources, () => false),
    [sources]
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
      {!isCollapsed && sources.length === 0 && (
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
        sources.map((fs) => {
          const key = chartstringKeyForFundingSource(fs);
          const chips = rulesForPair(settings, personKey, key).map((r) =>
            ruleChipLabel(r, aliasFor)
          );
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
            <tr key={fs.id} className="border-t border-slate-100 hover:bg-slate-50/50">
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
                  className="block max-w-full truncate text-left text-[11px] font-medium text-slate-700 hover:text-teal-800 hover:underline"
                  title={[aliasFor(key), ...chips].join(" · ")}
                  onClick={() => onEdit(emp, fs)}
                >
                  {aliasFor(key)}
                </button>
                {chips[0] && (
                  <p className="truncate text-[9px] text-slate-500" title={chips.join(" · ")}>
                    {chips[0]}
                  </p>
                )}
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
