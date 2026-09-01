import { getSupabase } from "@/lib/supabase/client";
import { getCurrentUserId } from "@/lib/supabase/authUser";

/**
 * One row per user: display name + onboarding role preference. The
 * preference routes onboarding and personalizes copy; it is never a
 * permission — access always comes from workspace_delegates rows.
 */
export type RolePreference = "pi" | "analyst";

export type Profile = {
  userId: string;
  fullName: string;
  rolePreference: RolePreference | null;
};

/**
 * "none" is the onboarding signal (no row = the role step hasn't happened),
 * so it must never be conflated with a failed fetch — a transient error
 * would otherwise re-onboard an existing user or gate a finished one.
 */
export type ProfileLookup =
  | { status: "found"; profile: Profile }
  | { status: "none" }
  | { status: "error" };

export async function lookupMyProfile(): Promise<ProfileLookup> {
  const supabase = getSupabase();
  const userId = await getCurrentUserId();
  if (!supabase || !userId) return { status: "error" };
  const { data, error } = await supabase
    .from("profiles")
    .select("user_id, full_name, role_preference")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    console.warn("[supabase] fetch profile failed:", error.message);
    return { status: "error" };
  }
  if (!data) return { status: "none" };
  return {
    status: "found",
    profile: {
      userId: data.user_id,
      fullName: data.full_name ?? "",
      rolePreference: (data.role_preference as RolePreference | null) ?? null,
    },
  };
}

export async function fetchMyProfile(): Promise<Profile | null> {
  const lookup = await lookupMyProfile();
  return lookup.status === "found" ? lookup.profile : null;
}

export async function upsertMyProfile(input: {
  fullName?: string;
  rolePreference?: RolePreference | null;
}): Promise<{ ok: boolean; error?: string }> {
  const supabase = getSupabase();
  const userId = await getCurrentUserId();
  if (!supabase || !userId) return { ok: false, error: "Sign in first." };
  const row: Record<string, unknown> = { user_id: userId, updated_at: new Date().toISOString() };
  if (input.fullName !== undefined) row.full_name = input.fullName.trim();
  if (input.rolePreference !== undefined) row.role_preference = input.rolePreference;
  const { error } = await supabase.from("profiles").upsert(row, { onConflict: "user_id" });
  if (error) {
    console.warn("[supabase] profile upsert failed:", error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

/** "Vincent" from "Vincent Chan" — the personalization the name exists for. */
export function firstNameOf(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? "";
}
