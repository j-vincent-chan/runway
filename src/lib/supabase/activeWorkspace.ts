import { getCurrentUserId } from "@/lib/supabase/authUser";

/**
 * Which workspace the app is acting on. Normally the signed-in user's own;
 * a financial analyst working a delegated PI workspace sets an override and
 * every cloud read/write in workspace.ts / sync.ts / catalog.ts targets the
 * PI instead — same ambient style as getCurrentUserId(), one setter.
 *
 * Auth-identity paths (claimLegacyCloudWorkspace, the lab-owner checks) keep
 * reading getCurrentUserId() directly: they are about who you are, not whose
 * workspace you're in.
 */
export type ActiveWorkspaceOwner = { userId: string; email: string };

let override: ActiveWorkspaceOwner | null = null;

/** null returns the app to the signed-in user's own workspace. */
export function setActiveWorkspaceOverride(owner: ActiveWorkspaceOwner | null): void {
  override = owner;
}

export function getActiveWorkspaceOverride(): ActiveWorkspaceOwner | null {
  return override;
}

/** Owner id every cloud read/write scopes to: the delegated PI when set, else the signed-in user. */
export async function getActiveWorkspaceOwnerId(): Promise<string | null> {
  if (override) return override.userId;
  return getCurrentUserId();
}
