import type { DelegationGrant } from "@/lib/supabase/delegates";
import type { RolePreference } from "@/lib/supabase/profiles";

/** Persisted value meaning "explicitly my own workspace," distinct from
 *  "nothing has ever been chosen" (an absent/unrecognized persisted value). */
export const SELF_SELECTION = "__self__";

export type ResolvedSelection = {
  grant: DelegationGrant | null;
  /**
   * True once the user has explicitly landed on a workspace — their own
   * included — so the one-time auto-pick convenience and the
   * workspace-required redirect never re-fire for them. A stored
   * `role_preference` of "analyst" only ever means "at least one PI has
   * granted this account access"; it says nothing about whether the account
   * also has a workspace of its own, so it must never by itself imply there
   * is nothing to return to.
   */
  chosen: boolean;
  /** What should be (re-)persisted for next sign-in; null clears storage. */
  persist: string | null;
};

/**
 * Resolves which workspace an account should open on sign-in from its last
 * persisted choice, its live delegation grants, and its onboarding role hint.
 * A revoked grant is treated the same as "nothing persisted" so a removed
 * analyst lands back on workspace selection rather than a wall of permission
 * errors. An analyst with exactly one grant and no prior choice is switched
 * into it silently — there is nothing else for them to pick.
 */
export function resolveWorkspaceSelection(
  persisted: string | null,
  grants: DelegationGrant[],
  role: RolePreference | null
): ResolvedSelection {
  if (persisted === SELF_SELECTION) {
    return { grant: null, chosen: true, persist: SELF_SELECTION };
  }
  if (persisted) {
    const grant = grants.find((g) => g.piUserId === persisted) ?? null;
    if (grant) return { grant, chosen: true, persist: persisted };
  }
  if (role === "analyst" && grants.length === 1) {
    return { grant: grants[0], chosen: true, persist: grants[0].piUserId };
  }
  return { grant: null, chosen: false, persist: null };
}
