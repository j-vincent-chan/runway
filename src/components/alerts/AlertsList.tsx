"use client";

import Link from "next/link";
import type { AlertItem } from "@/lib/calculations";
import { cn } from "@/lib/utils/cn";

export function AlertsList({
  alerts,
  emptyMessage = "No alerts at current thresholds. Adjust cliff threshold in Settings.",
  className,
}: {
  alerts: AlertItem[];
  emptyMessage?: string;
  className?: string;
}) {
  if (alerts.length === 0) {
    return <p className={cn("text-xs text-slate-500", className)}>{emptyMessage}</p>;
  }

  return (
    <ul className={cn("space-y-2", className)}>
      {alerts.map((a) => (
        <li
          key={a.id}
          className={cn(
            "rounded-lg border p-2 text-xs",
            a.severity === "urgent"
              ? "border-red-200 bg-red-50/50"
              : a.severity === "atRisk"
                ? "border-orange-200 bg-orange-50/40"
                : "border-slate-100 bg-slate-50/50"
          )}
        >
          <div className="flex items-start justify-between gap-1">
            <span className="font-medium uppercase text-slate-500">{a.category}</span>
            <span className="shrink-0 capitalize text-slate-400">{a.severity}</span>
          </div>
          <p className="mt-0.5 font-semibold text-[#0c2340]">{a.title}</p>
          <p className="mt-0.5 text-slate-600">{a.explanation}</p>
          <p className="mt-1 text-teal-800">
            {a.href ? (
              <Link href={a.href} className="font-medium hover:underline">
                {a.action}
              </Link>
            ) : (
              a.action
            )}
          </p>
        </li>
      ))}
    </ul>
  );
}
