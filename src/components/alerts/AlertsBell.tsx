"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { generateAlerts } from "@/lib/calculations";
import { AlertsList } from "@/components/alerts/AlertsList";
import { cn } from "@/lib/utils/cn";

export function AlertsBell() {
  const { snapshot, allocations, settings } = useApp();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const alerts = useMemo(
    () => (snapshot ? generateAlerts(snapshot, allocations, settings) : []),
    [snapshot, allocations, settings]
  );

  const badgeCount = alerts.filter((a) => a.severity !== "info").length;

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        className={cn(
          "relative rounded-lg border p-2 text-slate-600 hover:bg-slate-50",
          open && "border-teal-300 bg-teal-50/50"
        )}
        aria-label="Gaps and alerts"
        aria-expanded={open}
        aria-haspopup="dialog"
        onClick={() => setOpen((v) => !v)}
      >
        <Bell className="h-5 w-5" />
        {badgeCount > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] text-white">
            {badgeCount > 9 ? "9+" : badgeCount}
          </span>
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Gaps and alerts"
          className="absolute right-0 z-50 mt-2 w-[min(24rem,calc(100vw-2rem))] rounded-xl border border-slate-200 bg-white p-4 shadow-lg"
        >
          <div className="mb-3 flex items-start justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold text-[#0c2340]">Gaps &amp; alerts</h2>
              <p className="text-[10px] text-slate-500">Coverage gaps, cliffs, and data issues</p>
            </div>
            <button
              type="button"
              className="text-xs text-slate-500 hover:text-slate-800"
              onClick={() => setOpen(false)}
            >
              Close
            </button>
          </div>

          {!snapshot ? (
            <p className="text-xs text-slate-500">Upload a Payroll Funding Report to see alerts in Runway.</p>
          ) : (
            <AlertsList alerts={alerts} className="max-h-80 overflow-y-auto" />
          )}

          {snapshot && (
            <Link
              href="/timeline"
              className="mt-3 block text-center text-xs font-medium text-teal-800 hover:underline"
              onClick={() => setOpen(false)}
            >
              Open timeline for full view
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
