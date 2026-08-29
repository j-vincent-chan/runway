"use client";

import { useMemo, useState } from "react";
import { Header } from "@/components/layout/Header";
import { EmptyState } from "@/components/EmptyState";
import { useApp } from "@/context/AppContext";
import { filterEmployeesForPlanning } from "@/lib/employees/roster";
import {
  filterEmployeesByPersonnelGroups,
  sortEmployeesForPlanning,
} from "@/lib/employees/personnelType";
import { simulateProjections } from "@/lib/projections/simulate";
import { formatMonthLabel } from "@/lib/projections/horizon";
import {
  unmatchedPlannedSources,
  projectionSourceLabel,
  chartstringKeyForFundingSource,
} from "@/lib/projections/sources";
import { upsertRule } from "@/lib/projections/rules";
import { applyChartstringRemoval, checkChartstringRemoval } from "@/lib/projections/removal";
import {
  buildChangeSummary,
  type ChangeRequestDetails,
} from "@/lib/projections/changeSummary";
import { LockInDialog } from "@/components/projections/LockInDialog";
import { useAuth } from "@/context/AuthContext";
import { useWorkspace } from "@/context/WorkspaceContext";
import { ByPersonView } from "@/components/projections/ByPersonView";
import { ByAccountView } from "@/components/projections/ByAccountView";
import { RuleEditor } from "@/components/projections/RuleEditor";
import { formatCurrency, formatPercent, generateId } from "@/lib/utils/parse";
import { countAllHiddenFunds } from "@/lib/funding/visibility";
import { Eye, EyeOff } from "lucide-react";
import { FreezeHeaderToggle } from "@/components/grid/FreezeHeaderToggle";
import { PersonnelGroupFilter } from "@/components/employees/PersonnelGroupFilter";
import { employeePersonKey } from "@/lib/employees/stableKey";
import type {
  AppSettings,
  Employee,
  FundingSource,
  PlannedFundingSource,
  ProjectionHorizonPreset,
  ProjectionRule,
} from "@/types";
import { cn } from "@/lib/utils/cn";

export default function ProjectionsPage() {
  const {
    hasData,
    snapshot,
    workingPlan,
    settings,
    accountBalances,
    accountTitlesByChartstring,
    updateSettings,
    toggleHiddenEmployeeFund,
    toggleNotMyAccount,
    updateFundingSourceAlias,
  } = useApp();

  const { configured, user, cloudSyncEnabled } = useAuth();
  const { activeOwner } = useWorkspace();
  const [tab, setTab] = useState<"person" | "account">("person");
  const [editing, setEditing] = useState<{ employee: Employee; source: FundingSource } | null>(
    null
  );
  const [lockingIn, setLockingIn] = useState<ChangeRequestDetails | null>(null);
  // A handoff needs both parties: the request row and email are cloud-side.
  const lockInReady = Boolean(configured && user && cloudSyncEnabled && activeOwner);
  /**
   * Same declutter model as Timeline: hiding never changes what a projection
   * computes (simulateProjections keeps a hidden fund's effort "in the mix"),
   * it only changes which rows are shown. One reveal set serves both tabs —
   * keyed by employee id in By Person, by funding-source id in By Account —
   * since the two views never render at the same time.
   */
  const [showHiddenFunds, setShowHiddenFunds] = useState(false);
  const [revealHidden, setRevealHidden] = useState<Set<string>>(() => new Set());
  const totalHiddenFunds = countAllHiddenFunds(settings);

  const employees = useMemo(
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

  const result = useMemo(() => {
    if (!snapshot) return null;
    return simulateProjections({
      snapshot,
      workingPlan,
      settings,
      balances: accountBalances,
    });
  }, [snapshot, workingPlan, settings, accountBalances]);

  const plannedSourceIds = useMemo(() => {
    if (!snapshot) return new Set<string>();
    return new Set(unmatchedPlannedSources(settings, snapshot).map((p) => p.id));
  }, [settings, snapshot]);

  const originState = result?.states[0];
  const gapCount = originState
    ? employees.filter((e) => originState.coverageByEmployee[e.id]?.status === "underallocated")
        .length
    : 0;
  const originBurn = originState?.allocations.reduce((s, a) => s + a.monthlyBurn, 0) ?? 0;
  const ruleCount = settings.projectionRules?.length ?? 0;

  const horizonMonths = result?.months.length ?? 0;

  function setHorizon(preset: ProjectionHorizonPreset, customEndMonth?: string) {
    updateSettings({ projectionHorizon: { preset, customEndMonth } });
  }

  function saveRule(rule: ProjectionRule) {
    updateSettings({
      projectionRules: upsertRule(settings.projectionRules ?? [], rule),
    });
  }

  function removeRule(id: string) {
    updateSettings({
      projectionRules: (settings.projectionRules ?? []).filter((r) => r.id !== id),
    });
  }

  function addPlanned(planned: PlannedFundingSource) {
    const existing = settings.plannedFundingSources ?? [];
    updateSettings({ plannedFundingSources: [...existing, planned] });
  }

  /**
   * Snapshot the person's requested change for the Lock In dialog. Labels are
   * resolved here, with the PI's aliases, because the analyst reading the
   * email may not have them.
   */
  function openLockIn(employee: Employee) {
    if (!snapshot || !result) return;
    const aliasFor = (key: string) => {
      const fs = result.sources.find((s) => chartstringKeyForFundingSource(s) === key);
      return fs ? projectionSourceLabel(fs, settings, accountTitlesByChartstring) : key;
    };
    setLockingIn(
      buildChangeSummary({
        snapshot,
        workingPlan,
        settings,
        balances: accountBalances,
        employeeId: employee.id,
        personKey: employeePersonKey(employee),
        personName: employee.name,
        aliasFor,
      })
    );
  }

  /**
   * Removing a chartstring only ever unwinds this person's own plan (their
   * rules, plus a planned source nothing else uses). A pairing that comes
   * from imported payroll is a fact from the report, so the removal is
   * refused with the reason rather than hidden.
   */
  function removeChartstring(employee: Employee, source: FundingSource) {
    if (!snapshot) return;
    const chartstringKey = chartstringKeyForFundingSource(source);
    const label = projectionSourceLabel(source, settings, accountTitlesByChartstring);
    const check = checkChartstringRemoval({
      snapshot,
      workingPlan,
      settings,
      employeeId: employee.id,
      personKey: employeePersonKey(employee),
      chartstringKey,
    });
    if (!check.removable) {
      const first = check.months[0]!;
      const last = check.months[check.months.length - 1]!;
      const span =
        check.months.length === 1
          ? `in ${formatMonthLabel(first)}`
          : `from ${formatMonthLabel(first)} through ${formatMonthLabel(last)}`;
      window.alert(
        `${label} can't be removed from ${employee.name}'s list.\n\n` +
          `Your imported payroll report charges ${employee.name} to this account ${span}. ` +
          `Rows that come from a report reflect what actually happened, so Runway keeps them.\n\n` +
          `To stop projecting effort on this account, open its distribution rule and move the effort elsewhere.`
      );
      return;
    }
    const ruleCount = check.ruleIdsToDelete.length + check.remainderRuleIdsToRepair.length;
    const parts = [
      ruleCount > 0
        ? `This deletes or rewinds ${ruleCount} distribution rule${ruleCount === 1 ? "" : "s"} you set.`
        : null,
      check.removePlannedSourceId
        ? "The planned chartstring is removed too — nothing else references it."
        : null,
    ].filter(Boolean);
    const ok = window.confirm(
      [`Remove ${label} from ${employee.name}'s list?`, ...parts].join("\n\n")
    );
    if (!ok) return;
    const next = applyChartstringRemoval(settings, check);
    updateSettings({
      projectionRules: next.projectionRules,
      plannedFundingSources: next.plannedFundingSources,
    });
  }

  if (!hasData || !snapshot || !result) {
    return (
      <>
        <Header
          ledgerTitle
          title="Projections"
          subtitle="Carry current distributions forward and attach off-ramps"
        />
        <main className="flex-1 overflow-auto p-6">
          <EmptyState />
        </main>
      </>
    );
  }

  const { staleness, conflicts } = result;
  const displayMode = settings.displayMode ?? "percent";

  return (
    <>
      <Header
        ledgerTitle
        title="Projections"
        subtitle="Planning estimates from the current mix · assumes pay stays flat · personnel in this report only"
      />
      <main className="p-4">
        <div className="flex flex-col gap-4">
          {(staleness.payrollStale || staleness.balancesStale) && (
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
              {staleness.payrollStale && (
                <>
                  Payroll is through {staleness.lastPayrollMonth ?? "unknown"}; projecting{" "}
                  {formatMonthLabel(staleness.originMonth)} from the last known mix. Upload a new
                  report to refresh.
                </>
              )}
              {staleness.payrollStale && staleness.balancesStale ? " " : null}
              {staleness.balancesStale && (
                <>
                  Balances as of {staleness.balanceAsOf}. Depletion uses that snapshot, not
                  cash spent since.
                </>
              )}
            </p>
          )}

          {conflicts.length > 0 && (
            <div className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-950">
              <p className="font-medium">Payroll still disagrees with {conflicts.length} rule(s)</p>
              <ul className="mt-1 list-disc pl-4">
                {conflicts.slice(0, 5).map((c) => (
                  <li key={`${c.employeeId}|${c.ruleId}`}>
                    {c.employeeName}: {c.message} Open the rule and check “Apply from origin”.
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex flex-wrap gap-3">
            <Kpi label="Origin month" value={formatMonthLabel(result.originMonth)} />
            <Kpi label="Monthly personnel burn" value={formatCurrency(originBurn)} />
            <Kpi label="People with a coverage gap" value={String(gapCount)} />
            <Kpi label="Off-ramp rules" value={String(ruleCount)} />
          </div>

          {originState && (
            <div className="flex h-3 overflow-hidden rounded-full bg-slate-200">
              {summarizeOriginMix(result, settings, accountTitlesByChartstring).map((slice) => (
                <div
                  key={slice.key}
                  title={`${slice.label} ${formatPercent(slice.share * 100)}`}
                  style={{ width: `${slice.share * 100}%`, backgroundColor: slice.color }}
                />
              ))}
            </div>
          )}

          <div className="min-w-0 rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="shrink-0 border-b border-slate-200 bg-gradient-to-b from-slate-50 to-white px-4 py-3">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div className="flex flex-wrap items-end gap-5">
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                      View
                    </span>
                    <div className="inline-flex rounded-lg bg-slate-100/90 p-0.5 ring-1 ring-slate-200/80">
                      {(
                        [
                          { id: "person" as const, label: "By person" },
                          { id: "account" as const, label: "By account" },
                        ] as const
                      ).map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setTab(opt.id)}
                          className={cn(
                            "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                            tab === opt.id
                              ? "bg-[#0c2340] text-white shadow-sm"
                              : "text-slate-600 hover:bg-white hover:text-slate-900"
                          )}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <PersonnelGroupFilter
                    value={settings.personnelGroupFilter ?? []}
                    onChange={(personnelGroupFilter) => updateSettings({ personnelGroupFilter })}
                  />
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                      Display
                    </span>
                    <div className="inline-flex rounded-lg bg-slate-100/90 p-0.5 ring-1 ring-slate-200/80">
                      {(["percent", "dollars", "both"] as const).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          className={cn(
                            "rounded-md px-2.5 py-1 text-xs font-medium",
                            displayMode === mode
                              ? "bg-[#0c2340] text-white shadow-sm"
                              : "text-slate-600 hover:bg-white"
                          )}
                          onClick={() => updateSettings({ displayMode: mode })}
                        >
                          {mode === "percent" ? "%" : mode === "dollars" ? "$" : "Both"}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                      Horizon
                    </span>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {(
                        [
                          ["fy", "Rest of FY"],
                          ["6", "6 mo"],
                          ["12", "12 mo"],
                          ["24", "24 mo"],
                          ["custom", "Custom"],
                        ] as const
                      ).map(([preset, label]) => (
                        <button
                          key={preset}
                          type="button"
                          className={cn(
                            "rounded-md px-2.5 py-1 text-xs font-medium",
                            (settings.projectionHorizon?.preset ?? "12") === preset
                              ? "bg-teal-700 text-white shadow-sm"
                              : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
                          )}
                          onClick={() => setHorizon(preset, settings.projectionHorizon?.customEndMonth)}
                        >
                          {label}
                        </button>
                      ))}
                      {(settings.projectionHorizon?.preset ?? "12") === "custom" && (
                        <input
                          type="month"
                          className="rounded border px-2 py-1 text-xs"
                          value={settings.projectionHorizon?.customEndMonth ?? result.originMonth}
                          onChange={(e) => setHorizon("custom", e.target.value)}
                        />
                      )}
                      <span className="text-[11px] text-slate-500">{horizonMonths} months</span>
                    </div>
                  </div>
                </div>
                <FreezeHeaderToggle
                  frozen={settings.freezeGridHeader !== false}
                  onChange={(freezeGridHeader) => updateSettings({ freezeGridHeader })}
                />
              </div>
              <div className="mt-3 border-t border-slate-100 pt-3">
                <AddToPersonBar
                  employees={employees}
                  sources={result.sources}
                  settings={settings}
                  accountTitlesByChartstring={accountTitlesByChartstring}
                  onAddPlanned={addPlanned}
                  onSaveRule={saveRule}
                  originMonth={result.originMonth}
                />
              </div>

              {/* Same block as TimelineToolbar's — one shared setting, so hiding
                  here is the same act as hiding on Timeline or Runway. */}
              {(totalHiddenFunds > 0 || showHiddenFunds) && (
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    Funds
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setShowHiddenFunds((v) => !v);
                      if (showHiddenFunds) setRevealHidden(new Set());
                    }}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors",
                      showHiddenFunds
                        ? "bg-teal-50 text-teal-900 ring-1 ring-teal-200"
                        : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
                    )}
                    title={
                      showHiddenFunds
                        ? "Hide fund rows you marked with the eye icon"
                        : "Show hidden fund rows so you can restore them with the eye icon on each row"
                    }
                  >
                    {showHiddenFunds ? (
                      <EyeOff className="h-3.5 w-3.5" />
                    ) : (
                      <Eye className="h-3.5 w-3.5" />
                    )}
                    {showHiddenFunds
                      ? "Hiding excluded funds"
                      : `Show ${totalHiddenFunds} hidden fund${totalHiddenFunds === 1 ? "" : "s"}`}
                  </button>
                  <span className="text-[11px] text-slate-500">
                    Use the eye icon on a fund row to exclude accounts you do not manage.
                  </span>
                </div>
              )}
            </div>

            {tab === "person" ? (
              <ByPersonView
                employees={employees}
                settings={settings}
                result={result}
                displayMode={displayMode}
                accountTitlesByChartstring={accountTitlesByChartstring}
                onEdit={(employee, source) => setEditing({ employee, source })}
                showHiddenFunds={showHiddenFunds}
                revealHidden={revealHidden}
                onRevealHidden={(key) => setRevealHidden((p) => new Set(p).add(key))}
                onToggleHiddenFund={toggleHiddenEmployeeFund}
                onToggleNotMyAccount={toggleNotMyAccount}
                onSaveAlias={updateFundingSourceAlias}
                onRemoveChartstring={removeChartstring}
                onLockIn={openLockIn}
                lockInReady={lockInReady}
              />
            ) : (
              <ByAccountView
                employees={employees}
                settings={settings}
                result={result}
                plannedSourceIds={plannedSourceIds}
                displayMode={displayMode}
                accountTitlesByChartstring={accountTitlesByChartstring}
                onEdit={(employee, source) => setEditing({ employee, source })}
                showHiddenFunds={showHiddenFunds}
                revealHidden={revealHidden}
                onRevealHidden={(key) => setRevealHidden((p) => new Set(p).add(key))}
                onToggleHiddenFund={toggleHiddenEmployeeFund}
                onToggleNotMyAccount={toggleNotMyAccount}
                onSaveAlias={updateFundingSourceAlias}
              />
            )}
          </div>
        </div>
      </main>
      {editing && (
        <RuleEditor
          employee={editing.employee}
          source={editing.source}
          settings={settings}
          originMonth={result.originMonth}
          result={result}
          accountTitlesByChartstring={accountTitlesByChartstring}
          onSave={saveRule}
          onRemove={removeRule}
          onAddPlanned={addPlanned}
          onClose={() => setEditing(null)}
        />
      )}
      {lockingIn && lockInReady && activeOwner && (
        <LockInDialog
          details={lockingIn}
          piUserId={activeOwner.userId}
          createdByEmail={user?.email ?? ""}
          isSelfWorkspace={activeOwner.isSelf}
          onClose={() => setLockingIn(null)}
        />
      )}
    </>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-[12.5rem] flex-none rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <p className="text-[10px] font-medium uppercase leading-snug tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-lg font-semibold tabular-nums text-[#0c2340]">{value}</p>
    </div>
  );
}

function summarizeOriginMix(
  result: NonNullable<ReturnType<typeof simulateProjections>>,
  settings: AppSettings,
  accountTitlesByChartstring: Map<string, string>
) {
  const origin = result.states[0];
  if (!origin) return [];
  const byKey = new Map<string, { burn: number; color: string; label: string }>();
  let total = 0;
  for (const a of origin.allocations) {
    const fs = result.sources.find((s) => s.id === a.fundingSourceId || chartstringKey(s) === a.chartstringKey);
    const prev = byKey.get(a.chartstringKey) ?? {
      burn: 0,
      color: fs?.color ?? "#cbd5e1",
      label: fs ? projectionSourceLabel(fs, settings, accountTitlesByChartstring) : a.chartstringKey,
    };
    prev.burn += a.monthlyBurn;
    byKey.set(a.chartstringKey, prev);
    total += a.monthlyBurn;
  }
  if (total <= 0) return [];
  return [...byKey.entries()]
    .map(([key, v]) => ({ key, share: v.burn / total, color: v.color, label: v.label }))
    .sort((a, b) => b.share - a.share)
    .slice(0, 8);
}

function chartstringKey(fs: FundingSource) {
  return (fs.accountString ?? fs.rawName).trim().toLowerCase();
}

function AddToPersonBar({
  employees,
  sources,
  settings,
  accountTitlesByChartstring,
  onAddPlanned,
  onSaveRule,
  originMonth,
}: {
  employees: Employee[];
  sources: FundingSource[];
  settings: AppSettings;
  accountTitlesByChartstring: Map<string, string>;
  onAddPlanned: (planned: PlannedFundingSource) => void;
  onSaveRule: (rule: ProjectionRule) => void;
  originMonth: string;
}) {
  const [employeeId, setEmployeeId] = useState(employees[0]?.id ?? "");
  const [sourceId, setSourceId] = useState(sources[0]?.id ?? "");
  const [pct, setPct] = useState("100");
  const [newAlias, setNewAlias] = useState("");

  return (
    <div className="flex flex-wrap items-end gap-2 text-sm">
      <label className="text-xs text-slate-600">
        Put
        <select
          className="ml-1 rounded border px-2 py-1 text-sm"
          value={employeeId}
          onChange={(e) => setEmployeeId(e.target.value)}
        >
          {employees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs text-slate-600">
        on
        <select
          className="ml-1 rounded border px-2 py-1 text-sm"
          value={sourceId}
          onChange={(e) => setSourceId(e.target.value)}
        >
          {sources.map((s) => (
            <option key={s.id} value={s.id}>
              {projectionSourceLabel(s, settings, accountTitlesByChartstring)}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs text-slate-600">
        at
        <input
          className="ml-1 w-16 rounded border px-2 py-1"
          value={pct}
          onChange={(e) => setPct(e.target.value)}
        />
        %
      </label>
      <button
        type="button"
        className="rounded bg-teal-700 px-3 py-1.5 text-xs font-medium text-white"
        onClick={() => {
          const emp = employees.find((e) => e.id === employeeId);
          const fs = sources.find((s) => s.id === sourceId);
          if (!emp || !fs) return;
          onSaveRule({
            id: generateId(),
            personKey: employeePersonKey(emp),
            chartstringKey: chartstringKey(fs),
            trigger: {
              type: "setEffort",
              fromMonth: originMonth,
              percentEffort: Number(pct) || 0,
            },
            remainder: { kind: "uncovered" },
            applyOverPayroll: true,
          });
        }}
      >
        Set from origin
      </button>
      <span className="text-slate-300">|</span>
      <input
        className="rounded border px-2 py-1 text-xs"
        placeholder="New chartstring alias"
        value={newAlias}
        onChange={(e) => setNewAlias(e.target.value)}
      />
      <button
        type="button"
        className="rounded border px-3 py-1.5 text-xs font-medium"
        onClick={() => {
          if (!newAlias.trim()) return;
          const id = generateId();
          const planned: PlannedFundingSource = {
            id,
            chartstringKey: `planned:${id}`,
            alias: newAlias.trim(),
            color: "#dce4fc",
          };
          onAddPlanned(planned);
          setSourceId(id);
          setNewAlias("");
        }}
      >
        Add chartstring
      </button>
    </div>
  );
}
