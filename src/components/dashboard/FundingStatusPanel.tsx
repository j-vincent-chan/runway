"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { monthLabelLong } from "@/lib/dashboard/month";
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

/** The verdict sentence — always full width, always the page's dominant element. */
export function FundingStatusPanel({ verdict }: { verdict: Verdict }) {
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
