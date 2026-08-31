"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuth } from "@/context/AuthContext";
import { getSupabase } from "@/lib/supabase/client";
import { upsertMyProfile } from "@/lib/supabase/profiles";

export function CloudPrivacyPanel() {
  const {
    configured,
    user,
    localOnly,
    cloudSyncEnabled,
    setLocalOnly,
    signOut,
  } = useAuth();
  const metadataName = ((user?.user_metadata?.full_name as string | undefined) ?? "").trim();

  return (
    <section className="rounded-xl border bg-white p-5 shadow-sm space-y-3">
      <h3 className="font-semibold text-[#0c2340]">Privacy &amp; cloud sync</h3>
      <p className="text-sm text-slate-600">
        Payroll data stays in this browser by default. Cloud sync (when enabled) stores
        parsed planning data in a <strong>private, per-user</strong> cloud workspace —
        other accounts cannot see or overwrite your datasets.
      </p>

      {!configured && (
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
          Cloud sync is not configured. Runway works fully in local-only mode.
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
            <SignedInAs email={user.email ?? ""} metadataName={metadataName} />
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
              Local-only mode — never upload payroll, roster, or workspace data to the cloud
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

    </section>
  );
}

/**
 * "Signed in as Vincent Chan (vincent.chan@ucsf.edu)" with the name
 * editable in place — the one spot an account that predates the sign-up
 * name field can set theirs. Saving writes auth metadata (the live source
 * every surface reads) and the profiles row together.
 */
function SignedInAs({ email, metadataName }: { email: string; metadataName: string }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(metadataName);
  const [busy, setBusy] = useState(false);

  async function save() {
    const value = name.trim();
    if (busy) return;
    setBusy(true);
    const supabase = getSupabase();
    if (supabase) {
      const { error } = await supabase.auth.updateUser({ data: { full_name: value } });
      if (error) {
        setBusy(false);
        window.alert(`The name didn't save: ${error.message}`);
        return;
      }
    }
    await upsertMyProfile({ fullName: value });
    setBusy(false);
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          autoComplete="name"
          placeholder="Your full name"
          className="rounded border px-2 py-1 text-sm"
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void save();
          }}
        />
        <button
          type="button"
          disabled={busy}
          onClick={() => void save()}
          className="text-sm font-medium text-teal-700 hover:underline disabled:opacity-50"
        >
          {busy ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          onClick={() => {
            setName(metadataName);
            setEditing(false);
          }}
          className="text-sm text-slate-500 hover:underline"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <p className="text-sm text-slate-600">
      Signed in as {metadataName ? `${metadataName} (${email})` : email}{" "}
      <button
        type="button"
        onClick={() => setEditing(true)}
        className="text-sm font-medium text-teal-700 hover:underline"
      >
        {metadataName ? "Edit name" : "Add your name"}
      </button>
    </p>
  );
}
