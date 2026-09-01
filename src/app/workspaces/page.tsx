"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Clock, X } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useWorkspace } from "@/context/WorkspaceContext";
import { LedgerWordmark } from "@/components/brand/LedgerWordmark";
import { RequestAccessForm } from "@/components/onboarding/RequestAccessForm";
import {
  cancelDelegationRequest,
  fetchMyDelegationRequests,
  type DelegationRequest,
} from "@/lib/supabase/delegationRequests";
import { partitionAnalystRequests } from "@/lib/workspaces/partition";
import { formatIsoDateDisplay } from "@/lib/utils/parse";

/**
 * The analyst's front door. An analyst never has a standalone runway — their
 * Runway is always a PI's workspace they were delegated into — so this page
 * is where they land until a PI has approved access, and where they come
 * back to switch PIs or ask for another. PIs are routed straight through to
 * their own Dashboard; this page is not part of their world.
 */
export default function WorkspacesPage() {
  const router = useRouter();
  const { configured, ready, user, signOut } = useAuth();
  const {
    delegationsToMe,
    rolePreference,
    workspaceReady,
    switchWorkspace,
    refreshDelegations,
  } = useWorkspace();
  const [requests, setRequests] = useState<DelegationRequest[]>([]);
  const [requestsLoaded, setRequestsLoaded] = useState(false);

  const refreshRequests = useCallback(async () => {
    const rows = await fetchMyDelegationRequests();
    setRequests(rows);
    setRequestsLoaded(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    if (!configured || !user) {
      router.replace(configured ? "/login" : "/dashboard");
      return;
    }
    // Re-pull grants on every visit so an approval granted since sign-in
    // shows up without a reload, then load the request history.
    void refreshDelegations();
    let cancelled = false;
    void fetchMyDelegationRequests().then((rows) => {
      if (cancelled) return;
      setRequests(rows);
      setRequestsLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [ready, configured, user, router, refreshDelegations]);

  useEffect(() => {
    // PIs (and accounts with no recorded role) have their own workspace;
    // there is nothing to pick. Signed-out visits are the first effect's
    // problem — workspaceReady is trivially true without a session.
    if (!ready || !configured || !user) return;
    if (workspaceReady && rolePreference !== "analyst") router.replace("/dashboard");
  }, [ready, configured, user, workspaceReady, rolePreference, router]);

  function openWorkspace(piUserId: string) {
    switchWorkspace(piUserId);
    router.replace("/dashboard");
  }

  if (!ready || !user || !workspaceReady || rolePreference !== "analyst") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0c2340] text-slate-400">
        Loading…
      </main>
    );
  }

  const buckets = partitionAnalystRequests(requests, delegationsToMe);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#0c2340] p-6">
      <div className="mb-8">
        <LedgerWordmark variant="sidebar" />
      </div>
      <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-lg">
        <h1 className="text-xl font-semibold text-[#0c2340]">Your PI workspaces</h1>
        <p className="mt-1 text-sm text-slate-600">
          Runway opens inside the workspace of a PI you support. Pick one below, or
          request access to another.
        </p>

        <div className="mt-4 space-y-2">
          {delegationsToMe.length === 0 ? (
            requestsLoaded && buckets.pending.length === 0 ? (
              <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">
                No PI has approved access yet. Send a request below — their workspace
                appears here the moment they approve, and you&apos;ll get an email.
              </p>
            ) : null
          ) : (
            delegationsToMe.map((g) => (
              <button
                key={g.piUserId}
                type="button"
                onClick={() => openWorkspace(g.piUserId)}
                className="flex w-full items-center justify-between gap-3 rounded-lg border border-slate-300 p-4 text-left hover:border-teal-700 hover:bg-teal-50/40"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-[#0c2340]">
                    {g.piEmail}
                  </span>
                  <span className="mt-0.5 block text-xs text-slate-500">
                    Access since {formatIsoDateDisplay(g.createdAt) ?? g.createdAt}
                  </span>
                </span>
                <span className="inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-teal-700">
                  Open workspace
                  <ArrowRight className="h-4 w-4" aria-hidden />
                </span>
              </button>
            ))
          )}

          {buckets.pending.map((r) => (
            <div
              key={r.id}
              className="flex w-full items-center justify-between gap-3 rounded-lg border border-dashed border-slate-300 p-4"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-medium text-slate-700">
                  {r.piEmail}
                </span>
                <span className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
                  <Clock className="h-3 w-3" aria-hidden />
                  Pending — waiting for {r.piEmail} to approve · asked{" "}
                  {formatIsoDateDisplay(r.createdAt) ?? r.createdAt}
                </span>
              </span>
              <button
                type="button"
                className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-slate-500 hover:bg-slate-100"
                onClick={() => {
                  void cancelDelegationRequest(r.id).then(refreshRequests);
                }}
              >
                <X className="h-3.5 w-3.5" aria-hidden />
                Cancel
              </button>
            </div>
          ))}

          {[...buckets.revoked, ...buckets.declined].map((r) => (
            <div key={r.id} className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="truncate text-sm font-medium text-slate-600">{r.piEmail}</p>
              <p className="mt-0.5 text-xs text-slate-500">
                {r.status === "declined"
                  ? `Declined${r.respondedAt ? ` ${formatIsoDateDisplay(r.respondedAt) ?? ""}` : ""}`
                  : "Access removed"}{" "}
                — you can send a new request below.
              </p>
            </div>
          ))}
        </div>

        <div className="mt-6 border-t border-slate-200 pt-4">
          <h2 className="text-sm font-semibold text-[#0c2340]">
            Request access to another PI
          </h2>
          <div className="mt-2">
            <RequestAccessForm hideRequestList onSubmitted={() => void refreshRequests()} />
          </div>
        </div>
      </div>
      <button
        type="button"
        onClick={() => void signOut()}
        className="mt-6 text-sm text-slate-400 hover:text-slate-200 hover:underline"
      >
        Sign out
      </button>
    </main>
  );
}
