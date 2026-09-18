import type {
  AppSettings,
  Employee,
  PersonLink,
  ProjectionRule,
  ProjectionTrigger,
  ReconciliationChoice,
} from "@/types";
import { employeePersonKey, employeePersonKeys } from "@/lib/employees/stableKey";
import { addMonthsYm } from "@/lib/projections/horizon";
import { isPlannedPersonKey, plannedHireIdFromKey } from "@/lib/reconciliation/plans";

/** Links that are in force — a reversed link is kept for the record but resolves nothing. */
export function activeLinks(settings: Pick<AppSettings, "personLinks">): PersonLink[] {
  return (settings.personLinks ?? []).filter((l) => !l.reversedAt);
}

export function activeLinkForPlan(links: PersonLink[], plannedHireId: string): PersonLink | undefined {
  return links.find((l) => l.plannedHireId === plannedHireId && !l.reversedAt);
}

/** One person may fill two budgeted roles, so this is a list. */
export function activeLinksForPerson(links: PersonLink[], personKey: string): PersonLink[] {
  return links.filter((l) => l.employeePersonKey === personKey && !l.reversedAt);
}

export function choiceForLink(
  settings: Pick<AppSettings, "reconciliationChoices">,
  linkId: string
): ReconciliationChoice | undefined {
  return (settings.reconciliationChoices ?? []).find((c) => c.linkId === linkId);
}

/**
 * The key a report gives a person can drift between `hr:` and `name:` when a
 * later file gains or loses the parenthesised ID. Links are read through the
 * person's current keys so they keep resolving either way.
 */
export function canonicalPersonKey(
  key: string,
  employees: Pick<Employee, "id" | "employeeId" | "name">[]
): string {
  for (const emp of employees) {
    if (employeePersonKeys(emp).includes(key)) return employeePersonKey(emp);
  }
  return key;
}

export function canonicalizeLinks(
  links: PersonLink[],
  employees: Pick<Employee, "id" | "employeeId" | "name">[]
): PersonLink[] {
  return links.map((l) => {
    const key = canonicalPersonKey(l.employeePersonKey, employees);
    return key === l.employeePersonKey ? l : { ...l, employeePersonKey: key };
  });
}

export function findEmployeeByPersonKey<T extends Pick<Employee, "id" | "employeeId" | "name">>(
  employees: T[],
  personKey: string
): T | undefined {
  return employees.find((e) => employeePersonKeys(e).includes(personKey));
}

/**
 * The links that can act on this report: active, keyed to the report's
 * current person keys, and pointing at someone who is on it. A link whose
 * person has dropped out of the fold (the report that carried them was
 * removed, or they were deleted) resolves nothing — the plan is simulated as
 * its own row again, so it is counted once either way and never zero times.
 */
export function effectiveLinks(
  settings: Pick<AppSettings, "personLinks">,
  employees: Pick<Employee, "id" | "employeeId" | "name">[]
): PersonLink[] {
  return canonicalizeLinks(activeLinks(settings), employees).filter((l) =>
    Boolean(findEmployeeByPersonKey(employees, l.employeePersonKey))
  );
}

/**
 * `planned:{id}` → the linked person's key when an active link exists;
 * anything else unchanged. Rules keep `planned:{id}` in storage — resolution
 * happens at simulation time, never by rewriting.
 */
export function resolvePersonKey(personKey: string, links: PersonLink[]): string {
  const planId = plannedHireIdFromKey(personKey);
  if (!planId) return personKey;
  return activeLinkForPlan(links, planId)?.employeePersonKey ?? personKey;
}

/**
 * A plan's rule resolved onto a person must never override a posted month:
 * origin and earlier are imported actuals. setEffort starts no earlier than
 * the month after origin; an "off after" date is never earlier than origin,
 * so the off-ramp lands on the first forecast month at the soonest.
 */
function clampTrigger(trigger: ProjectionTrigger, originMonth: string): ProjectionTrigger {
  const firstForecastMonth = addMonthsYm(originMonth, 1);
  if (trigger.type === "setEffort" && trigger.fromMonth < firstForecastMonth) {
    return { ...trigger, fromMonth: firstForecastMonth };
  }
  if (trigger.type === "onDate" && trigger.month < originMonth) {
    return { ...trigger, month: originMonth };
  }
  return trigger;
}

/**
 * The effective rule set for one simulation. Stored rules are untouched:
 * - a `planned:` rule whose plan has an active link maps to the person;
 * - it is dropped when the person's choice is to adopt payroll's future
 *   distribution, and when the person has set the effort on that account
 *   themselves (a rule added after linking belongs to the person). An
 *   off-ramp of the person's own — end on a date, a cap, until depleted —
 *   keeps the plan's effort in place to come off from;
 * - its trigger is clamped so it never fires on or before origin.
 * Resolved plan rules come first, so the person's own rules apply after them
 * and win whenever the two touch the same month.
 */
export function resolveRules(
  rules: ProjectionRule[],
  links: PersonLink[],
  choices: ReconciliationChoice[],
  originMonth: string
): ProjectionRule[] {
  if (links.length === 0) return rules;
  const ownEffortPairs = new Set(
    rules
      .filter((r) => !isPlannedPersonKey(r.personKey) && r.trigger.type === "setEffort")
      .map((r) => `${r.personKey}|${r.chartstringKey ?? ""}`)
  );
  const resolved: ProjectionRule[] = [];
  const others: ProjectionRule[] = [];
  for (const rule of rules) {
    const planId = plannedHireIdFromKey(rule.personKey);
    const link = planId ? activeLinkForPlan(links, planId) : undefined;
    if (!planId || !link) {
      others.push(rule);
      continue;
    }
    const choice = choices.find((c) => c.linkId === link.id);
    if (choice?.distribution === "payrollFuture") continue;
    if (ownEffortPairs.has(`${link.employeePersonKey}|${rule.chartstringKey ?? ""}`)) continue;
    resolved.push({
      ...rule,
      personKey: link.employeePersonKey,
      trigger: clampTrigger(rule.trigger, originMonth),
    });
  }
  return [...resolved, ...others];
}

/** True when a resolved rule is a linked plan's, not one the person saved themselves. */
export function isPlanDerivedRule(
  settings: Pick<AppSettings, "projectionRules">,
  rule: Pick<ProjectionRule, "id" | "personKey">
): boolean {
  const stored = (settings.projectionRules ?? []).find((r) => r.id === rule.id);
  return Boolean(stored && stored.personKey !== rule.personKey);
}

/** What the grid shows as a person's rules: their own plus any resolved from a linked plan. */
export function effectiveRulesForPerson(
  settings: AppSettings,
  employees: Pick<Employee, "id" | "employeeId" | "name">[],
  personKey: string,
  originMonth: string
): ProjectionRule[] {
  return resolveRules(
    settings.projectionRules ?? [],
    effectiveLinks(settings, employees),
    settings.reconciliationChoices ?? [],
    originMonth
  ).filter((r) => r.personKey === personKey);
}
