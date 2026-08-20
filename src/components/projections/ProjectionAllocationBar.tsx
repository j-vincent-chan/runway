"use client";

import { cn } from "@/lib/utils/cn";
import { formatCurrency, formatMonthDisplay, formatPercent, hasPercentEffort } from "@/lib/utils/parse";
import { lightenProjectionFill } from "@/lib/projections/grid";

export function ProjectionAllocationBar({
  percentEffort,
  burnTotal,
  display,
  color,
  projected,
  months,
  titlePrefix,
  onClick,
}: {
  percentEffort: number;
  burnTotal: number;
  display: "percent" | "dollars" | "both";
  color: string;
  projected: boolean;
  months: string[];
  titlePrefix: string;
  onClick?: () => void;
}) {
  const rangeLabel =
    months.length > 1
      ? `${formatMonthDisplay(months[0]!)}–${formatMonthDisplay(months[months.length - 1]!)}`
      : formatMonthDisplay(months[0]!);
  const tooltip = `${titlePrefix} · ${rangeLabel} · ${formatPercent(percentEffort)}${
    projected ? " · Projected" : " · Origin month"
  }`;
  const isReversal = percentEffort < 0;
  const fill = projected ? lightenProjectionFill(color) : color;

  if (!hasPercentEffort(percentEffort)) {
    return (
      <button
        type="button"
        className={cn(
          "h-8 w-full cursor-pointer hover:bg-slate-50",
          projected ? "bg-slate-50" : "bg-white"
        )}
        title={tooltip}
        onClick={onClick}
      />
    );
  }

  const label =
    display === "dollars"
      ? formatCurrency(burnTotal).replace(".00", "")
      : display === "both"
        ? `${formatPercent(percentEffort)} · ${formatCurrency(burnTotal).replace(".00", "")}`
        : formatPercent(percentEffort);

  return (
    <button
      type="button"
      title={tooltip}
      onClick={onClick}
      className={cn(
        "allocation-bar allocation-bar-flat flex h-8 w-full items-center justify-center text-[10px] font-medium",
        projected ? "text-slate-600" : "text-slate-800",
        isReversal && "allocation-bar--reversal"
      )}
      style={{ backgroundColor: fill }}
    >
      {label}
    </button>
  );
}
