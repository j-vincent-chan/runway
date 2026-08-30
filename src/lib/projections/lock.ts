import type { AppSettings, ProjectionRule } from "@/types";

/**
 * A locked distribution is the PI's statement that a person's projected plan
 * is final and has been handed off. It is stored by `employeePersonKey`, not
 * employee id, so the lock survives a re-import the same way rules and aliases
 * do — a re-parsed roster must not silently unlock someone.
 *
 * The lock is a planning guard, not a permission: it stops accidental edits to
 * a plan already sent to the analyst. Unlocking is always available, so a
 * locked person can never be stranded.
 */

export function lockedPersonKeys(settings: AppSettings): Set<string> {
  return new Set(settings.lockedDistributions ?? []);
}

export function isDistributionLocked(settings: AppSettings, personKey: string): boolean {
  return (settings.lockedDistributions ?? []).includes(personKey);
}

/** Returns the next `lockedDistributions` array; never mutates settings. */
export function setDistributionLock(
  settings: AppSettings,
  personKey: string,
  locked: boolean
): string[] {
  const current = settings.lockedDistributions ?? [];
  if (locked) {
    return current.includes(personKey) ? current : [...current, personKey];
  }
  return current.filter((k) => k !== personKey);
}

/**
 * Whether a rule may be written or deleted. Rules carry their own personKey,
 * so this is the single check every projection mutator runs — the enforcement,
 * with the disabled controls in the grid as its visible half.
 */
export function isRuleLocked(settings: AppSettings, rule: ProjectionRule): boolean {
  return isDistributionLocked(settings, rule.personKey);
}

/** The refusal shown when an edit reaches a locked person. */
export function lockedEditMessage(personName: string): string {
  return (
    `${personName}'s distribution is locked in.\n\n` +
    `Click “Locked In” on their row to unlock it, make your changes, then lock it in again ` +
    `so your analyst gets the updated plan.`
  );
}
