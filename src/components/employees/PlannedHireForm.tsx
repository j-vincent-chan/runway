"use client";

import { useMemo, useState } from "react";
import type {
  AppSettings,
  FundingSource,
  PersonnelType,
  PlannedHire,
  ProjectionRule,
} from "@/types";
import { PersonnelTypeSelect } from "@/components/employees/PersonnelTypeSelect";
import { getProjectionOriginMonth, formatMonthLabel } from "@/lib/projections/horizon";
import { chartstringKeyForFundingSource, projectionSourceLabel } from "@/lib/projections/sources";
import { plannedMonthlyComp, plannedPersonKey } from "@/lib/reconciliation/plans";
import { formatCurrency, generateId } from "@/lib/utils/parse";

const DEFAULT_BENEFITS_PCT = 32;
const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * The inline "Add planned hire" panel — same pattern as the lab-photo URL
 * prompt in the toolbar row. Add writes the plan and its split as ordinary
 * distribution rules keyed to the plan, the same way an existing person's
 * plan is stored, so Projections needs no second path to draw the row.
 */
export function PlannedHireForm({
  sources,
  settings,
  accountTitlesByChartstring,
  createdBy,
  onAdd,
  onCancel,
}: {
  sources: FundingSource[];
  settings: AppSettings;
  accountTitlesByChartstring?: Map<string, string>;
  createdBy: string;
  onAdd: (plan: PlannedHire, rules: ProjectionRule[]) => void;
  onCancel: () => void;
}) {
  const [displayName, setDisplayName] = useState("");
  const [role, setRole] = useState("");
  const [teamId, setTeamId] = useState<PersonnelType | undefined>(undefined);
  const [startMonth, setStartMonth] = useState(getProjectionOriginMonth());
  const [appointment, setAppointment] = useState("100");
  const [salary, setSalary] = useState("");
  const [benefits, setBenefits] = useState(String(DEFAULT_BENEFITS_PCT));
  const [accountId, setAccountId] = useState(sources[0]?.id ?? "");
  const [accountPct, setAccountPct] = useState("100");
  const [secondAccountId, setSecondAccountId] = useState("");
  const [secondPct, setSecondPct] = useState("");
  const [error, setError] = useState<string | null>(null);

  const annualSalary = Number(salary) || 0;
  const benefitsRatePct = Number(benefits) || 0;
  const appointmentPercent = Number(appointment) || 0;
  const monthly = useMemo(
    () => (annualSalary > 0 ? plannedMonthlyComp({ annualSalary, benefitsRatePct }) : 0),
    [annualSalary, benefitsRatePct]
  );

  const label = (fs: FundingSource) => projectionSourceLabel(fs, settings, accountTitlesByChartstring);
  const inputClass = "rounded border border-control bg-surface px-2 py-1 text-sm";

  function validate(): string | null {
    if (!displayName.trim()) return "Give the planned hire a name or a placeholder like “Postdoc (TBD)”.";
    if (!(annualSalary > 0)) return "Enter an annual salary above $0.";
    if (!MONTH_RE.test(startMonth)) return "Pick a valid start month.";
    if (benefitsRatePct < 0 || benefitsRatePct > 100) return "Benefits must be between 0% and 100%.";
    if (!(appointmentPercent > 0) || appointmentPercent > 100) return "Appointment must be between 1% and 100%.";
    const first = Number(accountPct) || 0;
    const second = secondAccountId ? Number(secondPct) || 0 : 0;
    if (!accountId || first <= 0) return "Put at least some effort on an account.";
    if (secondAccountId && secondAccountId === accountId) return "Choose two different accounts, or leave the second blank.";
    if (first + second > appointmentPercent + 0.05) {
      return `The split (${first + second}%) is more than the ${appointmentPercent}% appointment.`;
    }
    return null;
  }

  function submit() {
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    const id = generateId();
    const plan: PlannedHire = {
      id,
      displayName: displayName.trim(),
      role: role.trim() || undefined,
      teamId,
      startMonth,
      appointmentPercent,
      annualSalary,
      benefitsRatePct,
      createdAt: new Date().toISOString(),
      createdBy,
    };
    const splits = [
      { fsId: accountId, pct: Number(accountPct) || 0 },
      { fsId: secondAccountId, pct: Number(secondPct) || 0 },
    ].filter((s) => s.fsId && s.pct > 0);
    const rules: ProjectionRule[] = [];
    for (const split of splits) {
      const fs = sources.find((s) => s.id === split.fsId);
      if (!fs) continue;
      rules.push({
        id: generateId(),
        personKey: plannedPersonKey(id),
        chartstringKey: chartstringKeyForFundingSource(fs),
        trigger: { type: "setEffort", fromMonth: startMonth, percentEffort: split.pct },
        remainder: { kind: "uncovered" },
        applyOverPayroll: true,
      });
    }
    onAdd(plan, rules);
  }

  return (
    <div className="flex w-full flex-wrap items-end gap-2 rounded-lg border border-rule bg-inset px-3 py-2">
      <label className="text-xs font-medium text-ink-2">
        Name or placeholder
        <input
          className={`ml-2 w-44 ${inputClass}`}
          value={displayName}
          placeholder="Postdoc (TBD)"
          onChange={(e) => setDisplayName(e.target.value)}
        />
      </label>
      <label className="text-xs font-medium text-ink-2">
        Role
        <input
          className={`ml-2 w-40 ${inputClass}`}
          value={role}
          placeholder="Postdoctoral scholar"
          onChange={(e) => setRole(e.target.value)}
        />
      </label>
      <div className="text-xs font-medium text-ink-2">
        <span className="mr-2">Team</span>
        <span className="inline-block align-middle">
          <PersonnelTypeSelect value={teamId} onChange={(t) => setTeamId(t ?? undefined)} />
        </span>
      </div>
      <label className="text-xs font-medium text-ink-2">
        Start month
        <input
          type="month"
          className={`ml-2 ${inputClass}`}
          value={startMonth}
          onChange={(e) => setStartMonth(e.target.value)}
        />
      </label>
      <label className="text-xs font-medium text-ink-2">
        Appointment %
        <input
          type="number"
          min={1}
          max={100}
          className={`ml-2 w-16 ${inputClass}`}
          value={appointment}
          onChange={(e) => setAppointment(e.target.value)}
        />
      </label>
      <label className="text-xs font-medium text-ink-2">
        Annual salary
        <input
          type="number"
          min={0}
          step={1000}
          className={`ml-2 w-28 ${inputClass}`}
          value={salary}
          placeholder="72000"
          onChange={(e) => setSalary(e.target.value)}
        />
      </label>
      <label className="text-xs font-medium text-ink-2">
        Benefits %
        <input
          type="number"
          min={0}
          max={100}
          step={0.5}
          className={`ml-2 w-16 ${inputClass}`}
          value={benefits}
          onChange={(e) => setBenefits(e.target.value)}
        />
      </label>
      <label className="text-xs font-medium text-ink-2">
        Account
        <select
          className={`ml-2 max-w-56 ${inputClass}`}
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
        >
          {sources.map((fs) => (
            <option key={fs.id} value={fs.id}>
              {label(fs)}
            </option>
          ))}
        </select>
        <input
          type="number"
          min={0}
          max={100}
          className={`ml-1 w-16 ${inputClass}`}
          value={accountPct}
          onChange={(e) => setAccountPct(e.target.value)}
          aria-label="Percent on the first account"
        />
        <span className="ml-0.5">%</span>
      </label>
      <label className="text-xs font-medium text-ink-2">
        Second account
        <select
          className={`ml-2 max-w-56 ${inputClass}`}
          value={secondAccountId}
          onChange={(e) => setSecondAccountId(e.target.value)}
        >
          <option value="">— none —</option>
          {sources.map((fs) => (
            <option key={fs.id} value={fs.id}>
              {label(fs)}
            </option>
          ))}
        </select>
        <input
          type="number"
          min={0}
          max={100}
          className={`ml-1 w-16 ${inputClass}`}
          value={secondPct}
          disabled={!secondAccountId}
          onChange={(e) => setSecondPct(e.target.value)}
          aria-label="Percent on the second account"
        />
        <span className="ml-0.5">%</span>
      </label>
      <button
        type="button"
        className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-on-accent hover:bg-accent-hover"
        onClick={submit}
      >
        Add
      </button>
      <button
        type="button"
        className="rounded-lg border px-3 py-1.5 text-sm text-ink-2 hover:bg-surface"
        onClick={onCancel}
      >
        Cancel
      </button>
      <p className="w-full text-xs text-muted">
        {annualSalary > 0 ? (
          <>
            <span
              className="underline decoration-dotted decoration-control underline-offset-2"
              title={`${formatCurrency(annualSalary)} ÷ 12 × (1 + ${benefitsRatePct}% benefits) — a planning estimate, no payroll behind it`}
            >
              ~{formatCurrency(monthly)}/mo
            </span>{" "}
            salary and benefits · appears on Projections from{" "}
            {MONTH_RE.test(startMonth) ? formatMonthLabel(startMonth) : "the start month"} as a planned
            row.
          </>
        ) : (
          "Enter an annual salary to see the monthly estimate."
        )}{" "}
        The split is stored as distribution rules, the same way an existing person&apos;s plan is.
      </p>
      {error && <p className="w-full text-xs text-critical">{error}</p>}
    </div>
  );
}
