import type { Employee, PlannedHire, ProjectionRule } from "@/types";
import { employeePersonKey } from "@/lib/employees/stableKey";

/**
 * A planned hire's personKey is `planned:{id}`. Its distribution is ordinary
 * ProjectionRule rows keyed to that personKey, so the engine treats a plan
 * the way it treats anyone else; the prefix is only how the engine tells a
 * synthetic entity from a payroll person.
 */
export const PLANNED_KEY_PREFIX = "planned:";

export function plannedPersonKey(id: string): string {
  return `${PLANNED_KEY_PREFIX}${id}`;
}

export function isPlannedPersonKey(key: string): boolean {
  return key.startsWith(PLANNED_KEY_PREFIX);
}

export function plannedHireIdFromKey(key: string): string | null {
  return isPlannedPersonKey(key) ? key.slice(PLANNED_KEY_PREFIX.length) : null;
}

/**
 * The one identity function every projection surface uses. A planned
 * entity's id *is* its personKey; a payroll person's is the HR-id / name key.
 */
export function personKeyForEmployee(
  emp: Pick<Employee, "id" | "employeeId" | "name">
): string {
  return isPlannedPersonKey(emp.id) ? emp.id : employeePersonKey(emp);
}

/**
 * The plan's monthly salary and benefits — the handoff's one new formula,
 * defined here and nowhere else: annual salary ÷ 12 at the plan's benefits %.
 * A planned hire has no payroll behind it, so there is nothing measured to
 * reuse; every "~$/mo" figure for a plan, on every surface, reads this. The
 * FY-rate option reuses it with the Position Salary report's annual rate.
 */
export function plannedMonthlyComp(
  plan: Pick<PlannedHire, "annualSalary" | "benefitsRatePct">
): number {
  return (plan.annualSalary / 12) * (1 + plan.benefitsRatePct / 100);
}

/** The synthetic employee an unlinked plan simulates as. */
export function plannedEntity(plan: PlannedHire): Employee {
  return {
    id: plannedPersonKey(plan.id),
    name: plan.displayName,
    appointmentPercent: plan.appointmentPercent > 0 ? plan.appointmentPercent : 100,
    role: plan.role,
    annualSalary: plan.annualSalary,
  };
}

export function plannedHireById(
  plans: PlannedHire[] | undefined,
  id: string
): PlannedHire | undefined {
  return (plans ?? []).find((p) => p.id === id);
}

export function plannedHireRules(
  rules: ProjectionRule[] | undefined,
  planId: string
): ProjectionRule[] {
  const key = plannedPersonKey(planId);
  return (rules ?? []).filter((r) => r.personKey === key);
}

/** The accounts a plan names — the chartstring keys of its own rules. */
export function planAccountKeys(rules: ProjectionRule[] | undefined, planId: string): string[] {
  const keys = plannedHireRules(rules, planId)
    .map((r) => r.chartstringKey)
    .filter((k): k is string => Boolean(k));
  return [...new Set(keys)];
}

/** "Postdoc (TBD)" → "Postdoc", so the avatar's initials come from the role, not the bracket. */
export function plannedAvatarName(displayName: string): string {
  return displayName.replace(/\([^)]*\)/g, "").replace(/\s+/g, " ").trim() || displayName;
}

const PLACEHOLDER_WORDS =
  /\b(tbd|tba|tbh|placeholder|to be (determined|hired|named)|new hire|hire|vacant|open (position|role)|position|role)\b/i;
const ROLE_WORDS =
  /\b(postdoc|post-doc|postdoctoral|research|researcher|lab|data|project|clinical|clinician|community|program|programme|staff|analyst|manager|coordinator|scientist|specialist|assistant|associate|technician|tech|fellow|student|trainee|intern|engineer|developer|programmer|nurse|statistician|biostatistician|bioinformatician|writer|editor|officer|director|administrator|admin|investigator|physician|resident|educator|librarian|curator|designer|architect|lead|senior|junior|sr|jr)\b/i;

/**
 * "Postdoc (TBD)", "Lab manager", "Grant writer", "Hire 2" — a role or a
 * slot, not a person's name. A plan named this way gets no name-based signal
 * (neutral), never a failing one. A real name is two or more words with no
 * role word in them, or "Last, First".
 */
export function looksLikePlaceholder(displayName: string): boolean {
  const n = displayName.trim();
  if (!n) return true;
  if (PLACEHOLDER_WORDS.test(n)) return true;
  if (ROLE_WORDS.test(n)) return true;
  if (/\d/.test(n)) return true;
  if (n.includes(",")) return false;
  return n.split(/\s+/).length < 2;
}
