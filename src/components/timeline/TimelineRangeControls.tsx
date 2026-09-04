"use client";

import type { MonthRange } from "@/lib/timeline/range";
import {
  presetFullRange,
  presetPastMonths,
  rangesEqual,
} from "@/lib/timeline/range";
import { cn } from "@/lib/utils/cn";

function SegmentedButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
        active
          ? "bg-brand-ground text-white shadow-sm"
          : "text-ink-2 hover:bg-surface hover:text-ink"
      )}
    >
      {children}
    </button>
  );
}

export function TimelineRangeControls({
  range,
  availableMonths,
  onChange,
  className,
}: {
  range: MonthRange;
  availableMonths: string[];
  onChange: (range: MonthRange) => void;
  className?: string;
}) {
  const sorted = [...availableMonths].sort();
  const minMonth = sorted[0] ?? range.start;
  const maxMonth = sorted[sorted.length - 1] ?? range.end;

  const preset6 = presetPastMonths(availableMonths, 6);
  const preset12 = presetPastMonths(availableMonths, 12);
  const presetAll = presetFullRange(availableMonths);

  const apply = (start: string, end: string) => {
    if (!start || !end) return;
    onChange({ start: start < end ? start : end, end: start < end ? end : start });
  };

  return (
    <div className={cn("flex flex-wrap items-center gap-2", className)}>
      <input
        type="month"
        className="rounded-md border border-rule bg-surface px-2 py-1 text-xs text-ink shadow-sm"
        min={minMonth}
        max={maxMonth}
        value={range.start}
        onChange={(e) => apply(e.target.value, range.end)}
        aria-label="Range start month"
      />
      <span className="text-muted">–</span>
      <input
        type="month"
        className="rounded-md border border-rule bg-surface px-2 py-1 text-xs text-ink shadow-sm"
        min={minMonth}
        max={maxMonth}
        value={range.end}
        onChange={(e) => apply(range.start, e.target.value)}
        aria-label="Range end month"
      />
      <div className="flex rounded-lg bg-inset/90 p-0.5 ring-1 ring-rule/80">
        <SegmentedButton
          active={rangesEqual(range, preset6)}
          onClick={() => onChange(preset6)}
        >
          6 mo
        </SegmentedButton>
        <SegmentedButton
          active={rangesEqual(range, preset12)}
          onClick={() => onChange(preset12)}
        >
          12 mo
        </SegmentedButton>
        <SegmentedButton
          active={rangesEqual(range, presetAll)}
          onClick={() => onChange(presetAll)}
        >
          All
        </SegmentedButton>
      </div>
    </div>
  );
}
