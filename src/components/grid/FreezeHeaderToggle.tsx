"use client";

import { Pin, PinOff } from "lucide-react";
import { cn } from "@/lib/utils/cn";

export function FreezeHeaderToggle({
  frozen,
  onChange,
}: {
  frozen: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!frozen)}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors",
        frozen
          ? "bg-accent-soft text-accent ring-1 ring-accent"
          : "bg-surface text-ink-2 ring-1 ring-rule hover:bg-inset"
      )}
      title={
        frozen
          ? "Year and month headers stay visible while you scroll"
          : "Scroll year and month headers with the table"
      }
      aria-pressed={frozen}
    >
      {frozen ? <Pin className="h-3.5 w-3.5" /> : <PinOff className="h-3.5 w-3.5" />}
      Freeze header
    </button>
  );
}
