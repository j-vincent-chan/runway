"use client";

import Link from "next/link";
import { AlertTriangle, ArrowRight, CircleAlert, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { AttentionQueue, AttentionRow, AttentionSeverity } from "@/lib/dashboard/attention";

const SEVERITY_ICON = {
  critical: CircleAlert,
  caution: AlertTriangle,
  data: HelpCircle,
} as const;

const CHIP_CLASS: Record<AttentionSeverity, string> = {
  critical: "bg-critical-soft text-critical",
  caution: "bg-caution-soft text-caution",
  data: "bg-inset text-ink-2",
};

/** The block's left edge takes the worst severity in the queue. */
function stripeClass(severity: AttentionSeverity | null): string {
  if (severity === "critical") return "bg-critical";
  if (severity === "caution") return "bg-caution";
  if (severity === "data") return "bg-rule-strong";
  return "bg-healthy";
}

function Row({ row }: { row: AttentionRow }) {
  const Icon = SEVERITY_ICON[row.severity];

  return (
    <li className="border-b border-rule last:border-b-0">
      <Link
        href={row.href}
        className="group flex min-h-11 flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-3 hover:bg-inset focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
      >
        <span className="flex min-w-0 flex-1 items-center gap-2.5">
          <span
            className={cn(
              "type-caption inline-flex shrink-0 items-center gap-1 rounded-sm px-1.5 py-0.5",
              CHIP_CLASS[row.severity]
            )}
          >
            <Icon className="h-3 w-3" aria-hidden />
            {row.severityLabel}
          </span>
          <span className="type-row min-w-0 flex-1 text-ink">
            <span className="font-medium">{row.entity}</span>
            {row.context && <span className="text-muted"> · {row.context}</span>}
            <span className="text-ink-2"> · {row.detail}</span>
          </span>
        </span>
        <span className="type-row inline-flex shrink-0 items-center gap-1 font-medium text-accent group-hover:underline">
          {row.actionLabel}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </span>
      </Link>
    </li>
  );
}

export function NeedsAttention({
  queue,
  scopeMonths,
}: {
  queue: AttentionQueue;
  scopeMonths: number;
}) {
  const worst = queue.rows[0]?.severity ?? null;
  const hidden = queue.totalCount - queue.rows.length;

  return (
    <section aria-labelledby="needs-attention-heading">
      <h2 id="needs-attention-heading" className="type-caption text-muted">
        Needs attention
      </h2>
      <div className="mt-2 flex overflow-hidden rounded-md border border-rule bg-surface">
        <div className={cn("w-[3px] shrink-0", stripeClass(worst))} aria-hidden />
        <div className="min-w-0 flex-1">
          {queue.rows.length === 0 ? (
            <p className="type-row px-4 py-4 text-healthy">
              No funding gaps in the next {scopeMonths} months.
            </p>
          ) : (
            <>
              <ul>
                {queue.rows.map((row) => (
                  <Row key={row.id} row={row} />
                ))}
              </ul>
              {hidden > 0 && (
                <Link
                  href="/runway"
                  className="type-row flex min-h-11 items-center gap-1 border-t border-rule px-4 py-2 font-medium text-accent hover:bg-inset hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
                >
                  View all {queue.totalCount}
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden />
                </Link>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
