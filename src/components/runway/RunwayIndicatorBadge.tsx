"use client";

import { cn } from "@/lib/utils/cn";
import { Link2, PencilLine, ShieldCheck } from "lucide-react";

export type RunwayIndicatorVariant =
  | "linked"
  | "manual"
  | "portfolio"
  | "missing"
  | "assumedOk"
  | "estimated";

const STYLES: Record<RunwayIndicatorVariant, string> = {
  linked: "bg-violet-50 text-violet-700",
  manual: "bg-teal-50 text-teal-700",
  portfolio: "bg-slate-100 text-slate-600",
  missing: "bg-amber-50 text-amber-800",
  assumedOk: "bg-slate-100 text-slate-600",
  estimated: "bg-sky-50 text-sky-700",
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
          ? ShieldCheck
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
      className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2 text-[10px] text-slate-600"
      role="note"
    >
      <span className="font-medium text-slate-500">Legend</span>
      <RunwayIndicatorBadge variant="linked" title="Shared account — runway uses combined burn">
        Linked
      </RunwayIndicatorBadge>
      <RunwayIndicatorBadge variant="manual" title="Manual override">
        Manual
      </RunwayIndicatorBadge>
      <RunwayIndicatorBadge variant="portfolio">Portfolio</RunwayIndicatorBadge>
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
