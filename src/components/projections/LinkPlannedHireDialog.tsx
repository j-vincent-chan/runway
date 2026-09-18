"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { Employee, ReconciliationChoice } from "@/types";
import { useApp } from "@/context/AppContext";
import { calculateEmployeeCoverage, calculateMonthlyCost, getAllocations } from "@/lib/calculations";
import { getEmployeePersonnelType, getPersonnelTypeDisplayLabel } from "@/lib/employees/personnelType";
import { employeePersonKey } from "@/lib/employees/stableKey";
import { compareEmployeesByLastName } from "@/lib/employees/lastName";
import { addMonthsYm, formatMonthLabel, getProjectionOriginMonth } from "@/lib/projections/horizon";
import {
  chartstringKeyForFundingSource,
  lookupFundingSource,
  projectionFundingSources,
  projectionSourceLabel,
} from "@/lib/projections/sources";
import { chargedMonths, inProgressMonth, reportRunDay } from "@/lib/reconciliation/closure";
import { fyRateAvailable } from "@/lib/reconciliation/forecastRate";
import { buildLinkImpact } from "@/lib/reconciliation/impact";
import { activeLinks } from "@/lib/reconciliation/links";
import { plannedMonthlyComp } from "@/lib/reconciliation/plans";
import { evaluateMatchSignals, type MatchSignal } from "@/lib/reconciliation/suggest";
import type { PlannedHireRow } from "@/lib/reconciliation/view";
import { cn } from "@/lib/utils/cn";
import { formatCurrency, formatIsoDateDisplay, formatPercent } from "@/lib/utils/parse";

type Choice = Pick<ReconciliationChoice, "forecastRate" | "pinPlannedRate" | "distribution">;

const MONO_CAPTION = "font-mono text-[11.5px] uppercase tracking-[0.11em] text-muted";
const PROJECTED = "underline decoration-dotted decoration-control underline-offset-2";

function personLabel(emp: Employee): string {
  return emp.employeeId ? `${emp.name} (${emp.employeeId})` : emp.name;
}

/**
 * Plan vs. imported person side by side, the five signals, the two choices
 * that drive the forecast from the month after origin, what stays as it is,
 * and the impact on the person's total and each account's dry month — the
 * last computed by running the engine twice, never by re-deriving.
 * Confirm records identity and finance as two rows plus one event; it never
 * edits an imported row, and Unlink reverses it.
 */
export function LinkPlannedHireDialog({
  row,
  mode,
  initialPersonKey,
  onClose,
}: {
  row: PlannedHireRow;
  mode: "suggested" | "manual";
  initialPersonKey?: string;
  onClose: () => void;
}) {
  const {
    snapshot,
    workingPlan,
    settings,
    accountBalances,
    accountTitlesByChartstring,
    reconciliation,
    linkPlannedHire,
    dismissMatch,
  } = useApp();
  const plan = row.plan;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const employees = useMemo(() => snapshot?.employees ?? [], [snapshot]);
  /** People a plan can be linked to: on the report and not already filling a plan. */
  const candidates = useMemo(() => {
    const linkedKeys = new Set(activeLinks(settings).map((l) => l.employeePersonKey));
    return employees
      .filter((e) => !linkedKeys.has(employeePersonKey(e)))
      .sort((a, b) => {
        const an = reconciliation.newInReportKeys.has(employeePersonKey(a)) ? 0 : 1;
        const bn = reconciliation.newInReportKeys.has(employeePersonKey(b)) ? 0 : 1;
        return an - bn || compareEmployeesByLastName(a, b);
      });
  }, [employees, settings, reconciliation.newInReportKeys]);

  const [personKey, setPersonKey] = useState(
    initialPersonKey ?? row.suggestion?.employeePersonKey ?? ""
  );
  const [forecastRate, setForecastRate] = useState<Choice["forecastRate"]>("planned");
  const [pinPlannedRate, setPin] = useState(false);
  const [distribution, setDistribution] = useState<Choice["distribution"]>("plan");
  const choice: Choice = { forecastRate, pinPlannedRate, distribution };

  const employee = employees.find((e) => employeePersonKey(e) === personKey);
  const effectiveFrom = addMonthsYm(getProjectionOriginMonth(), 1);
  const reportLabel = reconciliation.reportMonth ? formatMonthLabel(reconciliation.reportMonth) : null;

  const sources = useMemo(
    () => (snapshot ? projectionFundingSources(snapshot, settings) : []),
    [snapshot, settings]
  );
  const labelForKey = (key: string) => {
    const fs = lookupFundingSource(sources, key);
    return fs ? projectionSourceLabel(fs, settings, accountTitlesByChartstring) : key;
  };

  /** Everything the IMPORTED column says, from the snapshot's own rows. */
  const imported = useMemo(() => {
    if (!snapshot || !employee) return null;
    const charged = chargedMonths(snapshot, employee.id);
    const first = charged[0] ?? null;
    const last = charged[charged.length - 1] ?? null;
    const allocations = getAllocations(snapshot, workingPlan);
    const inProgress = last !== null && inProgressMonth(snapshot) === last;
    const posted = last ? calculateMonthlyCost(employee.id, last, snapshot.monthlyCosts).total : 0;
    const appointment = first
      ? calculateEmployeeCoverage(employee, first, allocations).allocatedPercent
      : employee.appointmentPercent;
    const byId = new Map(snapshot.fundingSources.map((fs) => [fs.id, fs]));
    const mixAt = (month: string, futureOnly: boolean) =>
      allocations
        .filter(
          (a) =>
            a.employeeId === employee.id &&
            a.month === month &&
            a.percentEffort > 0 &&
            (!futureOnly || a.sourceType === "future")
        )
        .map((a) => {
          const fs = byId.get(a.fundingSourceId);
          return { key: fs ? chartstringKeyForFundingSource(fs) : a.fundingSourceId, pct: a.percentEffort };
        })
        .sort((a, b) => b.pct - a.pct);
    const firstFutureMonth = allocations
      .filter((a) => a.employeeId === employee.id && a.sourceType === "future" && (!last || a.month > last))
      .map((a) => a.month)
      .sort()[0];
    const team = getEmployeePersonnelType(settings, employee.id);
    return {
      first,
      last,
      inProgress,
      posted,
      appointment,
      mix: last ? mixAt(last, false) : [],
      future: firstFutureMonth ? { month: firstFutureMonth, mix: mixAt(firstFutureMonth, true) } : null,
      team,
      fyMonthly: fyRateAvailable(employee)
        ? plannedMonthlyComp({ annualSalary: employee.annualSalary!, benefitsRatePct: plan.benefitsRatePct })
        : null,
    };
  }, [snapshot, workingPlan, settings, employee, plan.benefitsRatePct]);

  const signals: MatchSignal[] = useMemo(() => {
    if (!snapshot || !employee) return [];
    if (mode === "suggested" && row.suggestion && row.suggestion.employeePersonKey === personKey) {
      return row.suggestion.signals;
    }
    return evaluateMatchSignals({
      snapshot,
      previousSnapshot: reconciliation.previousSnapshot,
      plan,
      employee,
      rules: settings.projectionRules ?? [],
      newKeys: reconciliation.newInReportKeys,
      reportMonth: reconciliation.reportMonth,
      labelForSource: (fs) => projectionSourceLabel(fs, settings, accountTitlesByChartstring),
    }).signals;
  }, [snapshot, employee, mode, row.suggestion, personKey, reconciliation, plan, settings, accountTitlesByChartstring]);
  const passCount = signals.filter((s) => s.status === "pass").length;

  const impact = useMemo(() => {
    if (!snapshot || !employee) return null;
    return buildLinkImpact({
      snapshot,
      workingPlan,
      settings,
      balances: accountBalances,
      plannedHireId: plan.id,
      employee,
      choice,
      labelForKey,
    });
    // labelForKey is derived from the same inputs listed here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot, workingPlan, settings, accountBalances, plan.id, employee, forecastRate, pinPlannedRate, distribution]);

  const planSplit = row.accounts.map((a) => `${a.percent}% ${a.label}`).join(" · ") || "no account yet";
  const mixLabel = (mix: { key: string; pct: number }[]) =>
    mix.length === 0 ? "—" : mix.map((m) => `${formatPercent(m.pct)} ${labelForKey(m.key)}`).join(" · ");
  const planMixKey = row.accounts.map((a) => `${a.chartstringKey}:${a.percent}`).sort().join("|");
  const importedMixKey = imported ? imported.mix.map((m) => `${m.key}:${m.pct}`).sort().join("|") : "";
  const signal = (id: MatchSignal["id"]) => signals.find((s) => s.id === id)?.status;
  const runDay = snapshot ? reportRunDay(snapshot.reportDate) : null;

  function confirm() {
    if (!employee) return;
    const result = linkPlannedHire({
      plannedHireId: plan.id,
      employeePersonKey: personKey,
      basis: mode,
      signals: signals.filter((s) => s.status === "pass").map((s) => s.id),
      choice,
    });
    if (!result.ok) {
      window.alert(result.reason ?? "The link could not be made.");
      return;
    }
    onClose();
  }

  function notAMatch() {
    if (!personKey) return;
    dismissMatch(plan.id, personKey);
    onClose();
  }

  const compareRows: { field: string; planned: string; imported: string; differs: boolean }[] =
    employee && imported
      ? [
          {
            field: "Start",
            planned: `${formatMonthLabel(plan.startMonth)} (planned)`,
            imported: imported.first ? `First charged ${formatMonthLabel(imported.first)}` : "No posted pay yet",
            differs: signal("startWindow") === "fail",
          },
          {
            field: "Role",
            planned: plan.role ?? "—",
            imported: employee.role ? `${employee.role} (payroll title)` : "— (no payroll title)",
            differs: signal("title") === "fail",
          },
          {
            field: "Appointment",
            planned: `${plan.appointmentPercent}%`,
            imported: imported.first
              ? `${formatPercent(imported.appointment)} (Total Percent of Effort, ${formatMonthLabel(imported.first)})`
              : `${employee.appointmentPercent}%`,
            differs: Math.abs(imported.appointment - plan.appointmentPercent) > 0.5,
          },
          {
            field: "Team",
            planned: plan.teamId ? getPersonnelTypeDisplayLabel(plan.teamId, settings) : "—",
            imported: imported.team
              ? getPersonnelTypeDisplayLabel(imported.team, settings)
              : plan.teamId
                ? "— · copied from the plan on confirm"
                : "—",
            differs: Boolean(imported.team && plan.teamId && imported.team !== plan.teamId),
          },
          {
            field: "Monthly S+B",
            planned: `~${formatCurrency(row.monthlyComp)} planned · ${formatCurrency(plan.annualSalary)} at ${plan.benefitsRatePct}% benefits`,
            imported: imported.last
              ? `${formatCurrency(imported.posted)} posted in ${formatMonthLabel(imported.last)}${
                  imported.inProgress
                    ? ` · in progress${runDay ? ` (report run ${formatIsoDateDisplay(runDay)})` : ""}`
                    : ""
                }`
              : "No posted pay yet",
            differs: Math.abs(imported.posted - row.monthlyComp) > 1,
          },
          {
            field: "Distribution",
            planned: planSplit,
            imported: `${mixLabel(imported.mix)}${imported.last ? ` (${formatMonthLabel(imported.last)})` : ""}${
              imported.future ? ` · future rows ${mixLabel(imported.future.mix)}` : ""
            }`,
            differs: planMixKey !== importedMixKey,
          },
        ]
      : [];

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-end justify-end bg-black/30 p-0 sm:items-center sm:justify-center sm:p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="link-plan-title"
        className="max-h-[90vh] w-full max-w-3xl overflow-auto rounded-t-xl bg-surface p-5 shadow-xl sm:rounded-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id="link-plan-title" className="text-lg font-semibold text-ink">
              {mode === "manual"
                ? "Link planned hire to an existing employee"
                : "Link planned hire to imported employee"}
            </h2>
            <p className="mt-1 text-sm text-ink-2">
              {plan.displayName}
              {employee ? ` · ${personLabel(employee)}` : ""}
            </p>
          </div>
          <button type="button" className="text-sm text-muted hover:text-ink" onClick={onClose}>
            Close
            <X className="ml-1 inline h-4 w-4" aria-hidden />
          </button>
        </div>

        {mode === "manual" && (
          <label className="mt-4 block text-sm text-ink-2">
            Who appears in payroll for this plan?
            <select
              className="mt-1 w-full rounded border border-control bg-surface px-2 py-1.5 text-sm text-ink"
              value={personKey}
              onChange={(e) => setPersonKey(e.target.value)}
            >
              <option value="">Choose a person…</option>
              {candidates.map((e) => {
                const key = employeePersonKey(e);
                const isNew = reconciliation.newInReportKeys.has(key);
                return (
                  <option key={e.id} value={key}>
                    {personLabel(e)}
                    {isNew && reportLabel ? ` · new in ${reportLabel}` : ""}
                  </option>
                );
              })}
            </select>
            <span className="mt-1 block text-xs text-muted">
              People new in the latest report are listed first. A manual link asserts these are the
              same person; the signals below are shown for the record, not as a gate.
            </span>
          </label>
        )}

        {employee && imported && (
          <table className="mt-4 w-full text-sm">
            <thead>
              <tr className="border-b border-rule text-left">
                <th className={cn("py-1.5 pr-3 font-medium", MONO_CAPTION)}>Field</th>
                <th className={cn("py-1.5 pr-3 font-medium", MONO_CAPTION)}>Planned · {plan.displayName}</th>
                <th className={cn("py-1.5 font-medium", MONO_CAPTION)}>Imported · {employee.name}</th>
              </tr>
            </thead>
            <tbody>
              {compareRows.map((r) => (
                <tr key={r.field} className="border-b border-rule align-top">
                  <td className="py-2 pr-3 text-muted">{r.field}</td>
                  <td className="py-2 pr-3 text-ink-2">{r.planned}</td>
                  <td className={cn("py-2 text-ink-2", r.differs && "font-semibold text-ink")}>{r.imported}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {employee && signals.length > 0 && (
          <div className="mt-4">
            <p className="text-sm font-medium text-ink">
              {mode === "suggested"
                ? `Why this match is suggested (${passCount} of 5 signals)`
                : `Signals for the record (${passCount} of 5)`}
            </p>
            <ul className="mt-1.5 space-y-1 text-sm">
              {signals.map((s) => (
                <li key={s.id} className="flex gap-2">
                  <span
                    aria-hidden
                    className={cn(
                      "w-4 shrink-0 text-center font-mono",
                      s.status === "pass" ? "text-accent" : s.status === "fail" ? "text-critical" : "text-muted"
                    )}
                  >
                    {s.status === "pass" ? "✓" : s.status === "fail" ? "✕" : "–"}
                  </span>
                  <span className="sr-only">
                    {s.status === "pass" ? "Passes: " : s.status === "fail" ? "Fails: " : "Not compared: "}
                  </span>
                  <span className={cn(s.status === "neutral" ? "text-muted" : "text-ink-2")}>{s.label}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-muted">
              Runway suggests a match only when someone is new in the report, first charged within a
              month of the planned start, and shares an account, title or name with the plan. Name or
              title alone never suggests.
            </p>
          </div>
        )}

        {employee && imported && (
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <fieldset className="rounded-lg border border-rule p-3 text-sm">
              <legend className="px-1 font-medium text-ink">Forecast rate from {formatMonthLabel(effectiveFrom)}</legend>
              <label className="flex items-start gap-2">
                <input
                  type="radio"
                  name="forecast-rate"
                  className="mt-1"
                  checked={forecastRate === "planned"}
                  onChange={() => setForecastRate("planned")}
                />
                <span>
                  <span className="text-ink">Keep the planned rate until a full month closes</span>
                  <span className="mt-0.5 block text-xs text-ink-2">
                    <span className={PROJECTED} title={`${formatCurrency(plan.annualSalary)} ÷ 12 × (1 + ${plan.benefitsRatePct}% benefits)`}>
                      ~{formatCurrency(row.monthlyComp)}/mo
                    </span>{" "}
                    now. When a report arrives with the first closed full payroll month, the rate
                    switches to 12× that month&apos;s posted salary and benefits automatically and the
                    change is recorded in history.
                  </span>
                </span>
              </label>
              <label className={cn("mt-2 flex items-start gap-2", imported.fyMonthly === null && "opacity-60")}>
                <input
                  type="radio"
                  name="forecast-rate"
                  className="mt-1"
                  disabled={imported.fyMonthly === null}
                  checked={forecastRate === "fyRate"}
                  onChange={() => setForecastRate("fyRate")}
                />
                <span>
                  <span className="text-ink">Use the FY rate from the Employee and Position Salary Report</span>
                  <span className="mt-0.5 block text-xs text-ink-2">
                    {imported.fyMonthly === null ? (
                      `${employee.name} is not on the FY salary report.`
                    ) : (
                      <>
                        <span className={PROJECTED} title={`${formatCurrency(employee.annualSalary ?? 0)} ÷ 12 × (1 + ${plan.benefitsRatePct}% benefits)`}>
                          ~{formatCurrency(imported.fyMonthly)}/mo
                        </span>{" "}
                        at the plan&apos;s {plan.benefitsRatePct}% benefits, until a full month closes.
                      </>
                    )}
                  </span>
                </span>
              </label>
              <label className="mt-2 flex items-start gap-2">
                <input
                  type="radio"
                  name="forecast-rate"
                  className="mt-1"
                  checked={forecastRate === "payrollActual"}
                  onChange={() => setForecastRate("payrollActual")}
                />
                <span>
                  <span className="text-ink">Carry the posted amount forward</span>
                  <span className="mt-0.5 block text-xs text-ink-2">
                    What Runway does for everyone today
                    {imported.last ? `: ${formatCurrency(imported.posted)}/mo from ${formatMonthLabel(imported.last)}` : ""}.
                    {imported.inProgress ? (
                      <span className="text-caution"> That month is in progress, so this under-forecasts until the next report.</span>
                    ) : null}
                  </span>
                </span>
              </label>
              <label className="mt-3 flex items-start gap-2 text-xs text-ink-2">
                <input
                  type="checkbox"
                  className="mt-0.5"
                  checked={pinPlannedRate}
                  onChange={(e) => setPin(e.target.checked)}
                />
                Pin the planned rate even after a full payroll month closes
              </label>
            </fieldset>
            <fieldset className="rounded-lg border border-rule p-3 text-sm">
              <legend className="px-1 font-medium text-ink">Distribution from {formatMonthLabel(effectiveFrom)}</legend>
              <label className="flex items-start gap-2">
                <input
                  type="radio"
                  name="distribution"
                  className="mt-1"
                  checked={distribution === "plan"}
                  onChange={() => setDistribution("plan")}
                />
                <span>
                  <span className="text-ink">Keep the plan</span>
                  <span className="mt-0.5 block text-xs text-ink-2">{planSplit}</span>
                </span>
              </label>
              <label className={cn("mt-2 flex items-start gap-2", !imported.future && "opacity-60")}>
                <input
                  type="radio"
                  name="distribution"
                  className="mt-1"
                  disabled={!imported.future}
                  checked={distribution === "payrollFuture"}
                  onChange={() => setDistribution("payrollFuture")}
                />
                <span>
                  <span className="text-ink">Adopt payroll&apos;s future distribution</span>
                  <span className="mt-0.5 block text-xs text-ink-2">
                    {imported.future
                      ? `${mixLabel(imported.future.mix)} from ${formatMonthLabel(imported.future.month)}`
                      : "The report carries no future rows for this person."}
                  </span>
                </span>
              </label>
            </fieldset>
          </div>
        )}

        {employee && imported && (
          <div className="mt-4 text-sm">
            <p className="font-medium text-ink">What stays as it is</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-5 text-ink-2">
              <li>
                {imported.last ? `${formatMonthLabel(imported.last)} is replaced by the report for that month only` : "Posted months stay the report's"}
                ; imported rows are never edited.
              </li>
              <li>The plan keeps its original assumptions on Employees → Planned for comparison.</li>
              <li>Team, start and scope are copied onto {employee.name} only where blank.</li>
              <li>Rules you add after linking belong to {employee.name}, not the plan.</li>
              <li>Reversible with Unlink; both the link and its reversal are recorded in history.</li>
            </ul>
          </div>
        )}

        {employee && impact && (
          <div className="mt-4 rounded-lg border border-rule bg-inset px-4 py-3 text-sm">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-medium text-ink">Financial impact</p>
              <span className={MONO_CAPTION}>
                {formatMonthLabel(impact.months.from)} – {formatMonthLabel(impact.months.to)}
              </span>
            </div>
            <table className="mt-2 w-full">
              <thead>
                <tr className="text-left">
                  <th className={cn("py-1 pr-3 font-medium", MONO_CAPTION)}></th>
                  <th className={cn("py-1 pr-3 text-right font-medium", MONO_CAPTION)}>Counted today</th>
                  <th className={cn("py-1 text-right font-medium", MONO_CAPTION)}>After this link</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                <tr className="border-t border-rule">
                  <td className="py-1.5 pr-3 text-ink-2">{employee.name}&apos;s total</td>
                  <td
                    className={cn(
                      "py-1.5 pr-3 text-right",
                      impact.personImportedToday > 0 && impact.personPlannedToday > 0 ? "text-caution" : "text-ink"
                    )}
                    title={`${formatCurrency(impact.personImportedToday)} imported + ~${formatCurrency(impact.personPlannedToday)} planned`}
                  >
                    ~{formatCurrency(impact.personTotalToday)}
                  </td>
                  <td
                    className={cn("py-1.5 text-right text-ink", PROJECTED)}
                    title={`${formatCurrency(impact.personTotalAfter - impact.personPlannedToday) === "—" ? "" : ""}${
                      impact.personTotalAfter - impact.personPlannedToday >= 0 ? "+" : "−"
                    }${formatCurrency(Math.abs(impact.personTotalAfter - impact.personPlannedToday))} vs the plan's ~${formatCurrency(impact.personPlannedToday)} over the same months`}
                  >
                    ~{formatCurrency(impact.personTotalAfter)}
                  </td>
                </tr>
                {impact.accounts.map((a) => (
                  <tr key={a.chartstringKey} className="border-t border-rule">
                    <td className="py-1.5 pr-3 text-ink-2">{a.label} · projected dry</td>
                    <td className={cn("py-1.5 pr-3 text-right", a.dryToday ? "text-critical" : "text-ink-2")}>
                      {a.dryToday ? `~${formatMonthLabel(a.dryToday)}` : "not within horizon"}
                    </td>
                    <td className={cn("py-1.5 text-right", a.dryAfter ? "text-critical" : "text-ink-2")}>
                      {a.dryAfter ? `~${formatMonthLabel(a.dryAfter)}` : "not within horizon"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-muted">
              Both columns are the projection engine run twice — once as the grid stands, once with
              this link — over the horizon above. Planned figures carry a tilde.
            </p>
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
          {mode === "suggested" && personKey && (
            <button
              type="button"
              className="rounded-lg border border-caution px-3 py-1.5 text-sm font-medium text-caution hover:bg-caution/10"
              onClick={notAMatch}
            >
              Not a match
            </button>
          )}
          <button
            type="button"
            className="rounded-lg border border-rule px-3 py-1.5 text-sm font-medium text-ink-2 hover:bg-inset"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={!employee}
            className="rounded-lg bg-accent px-4 py-1.5 text-sm font-medium text-on-accent hover:bg-accent-hover disabled:opacity-50"
            onClick={confirm}
          >
            Confirm link
          </button>
        </div>
        <p className="mt-3 text-[11.5px] text-muted">
          Confirming records who linked and when. Imported payroll is never edited by a link.
          Reversible with Unlink.
        </p>
      </div>
    </div>,
    document.body
  );
}
