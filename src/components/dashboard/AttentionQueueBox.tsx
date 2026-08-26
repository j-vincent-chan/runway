"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { CHIP_CLASS, SEVERITY_ICON, stripeClass } from "@/components/dashboard/attentionSeverity";
import type { AttentionQueue, AttentionRow } from "@/lib/dashboard/attention";

function Row({ row }: { row: AttentionRow }) {
  const Icon = SEVERITY_ICON[row.severity];
  return (
    <li className="border-b border-rule last:border-b-0">
      <Link
        href={row.href}
        className="group flex min-h-11 flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-3 hover:bg-inset focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
      >
        <span className="flex min-w-0 flex-1 items-center gap-2.5">
          {/* One width across severities so every row's entity starts at the
              same x — ragged chips turn the list into a zigzag. Sized past the
              widest label ("Critical", 103px) so it actually binds on all three;
              min-, not fixed, so a longer future label grows rather than clips. */}
          <span
            className={cn(
              "type-caption inline-flex min-w-[6.75rem] shrink-0 items-center justify-center gap-1 rounded-sm px-1.5 py-0.5",
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

/**
 * The full queue. The hero verdict above names the weakest *team*; these are
 * the individual people and accounts behind it, so the worst row belongs here
 * rather than being lifted out — nothing is duplicated between the two.
 */
export function AttentionQueueBox({ queue }: { queue: AttentionQueue }) {
  const rows = queue.rows;
  const worst = rows[0]?.severity ?? null;
  const hidden = queue.totalCount - queue.rows.length;

  return (
    <section aria-labelledby="attention-queue-heading">
      <h3 id="attention-queue-heading" className="type-heading text-ink">
        Needs attention
      </h3>
      <div className="mt-2 flex overflow-hidden rounded-md border border-rule bg-surface">
        <div className={cn("w-[3px] shrink-0", stripeClass(worst))} aria-hidden />
        <div className="min-w-0 flex-1">
          <ul>
            {rows.map((row) => (
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
        </div>
      </div>
    </section>
  );
}
