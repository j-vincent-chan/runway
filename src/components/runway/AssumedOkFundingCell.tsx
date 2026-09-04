"use client";

import { useState } from "react";
import { formatCurrency, formatCurrencyBalance } from "@/lib/utils/parse";
import { cn } from "@/lib/utils/cn";

export function AssumedOkFundingCell({
  endDate,
  estimatedBalance,
  hasEstimate,
  sharedMonthlyBurn,
  onEndDateChange,
}: {
  endDate?: string;
  estimatedBalance: number;
  hasEstimate: boolean;
  sharedMonthlyBurn: number;
  onEndDateChange: (isoDate: string | null) => void;
}) {
  /**
   * A date input reports "" for anything incomplete — a blanked segment, or a
   * month typed with no year yet. Committing on every change therefore handed
   * `null` to the store mid-edit, which restored the default end date and, via
   * the controlled value, overwrote the date the person was still typing.
   *
   * So an empty value is held here until blur, when it genuinely means "left
   * empty". A complete date still commits immediately, so picking one from the
   * calendar saves without waiting for focus to leave.
   *
   * `pendingEmpty` renders as "" while the browser's own value is already "" —
   * React skips the DOM write when they match, so the segments already typed
   * survive.
   */
  const [pendingEmpty, setPendingEmpty] = useState(false);

  return (
    <div
      className={cn(
        "ml-auto w-full max-w-[12rem] rounded-lg border border-rule bg-surface p-2",
        "text-right shadow-sm"
      )}
    >
      <div className="flex items-center justify-end gap-2">
        <label className="shrink-0 text-[10px] font-medium text-muted">Fund ends</label>
        <input
          type="date"
          className="min-w-0 flex-1 rounded border border-rule px-1.5 py-1 text-[11px] text-ink"
          value={pendingEmpty ? "" : (endDate ?? "")}
          onChange={(e) => {
            const next = e.target.value;
            if (next) {
              setPendingEmpty(false);
              if (next !== endDate) onEndDateChange(next);
            } else {
              setPendingEmpty(true);
            }
          }}
          onBlur={() => {
            if (!pendingEmpty) return;
            setPendingEmpty(false);
            onEndDateChange(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          required
          title="Required — every account you don't control still needs a horizon, or it reads as never running out. Defaults to fiscal year end; clearing it restores that."
        />
      </div>
      {hasEstimate ? (
        <p
          className="mt-1.5 text-sm font-semibold tabular-nums text-ink"
          title={`${formatCurrency(sharedMonthlyBurn)}/mo × months to end date`}
        >
          {formatCurrencyBalance(estimatedBalance)}
          <span className="ml-1 text-[10px] font-normal text-estimated">est.</span>
        </p>
      ) : (
        <p className="mt-1.5 text-[10px] leading-snug text-muted">
          {sharedMonthlyBurn > 0 ? "Set an end date to estimate this balance" : "No burn data"}
        </p>
      )}
    </div>
  );
}
