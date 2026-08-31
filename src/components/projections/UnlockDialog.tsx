"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { ChangeRequestRecord } from "@/lib/supabase/changeRequests";
import { formatIsoDateDisplay } from "@/lib/utils/parse";

/**
 * Unlocking a person whose request has already been emailed is a real fork:
 * the analyst knows about the request, so the PI has to say what it now
 * means — "I'm revising it" (stays open, marked on hold, out of the digest
 * until re-locked) or "withdraw it" (closed; the next summary tells the
 * analyst no action is needed). A window.confirm can't carry three choices.
 */
export function UnlockDialog({
  request,
  personName,
  onRevise,
  onWithdraw,
  onClose,
}: {
  request: ChangeRequestRecord;
  personName: string;
  onRevise: () => void;
  onWithdraw: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const inProgress = request.status === "in_progress";
  const sentOn = request.emailSentAt ? formatIsoDateDisplay(request.emailSentAt) : null;

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
        aria-labelledby="unlock-title"
        className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id="unlock-title" className="text-lg font-semibold text-[#0c2340]">
            Unlock {personName}&apos;s distribution?
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

        <p className="mt-2 text-sm text-slate-600">
          Their change request was already emailed to your analyst
          {sentOn ? ` on ${sentOn}` : ""}
          {inProgress ? (
            <>
              {" "}
              and <strong>{request.statusChangedByEmail}</strong> has marked it in progress
            </>
          ) : null}
          . What should happen to it?
        </p>

        <div className="mt-4 space-y-2">
          <button
            type="button"
            onClick={onRevise}
            className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-left text-sm hover:bg-slate-50"
          >
            <span className="font-medium text-[#0c2340]">I&apos;m revising it</span>
            <span className="mt-0.5 block text-slate-600">
              The request stays open, marked on hold so your analyst can see it&apos;s being
              revised. Lock in again to send the updated version in the next summary.
            </span>
          </button>
          <button
            type="button"
            onClick={onWithdraw}
            className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-left text-sm hover:bg-slate-50"
          >
            <span className="font-medium text-[#0c2340]">Withdraw the request</span>
            <span className="mt-0.5 block text-slate-600">
              It closes as withdrawn and the next summary tells your analyst no action is needed.
            </span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-500 hover:bg-slate-50"
          >
            Cancel — keep it locked
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
