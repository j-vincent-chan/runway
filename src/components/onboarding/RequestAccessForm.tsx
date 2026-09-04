"use client";

import { useCallback, useEffect, useState } from "react";
import { Send, X } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import {
  cancelDelegationRequest,
  createDelegationRequest,
  fetchMyDelegationRequests,
  type DelegationRequest,
} from "@/lib/supabase/delegationRequests";
import { sendDelegationEmail } from "@/lib/supabase/delegationEmail";
import { formatIsoDateDisplay } from "@/lib/utils/parse";

/**
 * The analyst's ask: type a PI's email, send a request. Lives on the Welcome
 * step for new analysts and permanently in Settings. The confirmation reads
 * the same whether or not that email has a Runway account — the flow never
 * leaks who has signed up — and access only ever appears when the PI
 * approves.
 */
export function RequestAccessForm({
  onDone,
  onSubmitted,
  hideRequestList = false,
}: {
  onDone?: () => void;
  /** Fires after a request is created — hosts that render their own request list refresh on it. */
  onSubmitted?: () => void;
  /** Hosts that render requests themselves (Workspaces page) suppress the built-in lists. */
  hideRequestList?: boolean;
}) {
  const { user } = useAuth();
  const [piEmail, setPiEmail] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [requests, setRequests] = useState<DelegationRequest[]>([]);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const rows = await fetchMyDelegationRequests();
    setRequests(rows);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetchMyDelegationRequests().then((rows) => {
      if (!cancelled) setRequests(rows);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function submit() {
    const target = piEmail.trim();
    if (!target || busy || !user) return;
    setBusy(true);
    setError(null);
    setSentTo(null);
    const result = await createDelegationRequest({
      piEmail: target,
      analystEmail: user.email ?? "",
      analystName: ((user.user_metadata?.full_name as string | undefined) ?? "").trim(),
      note,
    });
    if (!result.ok) {
      setBusy(false);
      setError(result.error ?? "The request could not be sent. Try again.");
      return;
    }
    if (result.requestId) {
      // Best effort: the request row is the truth; a failed email leaves it
      // pending and visible to the PI in-app.
      await sendDelegationEmail(result.requestId, "request");
    }
    setBusy(false);
    setPiEmail("");
    setNote("");
    setSentTo(target);
    await refresh();
    onSubmitted?.();
  }

  const pending = requests.filter((r) => r.status === "pending");
  const responded = requests.filter((r) => r.status !== "pending");

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <input
          type="email"
          placeholder="pi@university.edu"
          autoComplete="off"
          className="min-w-0 flex-1 rounded border px-3 py-2 text-sm"
          value={piEmail}
          onChange={(e) => setPiEmail(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void submit();
            }
          }}
        />
        <button
          type="button"
          disabled={busy || !piEmail.trim()}
          onClick={() => void submit()}
          className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-medium text-on-accent hover:bg-accent-hover disabled:opacity-50"
        >
          <Send className="h-3.5 w-3.5" aria-hidden />
          {busy ? "Sending…" : "Request access"}
        </button>
      </div>
      <input
        type="text"
        placeholder="Optional note — e.g. “I handle the Chan Lab's post-award”"
        className="w-full rounded border px-3 py-2 text-sm"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      {error && <p className="text-sm text-critical">{error}</p>}
      {sentTo && (
        <p className="text-sm text-accent">
          Request sent to {sentTo}. You&apos;ll see their workspace in the header&apos;s
          picker once they approve.
        </p>
      )}

      {!hideRequestList && pending.length > 0 && (
        <ul className="divide-y divide-rule rounded-lg border border-rule">
          {pending.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink">{r.piEmail}</p>
                <p className="text-xs text-muted">
                  Waiting for approval · asked {formatIsoDateDisplay(r.createdAt) ?? r.createdAt}
                </p>
              </div>
              <button
                type="button"
                className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-sm text-muted hover:bg-inset"
                onClick={() => {
                  void cancelDelegationRequest(r.id).then(refresh);
                }}
              >
                <X className="h-3.5 w-3.5" aria-hidden />
                Cancel
              </button>
            </li>
          ))}
        </ul>
      )}
      {!hideRequestList && responded.length > 0 && (
        <ul className="space-y-1">
          {responded.slice(0, 5).map((r) => (
            <li key={r.id} className="text-xs text-muted">
              {r.piEmail} —{" "}
              {r.status === "approved" ? "approved" : "declined"}
              {r.respondedAt ? ` ${formatIsoDateDisplay(r.respondedAt) ?? ""}` : ""}
            </li>
          ))}
        </ul>
      )}

      {onDone && (
        <button
          type="button"
          onClick={onDone}
          className="w-full rounded-lg border border-control px-3 py-2 text-sm font-medium text-ink-2 hover:bg-inset"
        >
          {pending.length > 0 || sentTo ? "Continue to Runway" : "Skip for now"}
        </button>
      )}
    </div>
  );
}
