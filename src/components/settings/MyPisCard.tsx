"use client";

import { LogOut } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useWorkspace } from "@/context/WorkspaceContext";
import { RequestAccessForm } from "@/components/onboarding/RequestAccessForm";
import { getSupabase } from "@/lib/supabase/client";
import { normalizeDelegateEmail } from "@/lib/supabase/delegates";
import { formatIsoDateDisplay } from "@/lib/utils/parse";

/**
 * The analyst's side: the PI workspaces shared with me, the door out of any
 * of them, and the permanent home of the request-access form (Welcome shows
 * the same form once, at sign-up).
 */
export function MyPisCard() {
  const { cloudSyncEnabled, user } = useAuth();
  const { delegationsToMe, switchWorkspace, refreshDelegations, activeOwner } = useWorkspace();

  if (!user || !cloudSyncEnabled) return null;

  async function leave(piUserId: string, piEmail: string) {
    const supabase = getSupabase();
    if (!supabase || !user?.email) return;
    if (
      !window.confirm(
        `Leave ${piEmail}'s workspace? You'll lose access until they approve you again.`
      )
    )
      return;
    // If we're standing in the workspace we're leaving, step out first.
    if (activeOwner && !activeOwner.isSelf && activeOwner.userId === piUserId) {
      switchWorkspace(null);
    }
    const { error } = await supabase
      .from("workspace_delegates")
      .delete()
      .eq("pi_user_id", piUserId)
      .eq("analyst_email", normalizeDelegateEmail(user.email));
    if (error) {
      window.alert(`Could not leave the workspace: ${error.message}`);
      return;
    }
    await refreshDelegations();
  }

  return (
    <section className="space-y-3 rounded-xl border bg-surface p-5 shadow-sm">
      <h3 className="font-semibold text-ink">PIs I support</h3>
      {delegationsToMe.length > 0 ? (
        <ul className="divide-y divide-rule rounded-lg border border-rule">
          {delegationsToMe.map((g) => (
            <li key={g.piUserId} className="flex items-center justify-between gap-3 px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink">{g.piEmail}</p>
                <p className="text-xs text-muted">
                  Access since {formatIsoDateDisplay(g.createdAt) ?? g.createdAt} · open it from
                  the picker in the header
                </p>
              </div>
              <button
                type="button"
                className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-critical hover:bg-critical-soft"
                onClick={() => void leave(g.piUserId, g.piEmail)}
              >
                <LogOut className="h-3.5 w-3.5" aria-hidden />
                Leave
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted">
          No PI has shared a workspace with you yet. Request access below — they approve, you
          get in.
        </p>
      )}
      <RequestAccessForm />
    </section>
  );
}
