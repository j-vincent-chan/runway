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
  unfunded = false,
  dryStart = false,
  dryMonthLabel,
  readOnly = false,
  onClick,
}: {
  percentEffort: number;
  burnTotal: number;
  display: "percent" | "dollars" | "both";
  color: string;
  projected: boolean;
  months: string[];
  titlePrefix: string;
  /** The account backing this effort has no balance left in these months. */
  unfunded?: boolean;
  /** These are the first months past the account's zero crossing. */
  dryStart?: boolean;
  dryMonthLabel?: string;
  /** The person's distribution is locked in — the cell shows but never edits. */
  readOnly?: boolean;
  onClick?: () => void;
}) {
  const rangeLabel =
    months.length > 1
      ? `${formatMonthDisplay(months[0]!)}–${formatMonthDisplay(months[months.length - 1]!)}`
      : formatMonthDisplay(months[0]!);
  const tooltip = `${titlePrefix} · ${rangeLabel} · ${formatPercent(percentEffort)}${
    projected ? " · Projected" : " · Origin month"
  }${
    unfunded
      ? ` · Account projected dry${dryMonthLabel ? ` from ${dryMonthLabel}` : ""} — this effort has no balance behind it`
      : ""
  }${readOnly ? " · Locked in — unlock this person's distribution to edit" : ""}`;
  const isReversal = percentEffort < 0;
  /**
   * Unfunded months fade further back than merely-projected ones. The account
   * keeps its own hue — that is still how a reader tells rows apart — it just
   * stops looking like funded effort, which is what lets the cliff edge be the
   * loud thing rather than the whole run after it.
   */
  const fill = unfunded
    ? lightenProjectionFill(color, 0.72)
    : projected
      ? lightenProjectionFill(color)
      : color;

  if (!hasPercentEffort(percentEffort)) {
    return (
      <button
        type="button"
        disabled={readOnly}
        className={cn(
          "h-8 w-full",
          readOnly ? "cursor-default" : "cursor-pointer hover:bg-inset",
          projected ? "bg-inset" : "bg-surface",
          // No effort charged, so nothing is unfunded here — but the cliff edge
          // still marks where the account's money ran out.
          dryStart && "allocation-bar--dry-start"
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
      disabled={readOnly}
      onClick={onClick}
      className={cn(
        "allocation-bar allocation-bar-flat flex h-8 w-full items-center justify-center text-center text-[10px] font-medium",
        readOnly && "cursor-default",
        display === "both" && "px-0.5 leading-tight",
        projected ? "text-ink-2" : "text-ink",
        // Muted against the faded fill, so the figure stays readable without
        // competing with the mark that says it is unfunded.
        unfunded && "text-muted",
        isReversal && "allocation-bar--reversal",
        unfunded && "allocation-bar--unfunded",
        dryStart && "allocation-bar--dry-start"
      )}
      style={{ backgroundColor: fill }}
    >
      {label}
    </button>
  );
}
