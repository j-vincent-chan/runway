"use client";

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
  return (
    <div
      className={cn(
        "ml-auto w-full max-w-[12rem] rounded-lg border border-slate-200 bg-white p-2",
        "text-right shadow-sm"
      )}
    >
      <div className="flex items-center justify-end gap-2">
        <label className="shrink-0 text-[10px] font-medium text-slate-500">Fund ends</label>
        <input
          type="date"
          className="min-w-0 flex-1 rounded border border-slate-200 px-1.5 py-1 text-[11px] text-slate-800"
          value={endDate ?? ""}
          onChange={(e) => onEndDateChange(e.target.value || null)}
          required
          title="Required — every account you don't control still needs a horizon, or it reads as never running out. Defaults to fiscal year end; clearing it restores that."
        />
      </div>
      {hasEstimate ? (
        <p
          className="mt-1.5 text-sm font-semibold tabular-nums text-[#0c2340]"
          title={`${formatCurrency(sharedMonthlyBurn)}/mo × months to end date`}
        >
          {formatCurrencyBalance(estimatedBalance)}
          <span className="ml-1 text-[10px] font-normal text-sky-700">est.</span>
        </p>
      ) : (
        <p className="mt-1.5 text-[10px] leading-snug text-slate-400">
          {sharedMonthlyBurn > 0 ? "Set an end date to estimate this balance" : "No burn data"}
        </p>
      )}
    </div>
  );
}
