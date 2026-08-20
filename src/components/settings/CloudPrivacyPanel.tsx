"use client";

import Link from "next/link";
import { useAuth } from "@/context/AuthContext";

export function CloudPrivacyPanel() {
  const {
    configured,
    user,
    localOnly,
    cloudSyncEnabled,
    setLocalOnly,
    signOut,
  } = useAuth();

  return (
    <section className="rounded-xl border bg-white p-5 shadow-sm space-y-3">
      <h3 className="font-semibold text-[#0c2340]">Privacy &amp; cloud sync</h3>
      <p className="text-sm text-slate-600">
        Payroll data stays in this browser by default. Cloud sync (when enabled) stores
        parsed planning data in a <strong>private</strong> Supabase bucket — not public
        Excel files, and not world-readable URLs.
      </p>

      {!configured && (
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
          Supabase is not configured. Runway works fully in local-only mode.
        </p>
      )}

      {configured && (
        <>
          <p className="text-sm text-slate-700">
            Status:{" "}
            {cloudSyncEnabled ? (
              <span className="font-medium text-teal-800">Cloud sync on</span>
            ) : localOnly ? (
              <span className="font-medium text-amber-800">Local-only (cloud paused)</span>
            ) : user ? (
              <span className="font-medium text-slate-700">Signed in — enable sync below</span>
            ) : (
              <span className="font-medium text-slate-700">Signed out — local data only</span>
            )}
          </p>
          {user ? (
            <p className="text-sm text-slate-600">Signed in as {user.email}</p>
          ) : (
            <Link href="/login" className="inline-block text-sm font-medium text-teal-700 hover:underline">
              Sign in to enable private cloud sync
            </Link>
          )}

          <label className="flex items-start gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              className="mt-1"
              checked={localOnly}
              onChange={(e) => setLocalOnly(e.target.checked)}
            />
            <span>
              Local-only mode — never upload payroll, roster, or workspace data to Supabase
              (even when signed in).
            </span>
          </label>

          {user && (
            <button
              type="button"
              onClick={() => void signOut()}
              className="text-sm text-slate-600 hover:underline"
            >
              Sign out
            </button>
          )}
        </>
      )}

      <p className="text-xs text-slate-500">
        After deploying schema changes, re-run{" "}
        <code className="rounded bg-slate-100 px-1">supabase/schema.sql</code> in the
        SQL editor so buckets are private and RLS is authenticated-only. Rotate API keys
        if they were ever shared — see{" "}
        <code className="rounded bg-slate-100 px-1">PRIVACY.md</code>.
      </p>
    </section>
  );
}
