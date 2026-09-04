"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { X } from "lucide-react";
import type { ChangeRequestDetails } from "@/lib/projections/changeSummary";
import { changeSummarySentences } from "@/lib/projections/changeSummary";
import { renderChangeSummarySvg } from "@/lib/projections/changeImage";
import { submitLockIn, sendLockInEmail, type LockInResult } from "@/lib/projections/lockIn";
import { nextDigestLabel } from "@/lib/digest/window";
import {
  fetchOpenRequestForPerson,
  type ChangeRequestRecord,
} from "@/lib/supabase/changeRequests";
import { fetchDelegatesForWorkspace } from "@/lib/supabase/delegates";
import { formatIsoDateDisplay } from "@/lib/utils/parse";

/**
 * The confirmation step of the handoff: exactly what will be recorded — the
 * summary sentences and the rendered image — and when it will be emailed.
 * Locking in queues the request for the next morning digest rather than
 * emailing immediately; the overnight gap batches a day's changes into one
 * analyst email and leaves room to unlock and correct.
 *
 * If the person already has an open request, this is a revision: the
 * existing request is updated in place. When the analyst has already marked
 * it in progress, the dialog says so and makes the PI acknowledge that the
 * new version replaces what the analyst is working from.
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
  const [existing, setExisting] = useState<ChangeRequestRecord | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<LockInResult | null>(null);
  const [sendNowState, setSendNowState] = useState<"idle" | "sending" | "sent" | "failed">("idle");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [grants, open] = await Promise.all([
        fetchDelegatesForWorkspace(piUserId),
        fetchOpenRequestForPerson(details.personKey),
      ]);
      if (cancelled) return;
      setRecipients(grants.map((g) => g.analystEmail));
      setExisting(open);
    })();
    return () => {
      cancelled = true;
    };
  }, [piUserId, details.personKey]);

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
  const digestLabel = useMemo(() => nextDigestLabel(new Date()), []);
  const hasChanges = details.lines.length > 0;
  const noRecipients = recipients !== null && recipients.length === 0 && isSelfWorkspace;
  const loadingExisting = existing === undefined;
  const replacesInProgress = existing != null && existing.status === "in_progress";

  async function confirm() {
    if (busy || loadingExisting) return;
    setBusy(true);
    const r = await submitLockIn({ details, piUserId, createdByEmail, existing: existing ?? null });
    setBusy(false);
    setResult(r);
    // Keyed on the request being saved, not on any email: the plan is final
    // once recorded, and the digest picks it up from there.
    if (r.ok) onLocked();
  }

  async function sendNow() {
    if (!result?.ok || sendNowState === "sending") return;
    setSendNowState("sending");
    const r = await sendLockInEmail(result.requestId);
    setSendNowState(r.emailOk ? "sent" : "failed");
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
        className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-surface p-5 shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id="lock-in-title" className="text-lg font-semibold text-ink">
            Lock in {details.personName}&apos;s distribution change
          </h2>
          <button
            type="button"
            className="rounded p-1 text-muted hover:bg-inset hover:text-ink-2"
            aria-label="Close"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {result?.ok ? (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-ink-2">
              {result.mode === "revised"
                ? "The request is updated — your analyst will see one current version, never both. "
                : "The request is recorded and now tracks on the Status page. "}
              {details.personName}&apos;s distribution is locked so it can&apos;t be changed by
              accident — use the lock on their row to unlock it.
            </p>
            {sendNowState === "sent" ? (
              <p className="text-sm text-ink-2">
                Sent — your analyst has been emailed this request directly.
              </p>
            ) : (
              <p className="text-sm text-ink-2">
                It goes out in the summary email {digestLabel}
                {recipients && recipients.length > 0 ? ` to ${recipients.join(", ")}` : ""}. Until
                then you can still unlock, correct, and lock in again.
              </p>
            )}
            {sendNowState === "failed" && (
              <p className="text-sm text-caution">
                The direct send didn&apos;t go through — the request stays queued for the summary,
                or retry from the Status page.
              </p>
            )}
            <div className="flex flex-wrap justify-end gap-2">
              {sendNowState !== "sent" && (
                <button
                  type="button"
                  disabled={sendNowState === "sending"}
                  onClick={() => void sendNow()}
                  className="rounded-lg border border-control px-3 py-2 text-sm font-medium text-ink-2 hover:bg-inset disabled:opacity-50"
                  title="Skip the morning summary and email your analyst this request immediately"
                >
                  {sendNowState === "sending" ? "Sending…" : "Send now instead"}
                </button>
              )}
              <Link
                href="/status"
                className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-on-accent hover:bg-accent-hover"
              >
                View on Status page
              </Link>
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-control px-3 py-2 text-sm font-medium text-ink-2 hover:bg-inset"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="mt-2 text-sm text-ink-2">
              Locking in records this request on the Status page and locks{" "}
              {details.personName}&apos;s distribution against further edits until you unlock it.
              Your analyst gets one summary email {digestLabel} covering everything you&apos;ve
              locked in — not an email per change.
            </p>

            {/* A revision of a request the analyst is already working on is
                the one genuinely risky replace — it gets an explicit
                acknowledgement, not a silent overwrite. */}
            {replacesInProgress && existing && (
              <p className="mt-3 rounded-lg border border-caution bg-caution-soft p-3 text-sm text-caution">
                <strong>{existing.statusChangedByEmail}</strong> marked this person&apos;s previous
                request <strong>in progress</strong>
                {formatIsoDateDisplay(existing.statusChangedAt)
                  ? ` on ${formatIsoDateDisplay(existing.statusChangedAt)}`
                  : ""}
                . Locking in replaces the request they&apos;re working from and sets it back to
                pending.
              </p>
            )}
            {existing && existing.status === "pending" && (
              <p className="mt-3 text-sm text-ink-2">
                {existing.emailSentAt
                  ? "This person already has a request with your analyst — locking in updates it, and the next summary will flag it as updated."
                  : "This person already has a request queued — locking in replaces it before anything is sent."}
              </p>
            )}

            {hasChanges ? (
              <ul className="mt-3 space-y-1 rounded-lg border border-rule bg-inset p-3">
                {sentences.map((s) => (
                  <li key={s} className="text-sm text-ink">
                    {s}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-3 rounded-lg border border-rule bg-inset p-3 text-sm text-ink-2">
                Your plan currently matches the projected distribution — there&apos;s nothing to
                hand off. Set a distribution rule first.
              </p>
            )}

            <div
              className="mt-3 overflow-x-auto rounded-lg border border-rule"
              // The exact image the analyst receives — not a re-styling of it.
              dangerouslySetInnerHTML={{ __html: preview.svg }}
            />

            <p className="mt-3 text-sm text-ink-2">
              {recipients === null
                ? "Checking who will be notified…"
                : recipients.length > 0
                  ? `The summary will go to: ${recipients.join(", ")}`
                  : isSelfWorkspace
                    ? "No analyst has access to your workspace yet."
                    : "Your analysts with access will get the summary."}
            </p>
            {noRecipients && (
              <p className="mt-1 text-sm text-caution">
                Add your analyst under{" "}
                <Link href="/settings" className="font-medium underline">
                  Settings → Privacy &amp; sync
                </Link>{" "}
                so the handoff has somewhere to go.
              </p>
            )}

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-control px-3 py-2 text-sm font-medium text-ink-2 hover:bg-inset"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={busy || !hasChanges || noRecipients || loadingExisting}
                onClick={() => void confirm()}
                className="rounded-lg bg-accent px-3 py-2 text-sm font-medium text-on-accent hover:bg-accent-hover disabled:opacity-50"
              >
                {busy
                  ? "Locking in…"
                  : loadingExisting
                    ? "Checking…"
                    : replacesInProgress
                      ? "Replace & Lock In"
                      : "Lock In"}
              </button>
            </div>
            {result && !result.ok && (
              <p className="mt-2 text-sm text-critical">{result.error}</p>
            )}
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
