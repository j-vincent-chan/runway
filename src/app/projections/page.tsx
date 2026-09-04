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
  isDistributionLocked,
  lockedEditMessage,
  lockedPersonKeys,
  setDistributionLock,
} from "@/lib/projections/lock";
import {
  buildChangeSummary,
  type ChangeRequestDetails,
} from "@/lib/projections/changeSummary";
import { LockInDialog } from "@/components/projections/LockInDialog";
import { UnlockDialog } from "@/components/projections/UnlockDialog";
import {
  fetchOpenRequestForPerson,
  setChangeRequestHold,
  withdrawChangeRequest,
  type ChangeRequestRecord,
} from "@/lib/supabase/changeRequests";
import { useAuth } from "@/context/AuthContext";
import { useWorkspace } from "@/context/WorkspaceContext";
import { AddToPersonBar } from "@/components/projections/AddToPersonBar";
import { ByPersonView } from "@/components/projections/ByPersonView";
import { ByAccountView } from "@/components/projections/ByAccountView";
import { RuleEditor } from "@/components/projections/RuleEditor";
import { countAllHiddenFunds } from "@/lib/funding/visibility";
import { Eye, EyeOff } from "lucide-react";
import { FreezeHeaderToggle } from "@/components/grid/FreezeHeaderToggle";
import { PersonnelGroupFilter } from "@/components/employees/PersonnelGroupFilter";
import { employeePersonKey } from "@/lib/employees/stableKey";
import { DEEP_LINK_PARAM } from "@/lib/navigation/deepLinks";
import { useDeepLinkTarget } from "@/lib/navigation/useDeepLinkTarget";
import type {
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
  const [unlocking, setUnlocking] = useState<{
    employee: Employee;
    request: ChangeRequestRecord;
  } | null>(null);
  const lockedKeys = useMemo(() => lockedPersonKeys(settings), [settings]);
  // The Dashboard's "Reassign" rows land here with the person preselected.
  const deepLinkedPerson = useDeepLinkTarget("person", DEEP_LINK_PARAM.person);
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

  const horizonMonths = result?.months.length ?? 0;

  function setHorizon(preset: ProjectionHorizonPreset, customEndMonth?: string) {
    updateSettings({ projectionHorizon: { preset, customEndMonth } });
  }

  /**
   * Every write to a person's plan funnels through these two, so the lock is
   * checked here rather than only on the controls that call them — a disabled
   * button is the affordance, this is the guarantee.
   */
  function saveRule(rule: ProjectionRule) {
    if (isDistributionLocked(settings, rule.personKey)) {
      window.alert(lockedEditMessage(nameForPersonKey(rule.personKey)));
      return;
    }
    updateSettings({
      projectionRules: upsertRule(settings.projectionRules ?? [], rule),
    });
  }

  function removeRule(id: string) {
    const rule = (settings.projectionRules ?? []).find((r) => r.id === id);
    if (rule && isDistributionLocked(settings, rule.personKey)) {
      window.alert(lockedEditMessage(nameForPersonKey(rule.personKey)));
      return;
    }
    updateSettings({
      projectionRules: (settings.projectionRules ?? []).filter((r) => r.id !== id),
    });
  }

  /** The lock stores personKeys; refusals still have to name a person. */
  function nameForPersonKey(personKey: string): string {
    return employees.find((e) => employeePersonKey(e) === personKey)?.name ?? "This person";
  }

  /**
   * Unlocking is always available so a locked person can never be stranded,
   * but what it means depends on where their request is:
   * - never emailed → the queued request is put on hold with the unlock, so
   *   nothing the PI has expressed doubt about ships in the morning digest;
   * - already emailed → the PI chooses (UnlockDialog): revising keeps the
   *   request open on hold, withdrawing closes it and the next digest tells
   *   the analyst no action is needed;
   * - no open request → a plain unlock.
   */
  function applyUnlock(personKey: string) {
    updateSettings({
      lockedDistributions: setDistributionLock(settings, personKey, false),
    });
  }

  function unlockDistribution(employee: Employee) {
    const personKey = employeePersonKey(employee);
    void (async () => {
      const request = await fetchOpenRequestForPerson(personKey);
      if (!request) {
        if (window.confirm(`Unlock ${employee.name}'s distribution to edit their plan again?`)) {
          applyUnlock(personKey);
        }
        return;
      }
      if (!request.emailSentAt) {
        const ok = window.confirm(
          `Unlock ${employee.name}'s distribution?\n\n` +
            `Their queued request will be held and won't be emailed until you lock in again.`
        );
        if (!ok) return;
        await setChangeRequestHold(request.id, true);
        applyUnlock(personKey);
        return;
      }
      setUnlocking({ employee, request });
    })();
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
    if (!snapshot || !result) return;
    if (isDistributionLocked(settings, employeePersonKey(employee))) {
      window.alert(lockedEditMessage(employee.name));
      return;
    }
    const chartstringKey = chartstringKeyForFundingSource(source);
    const label = projectionSourceLabel(source, settings, accountTitlesByChartstring);
    const check = checkChartstringRemoval({
      snapshot,
      workingPlan,
      settings,
      employeeId: employee.id,
      personKey: employeePersonKey(employee),
      chartstringKey,
      originMonth: result.originMonth,
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
          `Your imported payroll report still charges ${employee.name} to this account ${span} — ` +
          `it is part of their current distribution, not history.\n\n` +
          `To stop projecting effort on this account, open its distribution rule and move the effort elsewhere.`
      );
      return;
    }
    const ruleCount = check.ruleIdsToDelete.length + check.remainderRuleIdsToRepair.length;
    const history = check.historicalMonths;
    const parts = [
      ruleCount > 0
        ? `This deletes or rewinds ${ruleCount} distribution rule${ruleCount === 1 ? "" : "s"} you set.`
        : null,
      history.length > 0
        ? `${employee.name} was charged here ${
            history.length === 1
              ? `in ${formatMonthLabel(history[0]!)}`
              : `from ${formatMonthLabel(history[0]!)} through ${formatMonthLabel(
                  history[history.length - 1]!
                )}`
          }. That history stays exactly as imported — this only takes the account off their Projections list.`
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
            <p className="rounded-lg border border-caution bg-caution-soft px-3 py-2 text-xs text-caution">
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

          <div className="min-w-0 rounded-xl border border-rule bg-surface shadow-sm">
            <div className="shrink-0 border-b border-rule px-4 py-3">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div className="flex flex-wrap items-end gap-5">
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                      View
                    </span>
                    <div className="inline-flex rounded-lg bg-inset/90 p-0.5 ring-1 ring-rule/80">
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
                              ? "bg-brand-ground text-white shadow-sm"
                              : "text-ink-2 hover:bg-surface hover:text-ink"
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
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">
                      Display
                    </span>
                    <div className="inline-flex rounded-lg bg-inset/90 p-0.5 ring-1 ring-rule/80">
                      {(["percent", "dollars", "both"] as const).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          className={cn(
                            "rounded-md px-2.5 py-1 text-xs font-medium",
                            displayMode === mode
                              ? "bg-brand-ground text-white shadow-sm"
                              : "text-ink-2 hover:bg-surface"
                          )}
                          onClick={() => updateSettings({ displayMode: mode })}
                        >
                          {mode === "percent" ? "%" : mode === "dollars" ? "$" : "Both"}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">
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
                              ? "bg-accent text-on-accent shadow-sm"
                              : "bg-surface text-ink-2 ring-1 ring-rule hover:bg-inset"
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
                      <span className="text-[11px] text-muted">{horizonMonths} months</span>
                    </div>
                  </div>
                </div>
                <FreezeHeaderToggle
                  frozen={settings.freezeGridHeader !== false}
                  onChange={(freezeGridHeader) => updateSettings({ freezeGridHeader })}
                />
              </div>
              <div className="mt-3 border-t border-rule pt-3">
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
                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-rule pt-3">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">
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
                        ? "bg-accent-soft text-accent ring-1 ring-accent"
                        : "bg-surface text-ink-2 ring-1 ring-rule hover:bg-inset"
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
                  <span className="text-[11px] text-muted">
                    Use the eye icon on a fund row to mark an account as not my account.
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
                onUnlock={unlockDistribution}
                lockedPersonKeys={lockedKeys}
                highlightPersonKey={deepLinkedPerson}
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
                lockedPersonKeys={lockedKeys}
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
      {unlocking && (
        <UnlockDialog
          request={unlocking.request}
          personName={unlocking.employee.name}
          onRevise={() => {
            const personKey = employeePersonKey(unlocking.employee);
            void setChangeRequestHold(unlocking.request.id, true).then(() => {
              applyUnlock(personKey);
              setUnlocking(null);
            });
          }}
          onWithdraw={() => {
            const personKey = employeePersonKey(unlocking.employee);
            void withdrawChangeRequest(unlocking.request, user?.email ?? "").then((r) => {
              if (!r.ok) {
                window.alert(r.error ?? "The request could not be withdrawn. Try again.");
                return;
              }
              applyUnlock(personKey);
              setUnlocking(null);
            });
          }}
          onClose={() => setUnlocking(null)}
        />
      )}
      {lockingIn && lockInReady && activeOwner && (
        <LockInDialog
          details={lockingIn}
          piUserId={activeOwner.userId}
          createdByEmail={user?.email ?? ""}
          isSelfWorkspace={activeOwner.isSelf}
          // The handoff succeeded, so the plan behind it is now final until
          // the PI deliberately unlocks it.
          onLocked={() =>
            updateSettings({
              lockedDistributions: setDistributionLock(settings, lockingIn.personKey, true),
            })
          }
          onClose={() => setLockingIn(null)}
        />
      )}
    </>
  );
}
