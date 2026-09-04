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
    return <p className={cn("text-xs text-muted", className)}>{emptyMessage}</p>;
  }

  return (
    <ul className={cn("space-y-2", className)}>
      {alerts.map((a) => (
        <li
          key={a.id}
          className={cn(
            "rounded-lg border p-2 text-xs",
            a.severity === "urgent"
              ? "border-critical bg-critical-soft/50"
              : a.severity === "atRisk"
                ? "border-caution/40 bg-caution-soft/40"
                : "border-rule bg-inset/50"
          )}
        >
          <div className="flex items-start justify-between gap-1">
            <span className="font-medium uppercase text-muted">{a.category}</span>
            <span className="shrink-0 capitalize text-muted">{a.severity}</span>
          </div>
          <p className="mt-0.5 font-semibold text-ink">{a.title}</p>
          <p className="mt-0.5 text-ink-2">{a.explanation}</p>
          <p className="mt-1 text-accent">
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
