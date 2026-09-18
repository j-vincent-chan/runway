"use client";

import { useEffect, useState } from "react";
import type { AppSettings } from "@/types";
import { EmployeeAvatar } from "@/components/employees/EmployeeAvatar";
import { PersonnelTypePill } from "@/components/employees/PersonnelTypeSelect";
import { formatMonthLabel } from "@/lib/projections/horizon";
import { actorLabel, formatEventDay } from "@/lib/reconciliation/events";
import { PLAN_MONTH_RE } from "@/lib/reconciliation/mutations";
import { plannedAvatarName } from "@/lib/reconciliation/plans";
import type { PlannedHireRow } from "@/lib/reconciliation/view";
import { formatCurrency } from "@/lib/utils/parse";
import { cn } from "@/lib/utils/cn";

const CHIP = "inline-flex max-w-full items-center rounded-full px-2 py-0.5 text-xs font-medium";

/**
 * Employees → Roster → Planned. Same table chrome as Active. Healthy is used
 * here only for a confirmed link — a confirmed-good state — never for a
 * suggestion, which stays caution until the PI decides.
 */
export function PlannedHiresTable({
  rows,
  settings,
  onStartMonthChange,
  onRemove,
  onUnlink,
  onReview,
  onLinkManually,
}: {
  rows: PlannedHireRow[];
  settings: AppSettings;
  onStartMonthChange: (plannedHireId: string, month: string) => void;
  onRemove: (row: PlannedHireRow) => void;
  onUnlink: (row: PlannedHireRow) => void;
  /** Opens the link dialog on the suggested pair. */
  onReview?: (row: PlannedHireRow) => void;
  /** Opens the link dialog with a person picker. */
  onLinkManually?: (row: PlannedHireRow) => void;
}) {
  void settings;
  return (
    <div className="overflow-x-auto rounded-xl border bg-surface shadow-sm">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-brand-ground text-xs text-white">
          <tr>
            <th className="sticky left-0 z-10 bg-brand-ground px-3 py-2">Planned hire</th>
            <th className="min-w-[9.5rem] px-3 py-2">Team</th>
            <th className="min-w-[7rem] px-3 py-2">Start</th>
            <th className="px-3 py-2">Appointment</th>
            <th className="px-3 py-2">Planned monthly S+B</th>
            <th className="min-w-[12rem] px-3 py-2">Accounts</th>
            <th className="min-w-[12rem] px-3 py-2">Status</th>
            <th className="px-3 py-2" aria-label="Actions" />
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={8} className="px-3 py-8 text-center text-muted">
                No planned hires yet. Add planned hire to put a future person on Projections before
                payroll knows them.
              </td>
            </tr>
          ) : (
            rows.map((row) => <PlannedHireTableRow key={row.plan.id} row={row} onStartMonthChange={onStartMonthChange} onRemove={onRemove} onUnlink={onUnlink} onReview={onReview} onLinkManually={onLinkManually} />)
          )}
        </tbody>
      </table>
      <p className="border-t px-3 py-2 text-xs text-muted">
        Planned hires are your assumptions, not payroll. They appear on Projections as planned rows
        until payroll shows the person and you confirm the match. A linked plan keeps its original
        assumptions here for comparison.
      </p>
    </div>
  );
}

function StatusCell({ row }: { row: PlannedHireRow }) {
  const { plan, status } = row;
  if (status === "linked") {
    const name = row.linkedEmployee?.name ?? row.link?.employeePersonKey ?? "a payroll person";
    return (
      <>
        <span className={cn(CHIP, "bg-healthy-soft text-healthy")}>Linked to {name}</span>
        <span className="mt-0.5 block text-xs text-muted">
          {formatEventDay(row.link?.linkedAt) ?? "—"} · {actorLabel(row.link?.linkedBy)}
        </span>
      </>
    );
  }
  if (status === "suggested") {
    const name = row.suggestedEmployee?.name ?? "a new employee";
    return (
      <>
        <span className={cn(CHIP, "bg-caution-soft text-caution")}>Possible match: {name}</span>
        <span className="mt-0.5 block text-xs text-muted">
          {row.suggestion?.passCount ?? 0} of 5 signals
        </span>
      </>
    );
  }
  if (status === "expected") {
    return (
      <>
        <span className={cn(CHIP, "bg-caution-soft text-caution")}>
          Expected {formatMonthLabel(plan.startMonth)} · not in report
        </span>
        <span className="mt-0.5 block text-xs text-muted">Forecast keeps the plan</span>
      </>
    );
  }
  return (
    <>
      <span className={cn(CHIP, "bg-inset text-ink-2 ring-1 ring-rule")}>Planned</span>
      <span className="mt-0.5 block text-xs text-muted">
        Added {formatEventDay(plan.createdAt) ?? "—"}
      </span>
    </>
  );
}

function PlannedHireTableRow({
  row,
  onStartMonthChange,
  onRemove,
  onUnlink,
  onReview,
  onLinkManually,
}: {
  row: PlannedHireRow;
  onStartMonthChange: (plannedHireId: string, month: string) => void;
  onRemove: (row: PlannedHireRow) => void;
  onUnlink: (row: PlannedHireRow) => void;
  onReview?: (row: PlannedHireRow) => void;
  onLinkManually?: (row: PlannedHireRow) => void;
}) {
  const { plan, status } = row;
  const linked = status === "linked";
  return (
    <tr className="group border-t hover:bg-inset">
      <td className="sticky left-0 z-[1] bg-surface px-3 py-2 group-hover:bg-inset">
        <div className="flex items-center gap-2.5">
          <EmployeeAvatar
            name={plannedAvatarName(plan.displayName)}
            className="outline outline-1 outline-dotted outline-offset-1 outline-control"
          />
          <div className="min-w-0">
            <span className="font-medium">{plan.displayName}</span>
            {plan.role && <span className="block text-xs text-muted">{plan.role}</span>}
          </div>
        </div>
      </td>
      <td className="px-3 py-2 align-top">
        {plan.teamId ? <PersonnelTypePill type={plan.teamId} /> : <span className="text-muted">—</span>}
      </td>
      <td className="px-3 py-2 align-top">
        {linked ? (
          <span title="Kept as planned, for comparison">{formatMonthLabel(plan.startMonth)}</span>
        ) : (
          <StartMonthEditor
            value={plan.startMonth}
            onCommit={(month) => onStartMonthChange(plan.id, month)}
          />
        )}
      </td>
      <td className="px-3 py-2 align-top tabular-nums">{plan.appointmentPercent}%</td>
      <td className="px-3 py-2 align-top tabular-nums">
        <span
          className="underline decoration-dotted decoration-control underline-offset-2"
          title={`${formatCurrency(plan.annualSalary)} ÷ 12 × (1 + ${plan.benefitsRatePct}% benefits) — a planning estimate, no payroll behind it`}
        >
          ~{formatCurrency(row.monthlyComp)}
        </span>
      </td>
      <td className="px-3 py-2 align-top">
        <div className="flex flex-wrap gap-1">
          {row.accounts.length === 0 ? (
            <span className="text-muted">—</span>
          ) : (
            row.accounts.map((a) => (
              <span
                key={a.chartstringKey}
                className="rounded bg-inset px-1.5 py-0.5 text-xs ring-1 ring-rule"
                title={a.label}
              >
                {a.percent}% {a.label}
              </span>
            ))
          )}
        </div>
      </td>
      <td className="px-3 py-2 align-top">
        <StatusCell row={row} />
      </td>
      <td className="px-3 py-2 align-top">
        <div className="flex flex-wrap justify-end gap-1.5">
          {status === "suggested" && onReview && (
            <button
              type="button"
              className="rounded bg-accent px-2 py-1 text-xs font-medium text-on-accent hover:bg-accent-hover"
              onClick={() => onReview(row)}
            >
              Review match
            </button>
          )}
          {!linked && onLinkManually && (
            <button
              type="button"
              className="rounded border border-control px-2 py-1 text-xs font-medium text-ink-2 hover:bg-inset"
              onClick={() => onLinkManually(row)}
            >
              Link to existing employee…
            </button>
          )}
          {linked ? (
            <button
              type="button"
              className="rounded border border-critical px-2 py-1 text-xs font-medium text-critical hover:bg-critical-soft"
              onClick={() => onUnlink(row)}
            >
              Unlink
            </button>
          ) : null}
          <button
            type="button"
            disabled={linked}
            title={
              linked
                ? `${plan.displayName} is linked — unlink first. The plan is kept for comparison while linked.`
                : `Remove ${plan.displayName} and its distribution rules`
            }
            className="rounded px-2 py-1 text-xs font-medium text-critical hover:bg-critical-soft disabled:cursor-not-allowed disabled:text-muted disabled:hover:bg-transparent"
            onClick={() => onRemove(row)}
          >
            Remove
          </button>
        </div>
      </td>
    </tr>
  );
}

/**
 * Browsers without a month picker hand over partial text keystroke by
 * keystroke, so the draft lives here and only a complete yyyy-MM is stored.
 * Anything else shows the same message the add form uses and is dropped on
 * blur.
 */
function StartMonthEditor({
  value,
  onCommit,
}: {
  value: string;
  onCommit: (month: string) => void;
}) {
  const [draft, setDraft] = useState(value);
  const [invalid, setInvalid] = useState(false);
  useEffect(() => {
    setDraft(value);
    setInvalid(false);
  }, [value]);
  return (
    <>
      <input
        type="month"
        value={draft}
        onChange={(e) => {
          const next = e.target.value;
          setDraft(next);
          if (PLAN_MONTH_RE.test(next)) {
            setInvalid(false);
            if (next !== value) onCommit(next);
          } else {
            setInvalid(next !== "");
          }
        }}
        onBlur={() => {
          if (!PLAN_MONTH_RE.test(draft)) {
            setDraft(value);
            setInvalid(false);
          }
        }}
        aria-invalid={invalid || undefined}
        className={cn(
          "w-full min-w-[7rem] rounded border px-1.5 py-0.5 text-xs text-ink",
          invalid ? "border-critical" : "border-control"
        )}
        title="Planned start month — moving it moves the planned row on Projections"
      />
      {invalid && <span className="mt-0.5 block text-[11px] text-critical">Pick a valid start month.</span>}
    </>
  );
}
