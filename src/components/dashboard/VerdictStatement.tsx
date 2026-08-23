"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { DerivedFigure } from "@/components/dashboard/DerivedFigure";
import { monthLabelLong } from "@/lib/dashboard/month";
import { formatCurrency } from "@/lib/utils/parse";
import { cn } from "@/lib/utils/cn";
import type { DashboardOverview } from "@/lib/dashboard/overview";
import type { Verdict } from "@/lib/dashboard/verdict";

function Clause({
  clause,
  runwayMonth,
}: {
  clause: Verdict["clauses"][number];
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

export function VerdictStatement({
  verdict,
  overview,
}: {
  verdict: Verdict;
  overview: DashboardOverview;
}) {
  const burnBasis =
    overview.burnMonthsUsed === 1
      ? "the one payroll month on file"
      : `the last ${overview.burnMonthsUsed} payroll months`;

  return (
    <section aria-label="Funding position">
      <h2 className="type-verdict text-ink-2">
        {verdict.clauses.map((clause, i) => (
          <Clause key={i} clause={clause} runwayMonth={verdict.runwayMonth} />
        ))}
      </h2>

      {verdict.missing ? (
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
      ) : (
        <p className="type-mono mt-4 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-muted">
          <span>
            <DerivedFigure
              value={formatCurrency(overview.availableFunds)}
              explanation={`Sum of the listed balance on all ${overview.accountCount} accounts you track on Account Balances, excluding any you have hidden.`}
            />{" "}
            available across {overview.accountCount}{" "}
            {overview.accountCount === 1 ? "account" : "accounts"}
          </span>
          <span aria-hidden>·</span>
          <span>
            <DerivedFigure
              value={`${formatCurrency(overview.monthlyBurn)}/mo`}
              explanation={`Average total personnel cost — salary and benefits — across ${burnBasis}.`}
            />{" "}
            trailing {overview.burnMonthsUsed}-month burn
          </span>
          {overview.runwayMonths !== null && (
            <>
              <span aria-hidden>·</span>
              <span>
                <DerivedFigure
                  projected
                  value={`${overview.runwayMonths.toFixed(1)} months`}
                  explanation="Available funds divided by the trailing monthly burn. It assumes spending continues at today's rate and that no new awards land."
                />{" "}
                of runway
              </span>
            </>
          )}
        </p>
      )}
    </section>
  );
}
