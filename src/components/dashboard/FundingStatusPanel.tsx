"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { Verdict, VerdictStatus } from "@/lib/dashboard/verdict";

const ACTION_CLASS: Record<VerdictStatus, string> = {
  critical: "text-critical",
  at_risk: "text-caution",
  stable: "text-healthy",
  insufficient_data: "text-ink-2",
};

/**
 * The page's hero: the portfolio's position, then whatever threatens it, in
 * one sentence — severity is stated in its own words ("are critical", "need
 * attention within 6 months"), not carried by a separate chip. A chip reading
 * CRITICAL above a sentence opening "Payroll is broadly healthy" asserted two
 * different things at once: the portfolio's own state and the worst detail
 * inside it can differ on purpose, and a single badge can't hold both without
 * reading as a contradiction. verdict.statusLabel still exists for
 * aria-labelling and tests.
 */
export function FundingStatusPanel({ verdict }: { verdict: Verdict }) {
  return (
    <section aria-label="Funding position" aria-describedby="verdict-status">
      <span id="verdict-status" className="sr-only">
        {verdict.statusLabel}
      </span>

      <h2 className="type-verdict max-w-4xl text-ink-2">
        {verdict.finding.segments.map((segment, i) => {
          if (segment.href) {
            return (
              <Link
                key={i}
                href={segment.href}
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
      </h2>

      {verdict.action && (
        <p className={cn("type-body mt-2 font-medium", ACTION_CLASS[verdict.status])}>
          {verdict.action}
        </p>
      )}

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
