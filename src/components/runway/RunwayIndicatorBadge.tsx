"use client";

import { cn } from "@/lib/utils/cn";
import { Link2, PencilLine, Landmark } from "lucide-react";

export type RunwayIndicatorVariant =
  | "linked"
  | "manual"
  | "report"
  | "missing"
  | "assumedOk"
  | "estimated";

const STYLES: Record<RunwayIndicatorVariant, string> = {
  linked: "bg-linked-soft text-linked",
  manual: "bg-accent-soft text-accent",
  report: "bg-inset text-ink-2",
  missing: "bg-caution-soft text-caution",
  assumedOk: "bg-inset text-ink-2",
  estimated: "bg-estimated-soft text-estimated",
};

export function RunwayIndicatorBadge({
  variant,
  children,
  className,
  title,
}: {
  variant: RunwayIndicatorVariant;
  children: React.ReactNode;
  className?: string;
  title?: string;
}) {
  const Icon =
    variant === "linked"
      ? Link2
      : variant === "manual"
        ? PencilLine
        : variant === "assumedOk"
          ? Landmark
          : null;

  return (
    <span
      title={title}
      className={cn(
        "inline-flex max-w-full items-center justify-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium leading-none",
        STYLES[variant],
        className
      )}
    >
      {Icon && <Icon className="h-3 w-3 shrink-0 opacity-80" aria-hidden />}
      <span className="truncate">{children}</span>
    </span>
  );
}

export function RunwayIndicatorLegend() {
  return (
    <div
      className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-rule bg-inset/80 px-3 py-2 text-[10px] text-ink-2"
      role="note"
    >
      <span className="font-medium text-muted">Legend</span>
      <RunwayIndicatorBadge variant="linked" title="Shared account — runway uses combined burn">
        Linked
      </RunwayIndicatorBadge>
      <RunwayIndicatorBadge variant="manual" title="Manual override">
        Manual
      </RunwayIndicatorBadge>
      <RunwayIndicatorBadge variant="report" title="Balance from the latest Net Position Report">
        Report
      </RunwayIndicatorBadge>
      <RunwayIndicatorBadge variant="missing">Missing balance</RunwayIndicatorBadge>
      <RunwayIndicatorBadge variant="assumedOk" title="Not your account">
        External
      </RunwayIndicatorBadge>
      <RunwayIndicatorBadge variant="estimated" title="From estimated end date">
        Estimated
      </RunwayIndicatorBadge>
    </div>
  );
}
