"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { monthLabelLong } from "@/lib/dashboard/month";
import { CHIP_CLASS, SEVERITY_ICON, SPOTLIGHT_BG_CLASS } from "@/components/dashboard/attentionSeverity";
import type { AttentionQueue } from "@/lib/dashboard/attention";
import type { Verdict, VerdictClause } from "@/lib/dashboard/verdict";

function Clause({
  clause,
  runwayMonth,
}: {
  clause: VerdictClause;
  runwayMonth: string | null;
}) {
  const runwayLabel = runwayMonth ? monthLabelLong(runwayMonth) : null;

  return (
    <span className={clause.tone === "healthy" ? "block text-healthy" : "block"}>
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

/**
 * The page's hero element. When there's a worst item to name, it names it —
 * concretely and unambiguously — rather than a funded-through/past sentence,
 * which can read as contradicting the Runway stat when the horizon caps its
 * date short of the actual projected one. Only falls back to the sentence
 * when there's nothing to spotlight (healthy, beyond horizon with no
 * shortfall, or insufficient data).
 */
export function FundingStatusPanel({
  verdict,
  queue,
}: {
  verdict: Verdict;
  queue: AttentionQueue;
}) {
  const spotlight = queue.rows[0];
  const isAction = !!spotlight && verdict.kind !== "insufficient_data";

  if (!isAction) {
    return (
      <section aria-label="Funding position">
        <h2 className="type-verdict text-ink-2">
          {verdict.clauses.map((clause, i) => (
            <Clause key={i} clause={clause} runwayMonth={verdict.runwayMonth} />
          ))}
        </h2>
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

  const Icon = SEVERITY_ICON[spotlight.severity];

  return (
    <section aria-label="Funding position">
      <Link
        href={spotlight.href}
        className={cn(
          "group flex flex-col gap-2 rounded-md border border-rule px-6 py-5 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent",
          SPOTLIGHT_BG_CLASS[spotlight.severity]
        )}
      >
        <span
          className={cn(
            "type-caption inline-flex w-fit items-center gap-1.5 rounded-sm px-2 py-1",
            CHIP_CLASS[spotlight.severity]
          )}
        >
          <Icon className="h-3.5 w-3.5" aria-hidden />
          {spotlight.severityLabel}
        </span>
        <span className="type-verdict text-ink">{spotlight.entity}</span>
        <span className="type-heading text-ink-2">
          {spotlight.context && <span className="text-muted">{spotlight.context} · </span>}
          {spotlight.detail}
        </span>
        <span className="type-body mt-1 inline-flex w-fit items-center gap-1 font-medium text-accent group-hover:underline">
          {spotlight.actionLabel}
          <ArrowRight className="h-4 w-4" aria-hidden />
        </span>
      </Link>
    </section>
  );
}
