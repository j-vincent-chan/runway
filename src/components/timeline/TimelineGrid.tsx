"use client";

import { useMemo, useState } from "react";
import { useApp } from "@/context/AppContext";
import { calculateEmployeeCoverage, getAllMonths } from "@/lib/calculations";
import { calculateEmployeeAccountMonthlyBurn } from "@/lib/runway/calculate";
import {
  coverageOptionsFromSettings,
  isEmployeeFundHidden,
  countHiddenFundsForEmployee,
  countAllHiddenFunds,
} from "@/lib/funding/visibility";
import { buildTimelineSegments } from "@/lib/timeline/mergeSegments";
import { cn } from "@/lib/utils/cn";
import { isNotMyAccountKey } from "@/lib/net-position/accountGroup";
import { chartstringFundDeptProject } from "@/lib/funding/chartstring";
import {
  formatCurrency,
  formatMonthDisplay,
  formatMonthShort,
  formatPercent,
  hasPercentEffort,
} from "@/lib/utils/parse";
import type { Employee, FundingSource, MonthlyAllocation, PayrollReportSnapshot } from "@/types";
import { ChevronDown, ChevronRight, Eye, EyeOff, Landmark } from "lucide-react";
import { TimelineToolbar } from "@/components/timeline/TimelineToolbar";
import { FreezeableGrid, freezeTheadClass } from "@/components/grid/FreezeableGrid";
import { AliasEditor } from "@/components/funding/AliasEditor";
import { EmployeeScopeEditor } from "@/components/timeline/EmployeeScopeEditor";
import {
  capMonthsToPresent,
  filterMonthsInRange,
  resolveTimelineRange,
  visibleFutureMonths,
} from "@/lib/timeline/range";
import { getTimelineFundingSources } from "@/lib/funding/employeeSources";
import { getAliasEntry } from "@/lib/funding/sourceKey";
import { colorsForEmployeeVisibleSources } from "@/lib/timeline/visibleBarColors";
import { filterEmployeesForPlanning, getEmployeePhotoUrlFor } from "@/lib/employees/roster";
import {
  filterEmployeesByPersonnelGroups,
  sortEmployeesForPlanning,
} from "@/lib/employees/personnelType";
import { EmployeeAvatar } from "@/components/employees/EmployeeAvatar";
import type { AppSettings } from "@/types";

/** Minimum month column width; columns grow equally to fill available space above this. */
const MONTH_COL_MIN_WIDTH = 52;
const LABEL_COL_WIDTH = 300;
const APPT_COL_WIDTH = 48;

function groupMonthsByYear(months: string[]): { year: string; months: string[] }[] {
  const groups: { year: string; months: string[] }[] = [];
  for (const month of months) {
    const year = month.slice(0, 4);
    const last = groups[groups.length - 1];
    if (last?.year === year) last.months.push(month);
    else groups.push({ year, months: [month] });
  }
  return groups;
}

function MergedAllocationBar({
  segment,
  display,
  color,
  costTotal,
  empName,
  fundAlias,
  onEditSegment,
}: {
  segment: ReturnType<typeof buildTimelineSegments>[number];
  display: "percent" | "dollars" | "both";
  color: string;
  costTotal: number;
  empName: string;
  fundAlias: string;
  onEditSegment: (months: string[], value: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(String(segment.percentEffort || ""));

  const pct = segment.percentEffort;
  const rangeLabel =
    segment.months.length > 1
      ? `${formatMonthDisplay(segment.months[0])}–${formatMonthDisplay(segment.months[segment.months.length - 1])}`
      : formatMonthDisplay(segment.months[0]);

  const tooltip = `${empName} · ${fundAlias} · ${rangeLabel} · ${formatPercent(pct)} · ${
    segment.isFuture ? "Future distribution" : "Actual payroll"
  }${segment.isEdited ? " · Edited" : ""}`;

  if (!hasPercentEffort(pct) && !editing) {
    return (
      <div
        className="h-8 w-full cursor-pointer bg-white hover:bg-slate-50"
        title={tooltip}
        onDoubleClick={() => {
          setEditing(true);
          setVal("");
        }}
      />
    );
  }

  const label =
    display === "dollars"
      ? formatCurrency(costTotal).replace(".00", "")
      : display === "both"
        ? `${formatPercent(pct)} · ${formatCurrency(costTotal).replace(".00", "")}`
        : formatPercent(pct);

  return (
    <div
      title={tooltip}
      className="relative h-8 w-full"
      onDoubleClick={() => {
        if (!editing) {
          setVal(String(pct));
          setEditing(true);
        }
      }}
    >
      {editing ? (
        <input
          autoFocus
          className="h-full w-full rounded-none border-2 border-teal-600 bg-white text-center text-[10px] text-slate-800"
          value={val}
          onChange={(e) => setVal(e.target.value)}
          onBlur={() => {
            onEditSegment(segment.months, parseFloat(val) || 0);
            setEditing(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              onEditSegment(segment.months, parseFloat(val) || 0);
              setEditing(false);
            }
          }}
        />
      ) : (
        <div
          className={cn(
            "allocation-bar allocation-bar-flat flex h-full w-full items-center justify-center text-center text-[10px] font-medium text-slate-800",
            display === "both" && "px-0.5 leading-tight",
            segment.isFuture && "pattern-future-flat",
            segment.isEdited && "allocation-bar--edited",
            pct < 0 && "allocation-bar--reversal"
          )}
          style={{ backgroundColor: color }}
        >
          {label}
        </div>
      )}
    </div>
  );
}

export function TimelineGrid() {
  const {
    snapshot,
    allocations,
    fundingSources,
    settings,
    updateAllocation,
    updateFundingSourceAlias,
    toggleHiddenEmployeeFund,
    toggleNotMyAccount,
    setEmployeePlanningScope,
    updateSettings,
    accountTitlesByChartstring,
  } = useApp();
  const [display, setDisplay] = useState<"percent" | "dollars" | "both">("percent");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  /** Reveal hidden fund rows in the grid without removing them from totals. */
  const [showHiddenFunds, setShowHiddenFunds] = useState(false);
  const [revealHiddenForEmployees, setRevealHiddenForEmployees] = useState<Set<string>>(
    () => new Set()
  );

  const timelineFutureMonths = useMemo(
    () => (snapshot ? visibleFutureMonths(snapshot.futureMonths) : []),
    [snapshot]
  );

  const availableMonths = useMemo(() => {
    if (!snapshot) return [];
    const visibleFuture = new Set(timelineFutureMonths);
    const raw = getAllMonths(snapshot).filter((m) => {
      const fut = snapshot.futureMonths.includes(m);
      if (fut) return visibleFuture.has(m);
      return true;
    });
    return capMonthsToPresent(raw);
  }, [snapshot, timelineFutureMonths]);

  const viewRange = useMemo(() => {
    if (!snapshot) return { start: "", end: "" };
    return resolveTimelineRange(availableMonths, settings.timelineViewRange, {
      actualMonths: capMonthsToPresent(snapshot.actualMonths),
      futureMonths: timelineFutureMonths,
    });
  }, [snapshot, availableMonths, settings.timelineViewRange, timelineFutureMonths]);

  const months = useMemo(
    () => filterMonthsInRange(availableMonths, viewRange),
    [availableMonths, viewRange]
  );

  const tableMinWidth =
    LABEL_COL_WIDTH + APPT_COL_WIDTH + months.length * MONTH_COL_MIN_WIDTH;

  const monthsByYear = useMemo(() => groupMonthsByYear(months), [months]);

  const planningEmployees = useMemo(
    () =>
      snapshot
        ? sortEmployeesForPlanning(
            filterEmployeesByPersonnelGroups(
              filterEmployeesForPlanning(snapshot.employees, settings),
              settings
            ),
            settings
          )
        : [],
    [snapshot, settings]
  );

  if (!snapshot) return null;

  const sourcesForEmployee = (empId: string, revealHidden: boolean) =>
    getTimelineFundingSources(empId, allocations, fundingSources, months, settings, {
      revealHidden,
    });

  const getAlloc = (empId: string, fsId: string, month: string) =>
    allocations.find((a) => a.employeeId === empId && a.fundingSourceId === fsId && a.month === month);

  const totalHiddenFunds = countAllHiddenFunds(settings);

  return (
    <div className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white shadow-sm">
      <TimelineToolbar
        display={display}
        onDisplayChange={setDisplay}
        viewRange={viewRange}
        availableMonths={availableMonths}
        onRangeChange={(timelineViewRange) => updateSettings({ timelineViewRange })}
        totalHiddenFunds={totalHiddenFunds}
        showHiddenFunds={showHiddenFunds}
        onToggleHiddenFunds={() => {
          setShowHiddenFunds((v) => !v);
          if (showHiddenFunds) setRevealHiddenForEmployees(new Set());
        }}
        freezeHeader={settings.freezeGridHeader !== false}
        onFreezeHeaderChange={(freezeGridHeader) => updateSettings({ freezeGridHeader })}
        groupFilter={settings.personnelGroupFilter ?? []}
        onGroupFilterChange={(personnelGroupFilter) => updateSettings({ personnelGroupFilter })}
      />

      <FreezeableGrid freeze={settings.freezeGridHeader !== false}>
        <table
          className="w-full table-fixed border-collapse text-xs"
          style={{ minWidth: tableMinWidth }}
        >
          <colgroup>
            <col style={{ width: LABEL_COL_WIDTH }} />
            <col style={{ width: APPT_COL_WIDTH }} />
            {months.map((m) => (
              <col key={m} />
            ))}
          </colgroup>
          <thead className={freezeTheadClass(settings.freezeGridHeader !== false)}>
            <tr>
              <th
                rowSpan={2}
                className="timeline-th-sticky sticky left-0 z-40 border-r border-white px-3 py-2 text-left align-middle"
              >
                <span className="block text-[11px] font-semibold leading-tight tracking-wide text-white">
                  EMPLOYEE / Funding Source
                </span>
              </th>
              <th
                rowSpan={2}
                className="timeline-th-sticky sticky z-40 border-r border-white px-1 text-center align-middle"
                style={{
                  left: LABEL_COL_WIDTH,
                  width: APPT_COL_WIDTH,
                  minWidth: APPT_COL_WIDTH,
                  maxWidth: APPT_COL_WIDTH,
                }}
              >
                <span className="inline-block text-[9px] font-semibold uppercase leading-none tracking-wide text-teal-100/90">
                  Scope
                </span>
              </th>
              {monthsByYear.map((group) => (
                <th
                  key={group.year}
                  colSpan={group.months.length}
                  className="timeline-th-year px-1 py-1.5 text-center text-[10px] font-semibold tracking-wide text-teal-200/95"
                >
                  {group.year}
                </th>
              ))}
            </tr>
            <tr>
              {months.map((m) => (
                <th
                  key={m}
                  className="timeline-th-month px-1 py-2 text-center text-[10px] font-medium uppercase text-slate-200/95"
                  title={m}
                >
                  {formatMonthShort(m).toUpperCase()}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {planningEmployees.map((emp) => {
              const isCollapsed = collapsed.has(emp.id);
              const revealHidden =
                showHiddenFunds || revealHiddenForEmployees.has(emp.id);
              const sources = sourcesForEmployee(emp.id, revealHidden);
              return (
                <EmployeeRows
                  key={emp.id}
                  emp={emp}
                  sources={sources}
                  months={months}
                  snapshot={snapshot}
                  allocations={allocations}
                  display={display}
                  isCollapsed={isCollapsed}
                  onToggle={() =>
                    setCollapsed((p) => {
                      const n = new Set(p);
                      if (n.has(emp.id)) n.delete(emp.id);
                      else n.add(emp.id);
                      return n;
                    })
                  }
                  getAlloc={getAlloc}
                  updateAllocation={updateAllocation}
                  updateFundingSourceAlias={updateFundingSourceAlias}
                  customAliases={settings.fundingSourceAliases}
                  accountTitlesByChartstring={accountTitlesByChartstring}
                  settings={settings}
                  toggleHiddenEmployeeFund={toggleHiddenEmployeeFund}
                  toggleNotMyAccount={toggleNotMyAccount}
                  showHiddenFunds={showHiddenFunds}
                  revealHiddenForEmployees={revealHiddenForEmployees}
                  onRevealHiddenForEmployee={(employeeId) =>
                    setRevealHiddenForEmployees((prev) => new Set(prev).add(employeeId))
                  }
                  setEmployeePlanningScope={setEmployeePlanningScope}
                />
              );
            })}
          </tbody>
        </table>
      </FreezeableGrid>
    </div>
  );
}

function EmployeeRows({
  emp,
  sources,
  months,
  snapshot,
  allocations,
  display,
  isCollapsed,
  onToggle,
  getAlloc,
  updateAllocation,
  updateFundingSourceAlias,
  customAliases,
  accountTitlesByChartstring,
  settings,
  toggleHiddenEmployeeFund,
  toggleNotMyAccount,
  showHiddenFunds,
  revealHiddenForEmployees,
  onRevealHiddenForEmployee,
  setEmployeePlanningScope,
}: {
  toggleNotMyAccount: (chartstring: string) => void;
  emp: Employee;
  sources: FundingSource[];
  months: string[];
  snapshot: PayrollReportSnapshot;
  allocations: MonthlyAllocation[];
  display: "percent" | "dollars" | "both";
  isCollapsed: boolean;
  onToggle: () => void;
  getAlloc: (e: string, f: string, m: string) => MonthlyAllocation | undefined;
  updateAllocation: (e: string, f: string, m: string, n: number) => void;
  updateFundingSourceAlias: (id: string, base: string) => void;
  customAliases: AppSettings["fundingSourceAliases"];
  accountTitlesByChartstring: Map<string, string>;
  settings: AppSettings;
  toggleHiddenEmployeeFund: (employeeId: string, fundingSourceId: string) => void;
  showHiddenFunds: boolean;
  revealHiddenForEmployees: Set<string>;
  onRevealHiddenForEmployee: (employeeId: string) => void;
  setEmployeePlanningScope: (employeeId: string, percent: number | null) => void;
}) {
  const coverageOpts = coverageOptionsFromSettings(emp, settings);
  const hiddenCount = countHiddenFundsForEmployee(emp.id, settings);
  const planningScope = settings.employeePlanningScope?.[emp.id];
  const revealHidden =
    showHiddenFunds || revealHiddenForEmployees.has(emp.id);

  const barColors = useMemo(
    () =>
      colorsForEmployeeVisibleSources(sources, (fs) =>
        isEmployeeFundHidden(settings, emp.id, fs.id)
      ),
    [sources, settings.hiddenEmployeeFunds, emp.id]
  );

  return (
    <>
      <tr className="bg-[#0c2340] text-white">
        <td
          className="sticky left-0 z-10 cursor-pointer bg-[#0c2340] px-2 py-1.5 font-semibold"
          style={{ width: LABEL_COL_WIDTH, minWidth: LABEL_COL_WIDTH, maxWidth: LABEL_COL_WIDTH }}
          onClick={onToggle}
        >
          <div className="flex w-full items-center gap-1.5 whitespace-nowrap">
            <div className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden">
              {isCollapsed ? <ChevronRight className="h-3 w-3 shrink-0" /> : <ChevronDown className="h-3 w-3 shrink-0" />}
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
            {hiddenCount > 0 && !revealHidden && (
              <button
                type="button"
                className="ml-auto inline-flex shrink-0 items-center gap-0.5 rounded bg-white/15 px-1.5 py-0.5 text-[10px] font-medium tabular-nums hover:bg-white/25"
                title={`Show ${hiddenCount} hidden fund row${hiddenCount === 1 ? "" : "s"} for this employee`}
                onClick={(e) => {
                  e.stopPropagation();
                  onRevealHiddenForEmployee(emp.id);
                }}
              >
                <EyeOff className="h-3 w-3" aria-hidden />
                <span>({hiddenCount})</span>
              </button>
            )}
          </div>
        </td>
        <td
          className="sticky z-10 bg-[#0c2340] text-center align-middle"
          style={{ left: LABEL_COL_WIDTH, width: APPT_COL_WIDTH, minWidth: APPT_COL_WIDTH }}
        >
          <EmployeeScopeEditor
            appointmentPercent={emp.appointmentPercent}
            planningScope={planningScope}
            onSave={(p) => setEmployeePlanningScope(emp.id, p)}
          />
        </td>
        {months.map((m) => {
          const c = calculateEmployeeCoverage(emp, m, allocations, coverageOpts);
          return (
            <td
              key={m}
              className={cn(
                "text-center text-[10px]",
                c.status === "overallocated" && "bg-red-500/20",
                c.status === "underallocated" && "bg-amber-500/20"
              )}
              title={`${c.allocatedPercent.toFixed(0)}% of ${c.expectedPercent}% scope`}
            >
              {c.allocatedPercent.toFixed(0)}%
            </td>
          );
        })}
      </tr>
      {!isCollapsed &&
        sources.map((fs) => {
          const hidden = isEmployeeFundHidden(settings, emp.id, fs.id);
          const notMine = isNotMyAccountKey(
            settings,
            chartstringFundDeptProject(fs.accountString ?? fs.rawName) ??
              (fs.accountString ?? fs.rawName)
          );
          const segments = buildTimelineSegments(
            months,
            (month) => getAlloc(emp.id, fs.id, month),
            snapshot
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
                className="sticky left-0 z-10 bg-white px-1 py-0.5 pl-2"
                style={{ width: LABEL_COL_WIDTH, minWidth: LABEL_COL_WIDTH, maxWidth: LABEL_COL_WIDTH }}
              >
                <div className="flex items-center gap-1 overflow-x-auto whitespace-nowrap">
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
                    onClick={() => toggleHiddenEmployeeFund(emp.id, fs.id)}
                  >
                    {hidden ? (
                      <EyeOff className="h-3.5 w-3.5" />
                    ) : (
                      <Eye className="h-3.5 w-3.5" />
                    )}
                  </button>
                  {/* Same mark as Runway's landmark and the Settings account
                      group — all three write one account-level value. */}
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
                    onClick={() => toggleNotMyAccount(fs.accountString ?? fs.rawName)}
                  >
                    <Landmark className="h-3.5 w-3.5" />
                  </button>
                  <AliasEditor
                    source={fs}
                    customAlias={getAliasEntry(customAliases, fs)?.alias}
                    accountTitle={
                      fs.accountString
                        ? accountTitlesByChartstring.get(fs.accountString)
                        : undefined
                    }
                    compact
                    onSave={(base) => updateFundingSourceAlias(fs.id, base)}
                    className={cn(hidden && "opacity-50")}
                  />
                </div>
              </td>
              <td
                className="sticky z-10 bg-white text-center text-[9px] text-slate-400"
                style={{ left: LABEL_COL_WIDTH, width: APPT_COL_WIDTH, minWidth: APPT_COL_WIDTH }}
              >
                {hidden ? "hidden" : ""}
              </td>
              {segments.map((segment, idx) => {
                const costTotal = segment.months.reduce(
                  (sum, m) =>
                    sum +
                    calculateEmployeeAccountMonthlyBurn(
                      emp.id,
                      fs.id,
                      m,
                      snapshot,
                      allocations
                    ),
                  0
                );

                return (
                  <td
                    key={`${fs.id}-${idx}-${segment.months[0]}`}
                    colSpan={segment.colspan}
                    className={cn(
                      "border border-slate-200 p-0 align-middle",
                      hidden && "opacity-60"
                    )}
                  >
                    <MergedAllocationBar
                      segment={segment}
                      display={display}
                      color={barColors.get(fs.id) ?? "#c8daf0"}
                      costTotal={costTotal}
                      empName={emp.name}
                      fundAlias={fs.alias}
                      onEditSegment={(mons, v) => {
                        mons.forEach((m) => updateAllocation(emp.id, fs.id, m, v));
                      }}
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
