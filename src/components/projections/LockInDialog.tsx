"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { X } from "lucide-react";
import type { ChangeRequestDetails } from "@/lib/projections/changeSummary";
import { changeSummarySentences } from "@/lib/projections/changeSummary";
import { renderChangeSummarySvg } from "@/lib/projections/changeImage";
import { submitLockIn, type LockInResult } from "@/lib/projections/lockIn";
import { fetchDelegatesForWorkspace } from "@/lib/supabase/delegates";

/**
 * The confirmation step of the handoff: exactly what will be recorded and
 * emailed — the summary sentences, the rendered image (the same SVG the
 * analyst receives), and who gets it. Submitting persists the request first;
 * an email failure leaves it retryable from Status.
 */
export function LockInDialog({
  details,
  piUserId,
  createdByEmail,
  isSelfWorkspace,
  onLocked,
  onClose,
}: {
  details: ChangeRequestDetails;
  piUserId: string;
  createdByEmail: string;
  isSelfWorkspace: boolean;
  /** Fired once the request is recorded — the moment the plan becomes final. */
  onLocked: () => void;
  onClose: () => void;
}) {
  // No SSR-mount guard needed: the dialog only ever mounts from a click,
  // long after hydration, so document.body is always there.
  const [recipients, setRecipients] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<LockInResult | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const grants = await fetchDelegatesForWorkspace(piUserId);
      if (!cancelled) setRecipients(grants.map((g) => g.analystEmail));
    })();
    return () => {
      cancelled = true;
    };
  }, [piUserId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const sentences = useMemo(() => changeSummarySentences(details), [details]);
  const preview = useMemo(() => renderChangeSummarySvg(details), [details]);
  const hasChanges = details.lines.length > 0;
  const noRecipients = recipients !== null && recipients.length === 0 && isSelfWorkspace;

  async function confirm() {
    if (busy) return;
    setBusy(true);
    const r = await submitLockIn({ details, piUserId, createdByEmail });
    setBusy(false);
    setResult(r);
    // Keyed on the request being saved, not on the email: a failed email is
    // retryable from Status, but the plan has still been handed off.
    if (r.ok) onLocked();
  }

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="lock-in-title"
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-5 shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id="lock-in-title" className="text-lg font-semibold text-[#0c2340]">
            Lock in {details.personName}&apos;s distribution change
          </h2>
          <button
            type="button"
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {result?.ok ? (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-slate-700">
              The request is recorded and now tracks on the Status page.{" "}
              {details.personName}&apos;s distribution is locked so it can&apos;t be changed by
              accident — use <strong>Locked In</strong> on their row to unlock it.
            </p>
            {result.emailOk ? (
              <p className="text-sm text-slate-700">
                {result.recipients && result.recipients.length > 0
                  ? `Emailed ${result.recipients.join(", ")}.`
                  : "The notification email is on its way."}
              </p>
            ) : (
              <p className="text-sm text-amber-700">
                The request is saved, but the email didn&apos;t go out
                {result.emailError ? ` — ${result.emailError}` : ""}. You can resend it from the
                Status page.
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Link
                href="/status"
                className="rounded-lg bg-teal-700 px-3 py-2 text-sm font-medium text-white hover:bg-teal-800"
              >
                View on Status page
              </Link>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="mt-2 text-sm text-slate-600">
              Locking in records this request on the Status page and emails your analyst the
              summary below with the distribution image — everything needed to make the change
              in the payroll system. It also locks {details.personName}&apos;s distribution
              against further edits until you unlock it.
            </p>

            {hasChanges ? (
              <ul className="mt-3 space-y-1 rounded-lg border border-slate-200 bg-slate-50 p-3">
                {sentences.map((s) => (
                  <li key={s} className="text-sm text-slate-800">
                    {s}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                Your plan currently matches the projected distribution — there&apos;s nothing to
                hand off. Set a distribution rule first.
              </p>
            )}

            <div
              className="mt-3 overflow-x-auto rounded-lg border border-slate-200"
              // The exact image the analyst receives — not a re-styling of it.
              dangerouslySetInnerHTML={{ __html: preview.svg }}
            />

            <p className="mt-3 text-sm text-slate-600">
              {recipients === null
                ? "Checking who will be notified…"
                : recipients.length > 0
                  ? `Will email: ${recipients.join(", ")}`
                  : isSelfWorkspace
                    ? "No analyst has access to your workspace yet."
                    : "Your analysts with access will be emailed."}
            </p>
            {noRecipients && (
              <p className="mt-1 text-sm text-amber-700">
                Add your analyst under{" "}
                <Link href="/settings" className="font-medium underline">
                  Settings → Privacy &amp; sync
                </Link>{" "}
                so the handoff email has somewhere to go.
              </p>
            )}

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy || !hasChanges || noRecipients}
                onClick={() => void confirm()}
                className="rounded-lg bg-teal-700 px-3 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-50"
              >
                {busy ? "Locking in…" : "Lock In"}
              </button>
            </div>
            {result && !result.ok && (
              <p className="mt-2 text-sm text-red-600">{result.error}</p>
            )}
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
