"use client";

import { useEffect, useState } from "react";
import { Check, X } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useWorkspace } from "@/context/WorkspaceContext";
import {
  fetchRequestsForMeAsPi,
  respondToDelegationRequest,
  type DelegationRequest,
} from "@/lib/supabase/delegationRequests";
import { sendDelegationEmail } from "@/lib/supabase/delegationEmail";
import { formatIsoDateDisplay } from "@/lib/utils/parse";

/**
 * The PI's side of the request flow: approve or decline analysts asking for
 * access. Approval happens here, signed in — never from an email link, so a
 * forwarded email can't grant anything. Approving runs the exact machinery
 * the PI-initiated grant always used; declining just marks the request, and
 * the analyst sees the state in their own panel (no rejection email).
 */
export function PendingRequestsCard() {
  const { cloudSyncEnabled, user } = useAuth();
  const { activeOwner, addDelegate } = useWorkspace();
  const [requests, setRequests] = useState<DelegationRequest[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const enabled = Boolean(user && cloudSyncEnabled && activeOwner?.isSelf);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void fetchRequestsForMeAsPi().then((rows) => {
      if (!cancelled) setRequests(rows.filter((r) => r.status === "pending"));
    });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  // No requests, no card — an empty approvals panel is noise for every PI
  // who has never been asked.
  if (!enabled || requests.length === 0) return null;

  async function respond(request: DelegationRequest, approve: boolean) {
    if (busyId) return;
    setBusyId(request.id);
    setError(null);
    if (approve) {
      // Grant first, then mark: if the grant fails the request stays
      // pending and actionable rather than approved-but-inert.
      const granted = await addDelegate(request.analystEmail);
      if (!granted.ok) {
        setBusyId(null);
        setError(granted.error ?? "The grant could not be created. Try again.");
        return;
      }
    }
    const result = await respondToDelegationRequest(
      request.id,
      approve ? "approved" : "declined"
    );
    if (result.ok && approve) {
      await sendDelegationEmail(request.id, "approved");
    }
    setBusyId(null);
    if (!result.ok) {
      setError(result.error ?? "The response didn't save. Try again.");
      return;
    }
    setRequests((prev) => prev.filter((r) => r.id !== request.id));
  }

  return (
    <section className="space-y-3 rounded-xl border border-accent/40 bg-surface p-5 shadow-sm">
      <h3 className="font-semibold text-ink">Access requests</h3>
      <p className="text-sm text-ink-2">
        These people asked to work in your workspace as financial analysts. Approving gives
        them the same view and edit access you have, until you remove them below.
      </p>
      <ul className="divide-y divide-rule rounded-lg border border-rule">
        {requests.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium text-ink">
                {r.analystName ? `${r.analystName} · ${r.analystEmail}` : r.analystEmail}
              </p>
              <p className="text-xs text-muted">
                Asked {formatIsoDateDisplay(r.createdAt) ?? r.createdAt}
                {r.note ? ` · “${r.note}”` : ""}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                disabled={busyId === r.id}
                onClick={() => void respond(r, true)}
                className="inline-flex items-center gap-1 rounded-lg bg-accent px-2.5 py-1.5 text-sm font-medium text-on-accent hover:bg-accent-hover disabled:opacity-50"
              >
                <Check className="h-3.5 w-3.5" aria-hidden />
                Approve
              </button>
              <button
                type="button"
                disabled={busyId === r.id}
                onClick={() => void respond(r, false)}
                className="inline-flex items-center gap-1 rounded-lg border border-control px-2.5 py-1.5 text-sm font-medium text-ink-2 hover:bg-inset disabled:opacity-50"
              >
                <X className="h-3.5 w-3.5" aria-hidden />
                Decline
              </button>
            </div>
          </li>
        ))}
      </ul>
      {error && <p className="text-sm text-critical">{error}</p>}
    </section>
  );
}
