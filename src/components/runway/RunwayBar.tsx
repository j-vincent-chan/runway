"use client";

import { cn } from "@/lib/utils/cn";
import {
  isRunwayBeyondBarCap,
  isRunwayStatusLabel,
  runwayBarFillPercent,
  runwayLabelClass,
  runwayMonthsLabel,
  runwayUrgencyClass,
} from "@/lib/runway/calculate";
import { Sparkles } from "lucide-react";

/** Fixed track width so every runway bar is comparable. */
const RUNWAY_TRACK_CLASS = "w-44";

export function RunwayBar({
  months,
  className,
  showLabel = true,
  showScale = true,
}: {
  months: number | null;
  className?: string;
  showLabel?: boolean;
  /** Show 0 / 3 yr ticks under the track */
  showScale?: boolean;
}) {
  const beyondCap = isRunwayBeyondBarCap(months);
  const fillPct = beyondCap ? 100 : runwayBarFillPercent(months);
  const statusLabel = isRunwayStatusLabel(months);

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <div
        className={cn("relative shrink-0", RUNWAY_TRACK_CLASS)}
        title={
          beyondCap
            ? `${runwayMonthsLabel(months)} — scale capped at 3 years for comparison`
            : undefined
        }
      >
        <div className="relative h-3 overflow-visible rounded-sm bg-inset">
          <div
            className={cn(
              "absolute inset-y-0 left-0 rounded-sm transition-all",
              runwayUrgencyClass(months),
              beyondCap && "rounded-r-none shadow-[2px_0_8px_rgba(16,185,129,0.45)]"
            )}
            style={{ width: `${fillPct}%` }}
          />
          {beyondCap && (
            <div
              className="pointer-events-none absolute inset-y-0 right-0 flex items-center"
              aria-hidden
            >
              <div className="absolute right-0 top-1/2 h-5 w-8 -translate-y-1/2 bg-healthy/80" />
              <div className="relative flex items-center">
                <span className="absolute -right-1 top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full bg-healthy/70 blur-[3px]" />
                <span className="absolute right-0 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-healthy" />
                <Sparkles className="relative -mr-2.5 h-4 w-4 text-healthy drop-shadow-sm" />
              </div>
            </div>
          )}
        </div>
        {showScale && (
          <div className="mt-0.5 flex justify-between text-[8px] tabular-nums text-muted">
            <span>0</span>
            <span>3 yr</span>
          </div>
        )}
      </div>
      {showLabel && (
        <span
          className={cn(
            "shrink-0 text-[11px] font-medium",
            statusLabel
              ? runwayLabelClass(months)
              : cn(
                  "min-w-[3.25rem] text-right tabular-nums",
                  runwayLabelClass(months),
                  beyondCap && "font-semibold text-healthy"
                )
          )}
        >
          {runwayMonthsLabel(months)}
        </span>
      )}
    </div>
  );
}
