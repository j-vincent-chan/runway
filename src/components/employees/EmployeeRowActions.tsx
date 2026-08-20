"use client";

import { useState, useRef, useEffect } from "react";
import { MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils/cn";

type Action = { label: string; onClick: () => void; destructive?: boolean };

export function EmployeeRowActions({ actions }: { actions: Action[] }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    // Use click (not mousedown) so opening another control (e.g. edit dialog) is not disrupted.
    document.addEventListener("click", close, true);
    return () => document.removeEventListener("click", close, true);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
        aria-label="Employee actions"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && (
        <div
          className="absolute right-0 z-20 mt-1 min-w-[10rem] rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
          onMouseDown={(e) => e.stopPropagation()}
        >
          {actions.map((action) => (
            <button
              key={action.label}
              type="button"
              className={cn(
                "block w-full px-3 py-1.5 text-left text-xs hover:bg-slate-50",
                action.destructive ? "text-red-700" : "text-slate-700"
              )}
              onClick={() => {
                setOpen(false);
                action.onClick();
              }}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
