"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { PlannedHireRow } from "@/lib/reconciliation/view";
import { formatCurrency } from "@/lib/utils/parse";

/**
 * Unlinking reverses the identity link and nothing else: imported payroll
 * stays, the plan simulates again with its original assumptions, only the
 * fields Confirm copied are removed, and the link row is kept as reversed.
 * Four facts the PI should read before the one irreversible-looking button.
 */
export function UnlinkPlannedHireDialog({
  row,
  onConfirm,
  onClose,
}: {
  row: PlannedHireRow;
  onConfirm: () => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const person = row.linkedEmployee?.name ?? "this person";
  const split =
    row.accounts.length > 0
      ? `original ${row.accounts.map((a) => `${a.percent}% ${a.label}`).join(" · ")} split`
      : "original distribution";

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
        aria-labelledby="unlink-plan-title"
        className="w-full max-w-lg rounded-xl bg-surface p-5 shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 id="unlink-plan-title" className="text-lg font-semibold text-ink">
            Unlink {person} from the {row.plan.displayName} plan?
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
        <ul className="mt-3 list-disc space-y-1.5 pl-5 text-sm text-ink-2">
          <li>{person}&apos;s imported payroll stays exactly as imported.</li>
          <li>
            {row.plan.displayName} returns to Projections as a planned hire with its {split} and ~
            {formatCurrency(row.monthlyComp)}/mo rate.
          </li>
          <li>
            Team, start and scope copied from the plan are removed again; nothing you typed yourself
            changes.
          </li>
          <li>Recorded in history with who and when. The link row is kept as reversed, not deleted.</li>
        </ul>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            className="rounded-lg border border-rule px-3 py-1.5 text-sm font-medium text-ink-2 hover:bg-inset"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rounded-lg border border-critical px-3 py-1.5 text-sm font-medium text-critical hover:bg-critical-soft"
            onClick={onConfirm}
          >
            Unlink
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
