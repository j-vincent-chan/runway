"use client";

import { useId, useState } from "react";
import { cn } from "@/lib/utils/cn";

/**
 * A figure the app worked out rather than read off a report. Carries a dotted
 * underline, a `~` when projected, and explains its own derivation on hover or
 * keyboard focus.
 */
export function DerivedFigure({
  value,
  explanation,
  projected = false,
  className,
}: {
  value: string;
  explanation: string;
  projected?: boolean;
  className?: string;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);

  return (
    <span className="relative inline-block">
      <button
        type="button"
        aria-describedby={open ? id : undefined}
        className={cn(
          "figure-derived rounded-xs text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1",
          className
        )}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
      >
        {projected ? "~" : ""}
        {value}
      </button>
      {open && (
        <span
          role="tooltip"
          id={id}
          className="type-row absolute bottom-full left-0 z-20 mb-1.5 w-64 rounded-md border border-rule bg-surface px-3 py-2 font-normal normal-case tracking-normal text-ink-2 shadow-sm"
        >
          {explanation}
        </span>
      )}
    </span>
  );
}
