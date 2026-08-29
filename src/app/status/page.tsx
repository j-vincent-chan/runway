"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { useAuth } from "@/context/AuthContext";
import { useWorkspace } from "@/context/WorkspaceContext";
import { ChangeRequestList } from "@/components/status/ChangeRequestList";
import {
  fetchChangeRequests,
  updateChangeRequestStatus,
  type ChangeRequestRecord,
  type ChangeRequestStatus,
} from "@/lib/supabase/changeRequests";
import { sendLockInEmail } from "@/lib/projections/lockIn";

/**
 * The shared PI ↔ analyst queue of Lock In handoffs. The PI reads it to see
 * whether requested changes actually landed in the payroll system; the
 * analyst (working the delegated workspace) advances each request's status.
 */
export default function StatusPage() {
  const { configured, user, cloudSyncEnabled } = useAuth();
  const { activeOwner } = useWorkspace();
  const [requests, setRequests] = useState<ChangeRequestRecord[]>([]);
  const [loaded, setLoaded] = useState(false);

  const cloudReady = Boolean(configured && user && cloudSyncEnabled);
  // The analyst working a delegated workspace owns the status transitions;
  // the PI reads. RLS permits both — this is a workflow choice, not security.
  const canUpdateStatus = Boolean(activeOwner && !activeOwner.isSelf);

  useEffect(() => {
    if (!cloudReady) return;
    let cancelled = false;
    const load = async () => {
      const rows = await fetchChangeRequests();
      if (cancelled) return;
      setRequests(rows);
      setLoaded(true);
    };
    void load();
    const onFocus = () => void load();
    window.addEventListener("focus", onFocus);
    return () => {
      cancelled = true;
      window.removeEventListener("focus", onFocus);
    };
  }, [cloudReady, activeOwner?.userId]);

  async function setStatus(id: string, status: ChangeRequestStatus) {
    const byEmail = user?.email ?? "";
    const result = await updateChangeRequestStatus(id, status, byEmail);
    if (!result.ok) {
      window.alert(
        `The status change didn't save: ${result.error ?? "unknown error"}. Refresh and try again.`
      );
    }
    setRequests(await fetchChangeRequests());
  }

  async function resendEmail(id: string) {
    const result = await sendLockInEmail(id);
    if (!result.emailOk) {
      window.alert(result.emailError ?? "The email could not be sent. Try again.");
    }
    setRequests(await fetchChangeRequests());
  }

  return (
    <>
      <Header
        ledgerTitle
        title="Status"
        subtitle="Every locked-in distribution change, from handoff to done"
        showImportMeta={false}
      />
      <main className="flex-1 overflow-auto bg-paper p-6">
        <div className="mx-auto max-w-4xl">
          {!cloudReady ? (
            <section className="rounded-md border border-rule bg-surface p-5">
              <h3 className="type-heading text-ink">Sign in to track handoffs</h3>
              <p className="type-body mt-2 text-ink-2">
                Locked-in change requests are shared between you and your financial analyst,
                so they live in your private cloud workspace.{" "}
                {configured && !user ? (
                  <Link href="/login" className="font-medium text-accent hover:underline">
                    Sign in
                  </Link>
                ) : (
                  <Link href="/settings" className="font-medium text-accent hover:underline">
                    Turn on cloud sync in Settings
                  </Link>
                )}{" "}
                to see them here.
              </p>
            </section>
          ) : !loaded ? (
            <p className="type-body text-muted">Loading requests…</p>
          ) : requests.length === 0 ? (
            <section className="rounded-md border border-rule bg-surface p-5">
              <h3 className="type-heading text-ink">No handoffs in flight</h3>
              <p className="type-body mt-2 text-ink-2">
                When you lock in a person&apos;s projected distribution on{" "}
                <Link href="/projections" className="font-medium text-accent hover:underline">
                  Projections
                </Link>
                , the request lands here for you and your analyst to track through completion.
              </p>
            </section>
          ) : (
            <ChangeRequestList
              requests={requests}
              canUpdateStatus={canUpdateStatus}
              onSetStatus={(id, status) => void setStatus(id, status)}
              onResendEmail={resendEmail}
            />
          )}
        </div>
      </main>
    </>
  );
}
