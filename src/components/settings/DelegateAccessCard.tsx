"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useWorkspace } from "@/context/WorkspaceContext";
import { formatIsoDateDisplay } from "@/lib/utils/parse";

/**
 * The PI side of delegation: grant or revoke a financial analyst's access to
 * this workspace. The analyst side (opening a granted workspace) lives in the
 * Header's workspace picker.
 */
export function DelegateAccessCard() {
  const { cloudSyncEnabled, user } = useAuth();
  const { myDelegates, addDelegate, removeDelegate, activeOwner } = useWorkspace();
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!user || !cloudSyncEnabled) {
    return (
      <section className="rounded-xl border bg-white p-5 shadow-sm">
        <h3 className="font-semibold text-[#0c2340]">Financial analyst access</h3>
        <p className="mt-2 text-sm text-slate-600">
          Sign in with cloud sync on to share this workspace with your financial analyst.
          Access grants live in your private cloud workspace, so they need it enabled.
        </p>
      </section>
    );
  }

  if (activeOwner && !activeOwner.isSelf) {
    return (
      <section className="rounded-xl border bg-white p-5 shadow-sm">
        <h3 className="font-semibold text-[#0c2340]">Financial analyst access</h3>
        <p className="mt-2 text-sm text-slate-600">
          You&apos;re working in {activeOwner.email}&apos;s workspace. Only the workspace owner
          can grant or revoke analyst access — switch back to your own workspace to manage
          yours.
        </p>
      </section>
    );
  }

  async function grant() {
    const value = email.trim();
    if (!value || busy) return;
    setBusy(true);
    setError(null);
    const result = await addDelegate(value);
    setBusy(false);
    if (!result.ok) {
      setError(result.error ?? "Could not grant access. Try again.");
      return;
    }
    setEmail("");
  }

  return (
    <section className="space-y-3 rounded-xl border bg-white p-5 shadow-sm">
      <h3 className="font-semibold text-[#0c2340]">Financial analyst access</h3>
      <p className="text-sm text-slate-600">
        An analyst you add signs in with their own account and opens your workspace from the
        picker in the header. They see and edit everything you can — including uploading
        monthly reports — until you remove them here.
      </p>

      {myDelegates.length > 0 ? (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {myDelegates.map((g) => (
            <li key={g.analystEmail} className="flex items-center justify-between gap-3 px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-800">{g.analystEmail}</p>
                <p className="text-xs text-slate-500">
                  Access granted {formatIsoDateDisplay(g.createdAt) ?? g.createdAt}
                </p>
              </div>
              <button
                type="button"
                className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-red-600 hover:bg-red-50"
                onClick={() => {
                  if (
                    window.confirm(
                      `Remove ${g.analystEmail}'s access to your workspace? They keep their own account; they just can't open yours anymore.`
                    )
                  ) {
                    void removeDelegate(g.analystEmail);
                  }
                }}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-500">
          No one else can open this workspace yet. Add your analyst&apos;s email to share it.
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="email"
          value={email}
          placeholder="analyst@ucsf.edu"
          className="w-64 rounded-lg border border-slate-300 px-3 py-2 text-sm"
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void grant();
          }}
        />
        <button
          type="button"
          disabled={busy || !email.trim()}
          onClick={() => void grant()}
          className="rounded-lg bg-teal-700 px-3 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-50"
        >
          {busy ? "Granting…" : "Grant access"}
        </button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <p className="text-xs text-slate-500">
        The email must match the account your analyst signs in with. They&apos;ll see your
        workspace in their header picker the next time they sign in or refresh.
      </p>
    </section>
  );
}
