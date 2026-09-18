import type {
  AppSettings,
  MatchDismissal,
  PersonLink,
  PlannedHire,
  ProjectionRule,
  ReconciliationChoice,
} from "@/types";
import { isDistributionLocked, lockedEditMessage } from "@/lib/projections/lock";
import { addMonthsYm, formatMonthLabel, getProjectionOriginMonth } from "@/lib/projections/horizon";
import { formatCurrency, generateId } from "@/lib/utils/parse";
import { appendEvents, makeEvent } from "@/lib/reconciliation/events";
import { activeLinkForPlan, activeLinks } from "@/lib/reconciliation/links";
import { plannedHireById, plannedMonthlyComp, plannedPersonKey } from "@/lib/reconciliation/plans";

/**
 * Pure settings transforms behind every planned-personnel action. AppContext
 * applies them through setSettings; the link dialog's impact panel and the
 * tests apply them to a copy. Each records its event; none edits an imported
 * row, and none deletes a plan that is linked or a link that was ever made.
 */
export type MutationOutcome<T extends object = Record<never, never>> =
  | ({ ok: true; settings: AppSettings } & T)
  | { ok: false; settings: AppSettings; reason: string };

export function addPlannedHire(
  settings: AppSettings,
  plan: PlannedHire,
  rules: ProjectionRule[],
  by: string,
  at?: string
): AppSettings {
  const next: AppSettings = {
    ...settings,
    plannedHires: [...(settings.plannedHires ?? []), plan],
    projectionRules: [...(settings.projectionRules ?? []), ...rules],
  };
  return appendEvents(next, [
    makeEvent(
      "planAdded",
      `Added planned hire ${plan.displayName}, starting ${formatMonthLabel(
        plan.startMonth
      )} at ~${formatCurrency(plannedMonthlyComp(plan))}/mo.`,
      by,
      { plannedHireId: plan.id },
      at
    ),
  ]);
}

/** yyyy-MM, and nothing else: a partial month must never reach storage. */
export const PLAN_MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * Edits the plan in place. Moving the start month moves the rules that were
 * written from it, so the planned row starts where the roster says it does.
 * A malformed month is refused outright — browsers without a month picker
 * hand over partial text keystroke by keystroke.
 */
export function updatePlannedHire(
  settings: AppSettings,
  id: string,
  patch: Partial<Omit<PlannedHire, "id" | "createdAt" | "createdBy">>
): AppSettings {
  const current = plannedHireById(settings.plannedHires, id);
  if (!current) return settings;
  if (patch.startMonth !== undefined && !PLAN_MONTH_RE.test(patch.startMonth)) return settings;
  if (patch.endMonth !== undefined && patch.endMonth !== "" && !PLAN_MONTH_RE.test(patch.endMonth)) {
    return settings;
  }
  const key = plannedPersonKey(id);
  const movedStart = patch.startMonth && patch.startMonth !== current.startMonth;
  return {
    ...settings,
    plannedHires: (settings.plannedHires ?? []).map((p) => (p.id === id ? { ...p, ...patch } : p)),
    projectionRules: movedStart
      ? (settings.projectionRules ?? []).map((r) =>
          r.personKey === key &&
          r.trigger.type === "setEffort" &&
          r.trigger.fromMonth === current.startMonth
            ? { ...r, trigger: { ...r.trigger, fromMonth: patch.startMonth! } }
            : r
        )
      : settings.projectionRules,
  };
}

export function removePlannedHire(
  settings: AppSettings,
  id: string,
  by: string,
  at?: string
): MutationOutcome {
  const plan = plannedHireById(settings.plannedHires, id);
  if (!plan) return { ok: false, settings, reason: "This plan no longer exists." };
  if (activeLinkForPlan(activeLinks(settings), id)) {
    return {
      ok: false,
      settings,
      reason: `${plan.displayName} is linked to a payroll person. Unlink first; the plan is kept for comparison while linked.`,
    };
  }
  const key = plannedPersonKey(id);
  const next: AppSettings = {
    ...settings,
    plannedHires: (settings.plannedHires ?? []).filter((p) => p.id !== id),
    projectionRules: (settings.projectionRules ?? []).filter((r) => r.personKey !== key),
  };
  return {
    ok: true,
    settings: appendEvents(next, [
      makeEvent("planRemoved", `Removed planned hire ${plan.displayName} and its distribution rules.`, by, {
        plannedHireId: id,
      }, at),
    ]),
  };
}

export interface LinkInput {
  plannedHireId: string;
  employeePersonKey: string;
  employeeName: string;
  basis: PersonLink["basis"];
  /** Ids of the signals that passed, for the record. */
  signals: string[];
  choice: Pick<ReconciliationChoice, "forecastRate" | "pinPlannedRate" | "distribution">;
  copied?: PersonLink["copied"];
  by: string;
  at?: string;
  originMonth?: string;
}

function forecastRateLabel(choice: LinkInput["choice"]): string {
  if (choice.pinPlannedRate) return "planned rate, pinned";
  if (choice.forecastRate === "fyRate") return "FY rate until a full month closes";
  if (choice.forecastRate === "payrollActual") return "posted amount carried forward";
  return "planned rate until a full month closes";
}

/** Confirm: one PersonLink, one ReconciliationChoice, one link event. Never edits imported rows. */
export function applyLink(
  settings: AppSettings,
  input: LinkInput
): MutationOutcome<{ link: PersonLink; choice: ReconciliationChoice }> {
  const plan = plannedHireById(settings.plannedHires, input.plannedHireId);
  if (!plan) return { ok: false, settings, reason: "This plan no longer exists." };
  if (activeLinkForPlan(activeLinks(settings), plan.id)) {
    return { ok: false, settings, reason: `${plan.displayName} is already linked.` };
  }
  const at = input.at ?? new Date().toISOString();
  const origin = input.originMonth ?? getProjectionOriginMonth();
  const link: PersonLink = {
    id: generateId(),
    plannedHireId: plan.id,
    employeePersonKey: input.employeePersonKey,
    basis: input.basis,
    signals: input.signals,
    linkedAt: at,
    linkedBy: input.by,
    ...(input.copied ? { copied: input.copied } : {}),
  };
  const choice: ReconciliationChoice = {
    linkId: link.id,
    forecastRate: input.choice.forecastRate,
    pinPlannedRate: input.choice.pinPlannedRate,
    distribution: input.choice.distribution,
    effectiveFrom: addMonthsYm(origin, 1),
    decidedAt: at,
    decidedBy: input.by,
  };
  const next: AppSettings = {
    ...settings,
    personLinks: [...(settings.personLinks ?? []), link],
    reconciliationChoices: [...(settings.reconciliationChoices ?? []), choice],
  };
  const distribution =
    choice.distribution === "payrollFuture" ? "payroll's future distribution" : "the plan's distribution";
  return {
    ok: true,
    link,
    choice,
    settings: appendEvents(next, [
      makeEvent(
        "link",
        `Linked ${plan.displayName} to ${input.employeeName} (${input.basis}) — from ${formatMonthLabel(
          choice.effectiveFrom
        )}: ${forecastRateLabel(input.choice)}, ${distribution}.`,
        input.by,
        { linkId: link.id, plannedHireId: plan.id },
        at
      ),
    ]),
  };
}

/** Unlink: the link row is kept as reversed; the plan simulates again; nothing imported moves. */
export function applyUnlink(
  settings: AppSettings,
  linkId: string,
  by: string,
  employeeName: string,
  at?: string
): MutationOutcome<{ link: PersonLink }> {
  const link = (settings.personLinks ?? []).find((l) => l.id === linkId && !l.reversedAt);
  if (!link) return { ok: false, settings, reason: "This link is no longer active." };
  if (isDistributionLocked(settings, link.employeePersonKey)) {
    return { ok: false, settings, reason: lockedEditMessage(employeeName) };
  }
  const plan = plannedHireById(settings.plannedHires, link.plannedHireId);
  const stamp = at ?? new Date().toISOString();
  const reversed: PersonLink = { ...link, reversedAt: stamp, reversedBy: by };
  const next: AppSettings = {
    ...settings,
    personLinks: (settings.personLinks ?? []).map((l) => (l.id === linkId ? reversed : l)),
  };
  return {
    ok: true,
    link: reversed,
    settings: appendEvents(next, [
      makeEvent(
        "unlink",
        `Unlinked ${employeeName} from the ${plan?.displayName ?? "planned hire"} plan; the plan returns to Projections with its original split and rate.`,
        by,
        { linkId, plannedHireId: link.plannedHireId },
        stamp
      ),
    ]),
  };
}

/** "Not a match": remembered on re-upload; both rows keep counting. */
export function applyDismissal(
  settings: AppSettings,
  plannedHireId: string,
  employeePersonKey: string,
  employeeName: string,
  by: string,
  at?: string
): AppSettings {
  const already = (settings.matchDismissals ?? []).some(
    (d) => d.plannedHireId === plannedHireId && d.employeePersonKey === employeePersonKey
  );
  if (already) return settings;
  const plan = plannedHireById(settings.plannedHires, plannedHireId);
  const stamp = at ?? new Date().toISOString();
  const dismissal: MatchDismissal = { plannedHireId, employeePersonKey, at: stamp, by };
  return appendEvents(
    { ...settings, matchDismissals: [...(settings.matchDismissals ?? []), dismissal] },
    [
      makeEvent(
        "dismiss",
        `Not a match: ${employeeName} is not the planned ${plan?.displayName ?? "hire"}. Both rows keep counting.`,
        by,
        { plannedHireId },
        stamp
      ),
    ]
  );
}

export function setPinPlannedRate(settings: AppSettings, linkId: string, pinned: boolean): AppSettings {
  return {
    ...settings,
    reconciliationChoices: (settings.reconciliationChoices ?? []).map((c) =>
      c.linkId === linkId ? { ...c, pinPlannedRate: pinned } : c
    ),
  };
}
