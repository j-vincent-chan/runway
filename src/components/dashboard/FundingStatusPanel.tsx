"use client";

import Link from "next/link";
import { AlertTriangle, ArrowRight, CircleAlert, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { monthLabelLong } from "@/lib/dashboard/month";
import type { AttentionQueue, AttentionRow, AttentionSeverity } from "@/lib/dashboard/attention";
import type { Verdict, VerdictClause } from "@/lib/dashboard/verdict";

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

/** Spotlight row background — a stronger tint of the same severity-soft token. */
const SPOTLIGHT_BG_CLASS: Record<AttentionSeverity, string> = {
  critical: "bg-critical-soft",
  caution: "bg-caution-soft",
  data: "bg-inset",
};

/** The block's left edge takes the worst severity in the queue. */
function stripeClass(severity: AttentionSeverity | null): string {
  if (severity === "critical") return "bg-critical";
  if (severity === "caution") return "bg-caution";
  if (severity === "data") return "bg-rule-strong";
  return "bg-healthy";
}

function Clause({
  clause,
  runwayMonth,
}: {
  clause: VerdictClause;
  runwayMonth: string | null;
}) {
  const runwayLabel = runwayMonth ? monthLabelLong(runwayMonth) : null;

  return (
    <span className={cn("block", clause.tone === "healthy" && "text-healthy")}>
      {clause.segments.map((segment, i) => {
        if (clause.tone === "healthy") return <span key={i}>{segment.text}</span>;

        if (segment.emphasis === "data" && runwayLabel && segment.text === runwayLabel) {
          return (
            <Link
              key={i}
              href="/runway"
              className="text-ink underline decoration-rule-strong underline-offset-4 hover:decoration-accent focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              {segment.text}
            </Link>
          );
        }

        return (
          <span key={i} className={segment.emphasis === "data" ? "text-ink" : "text-ink-2"}>
            {segment.text}
          </span>
        );
      })}
    </span>
  );
}

function NormalRow({ row }: { row: AttentionRow }) {
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

/** The worst item, enlarged so it reads as spotlighted rather than an accident of CSS. */
function SpotlightRow({ row }: { row: AttentionRow }) {
  const Icon = SEVERITY_ICON[row.severity];
  return (
    <li className={cn("border-b border-rule", SPOTLIGHT_BG_CLASS[row.severity])}>
      <Link
        href={row.href}
        className="group flex flex-col gap-1.5 px-4 py-4 hover:brightness-[0.98] focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent"
      >
        <span
          className={cn(
            "type-caption inline-flex w-fit items-center gap-1 rounded-sm px-1.5 py-0.5",
            CHIP_CLASS[row.severity]
          )}
        >
          <Icon className="h-3 w-3" aria-hidden />
          {row.severityLabel}
        </span>
        <span className="type-stat text-ink">{row.entity}</span>
        <span className="type-body text-ink-2">
          {row.context && <span className="text-muted">{row.context} · </span>}
          {row.detail}
        </span>
        <span className="type-row mt-1 inline-flex w-fit items-center gap-1 font-medium text-accent group-hover:underline">
          {row.actionLabel}
          <ArrowRight className="h-3.5 w-3.5" aria-hidden />
        </span>
      </Link>
    </li>
  );
}

export function FundingStatusPanel({
  verdict,
  queue,
}: {
  verdict: Verdict;
  queue: AttentionQueue;
}) {
  const isAction = queue.rows.length > 0 && verdict.kind !== "insufficient_data";

  const heading = (
    <h2 className={isAction ? "type-heading text-ink-2" : "type-verdict text-ink-2"}>
      {verdict.clauses.map((clause, i) => (
        <Clause key={i} clause={clause} runwayMonth={verdict.runwayMonth} />
      ))}
    </h2>
  );

  if (verdict.kind === "insufficient_data") {
    return (
      <section aria-label="Funding position">
        {heading}
        {verdict.missing && (
          <p className="type-body mt-4 max-w-2xl text-ink-2">
            {verdict.missing.message}{" "}
            <Link
              href={verdict.missing.href}
              className="inline-flex items-center gap-1 font-medium text-accent underline underline-offset-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              {verdict.missing.hrefLabel}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </p>
        )}
      </section>
    );
  }

  if (!isAction) {
    return <section aria-label="Funding position">{heading}</section>;
  }

  const [spotlight, ...rest] = queue.rows;
  const worst = spotlight?.severity ?? null;
  const hidden = queue.totalCount - queue.rows.length;

  return (
    <section aria-label="Funding position">
      {heading}
      <div className="mt-3 flex overflow-hidden rounded-md border border-rule bg-surface">
        <div className={cn("w-[3px] shrink-0", stripeClass(worst))} aria-hidden />
        <div className="min-w-0 flex-1">
          <ul>
            {spotlight && <SpotlightRow row={spotlight} />}
            {rest.map((row) => (
              <NormalRow key={row.id} row={row} />
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
