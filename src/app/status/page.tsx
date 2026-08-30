"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { useApp } from "@/context/AppContext";
import { useAuth } from "@/context/AuthContext";
import { useWorkspace } from "@/context/WorkspaceContext";
import { ChangeRequestList } from "@/components/status/ChangeRequestList";
import { StatusToolbar, type StatusFilterId } from "@/components/status/StatusToolbar";
import { STATUS_LABEL } from "@/components/status/StatusChip";
import {
  fetchChangeRequests,
  updateChangeRequestStatus,
  type ChangeRequestRecord,
  type ChangeRequestStatus,
} from "@/lib/supabase/changeRequests";
import { sendLockInEmail } from "@/lib/projections/lockIn";
import { employeePersonKeys } from "@/lib/employees/stableKey";
import { getEmployeePhotoUrlFor } from "@/lib/employees/roster";
import { formatIsoDateDisplay } from "@/lib/utils/parse";

/**
 * The shared PI ↔ analyst queue of Lock In handoffs. The PI reads it to see
 * whether requested changes actually landed in the payroll system; the
 * analyst (working the delegated workspace) advances each request's status.
 */
export default function StatusPage() {
  const { configured, user, cloudSyncEnabled } = useAuth();
  const { activeOwner } = useWorkspace();
  const { snapshot, settings } = useApp();
  const [requests, setRequests] = useState<ChangeRequestRecord[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [filter, setFilter] = useState<StatusFilterId>("all");
  const [query, setQuery] = useState("");

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

  /** Roster photos so a row reads as a person, not a record. */
  const photoByPersonKey = useMemo(() => {
    const map = new Map<string, string>();
    for (const emp of snapshot?.employees ?? []) {
      const url = getEmployeePhotoUrlFor(settings, emp);
      if (!url) continue;
      for (const key of employeePersonKeys(emp)) map.set(key, url);
    }
    return map;
  }, [snapshot, settings]);

  const counts = useMemo(() => {
    const byStatus: Record<ChangeRequestStatus, number> = {
      pending: 0,
      in_progress: 0,
      completed: 0,
    };
    for (const r of requests) byStatus[r.status] += 1;
    return byStatus;
  }, [requests]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return requests.filter((r) => {
      if (filter !== "all" && r.status !== filter) return false;
      if (!needle) return true;
      if (r.personName.toLowerCase().includes(needle)) return true;
      return r.details.lines.some((l) => l.accountLabel.toLowerCase().includes(needle));
    });
  }, [requests, filter, query]);

  /**
   * The ten-second read: not how many are open, but which one has been
   * waiting longest — a person and a date someone can act on.
   */
  const oldestOpen = useMemo(() => {
    const open = requests.filter((r) => r.status !== "completed");
    if (open.length === 0) return null;
    return open.reduce((a, b) => (a.createdAt <= b.createdAt ? a : b));
  }, [requests]);

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
        <div className="mx-auto max-w-7xl">
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
            <>
              <p className="type-row text-ink-2">
                {oldestOpen ? (
                  <>
                    Waiting longest:{" "}
                    <span className="font-medium text-ink">{oldestOpen.personName}</span>, submitted{" "}
                    {formatIsoDateDisplay(oldestOpen.createdAt) ?? oldestOpen.createdAt} and still{" "}
                    {STATUS_LABEL[oldestOpen.status].toLowerCase()}.
                  </>
                ) : (
                  <>Every request here has been completed.</>
                )}
              </p>

              <div className="mt-3">
                <StatusToolbar
                  filter={filter}
                  onFilterChange={setFilter}
                  query={query}
                  onQueryChange={setQuery}
                  counts={counts}
                  total={requests.length}
                />
              </div>

              <div className="mt-3">
                {visible.length === 0 ? (
                  <p className="type-body py-8 text-center text-muted">
                    {query.trim()
                      ? `No request matches “${query.trim()}”.`
                      : `Nothing is ${
                          filter === "all" ? "here" : STATUS_LABEL[filter].toLowerCase()
                        } right now.`}
                  </p>
                ) : (
                  <ChangeRequestList
                    requests={visible}
                    canUpdateStatus={canUpdateStatus}
                    onSetStatus={(id, status) => void setStatus(id, status)}
                    onResendEmail={resendEmail}
                    photoUrlFor={(personKey) => photoByPersonKey.get(personKey)}
                  />
                )}
              </div>
            </>
          )}
        </div>
      </main>
    </>
  );
}
