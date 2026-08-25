"use client";

import Link from "next/link";
import { ArrowRight, CircleAlert, AlertTriangle, CheckCircle2, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import type { Verdict, VerdictStatus } from "@/lib/dashboard/verdict";

const STATUS_ICON = {
  critical: CircleAlert,
  at_risk: AlertTriangle,
  stable: CheckCircle2,
  insufficient_data: HelpCircle,
} as const;

/** Same severity-soft tokens the attention rows use, so the page reads as one system. */
const CHIP_CLASS: Record<VerdictStatus, string> = {
  critical: "bg-critical-soft text-critical",
  at_risk: "bg-caution-soft text-caution",
  stable: "bg-healthy-soft text-healthy",
  insufficient_data: "bg-inset text-ink-2",
};

const ACTION_CLASS: Record<VerdictStatus, string> = {
  critical: "text-critical",
  at_risk: "text-caution",
  stable: "text-healthy",
  insufficient_data: "text-ink-2",
};

/**
 * The page's hero. One sentence: a severity word, the team driving it named
 * with its own runway, and whether money is needed now. It leads with the
 * weakest team rather than a general funded-through date, so the reader gets
 * the specific problem instead of an abstraction they have to go look up.
 */
export function FundingStatusPanel({ verdict }: { verdict: Verdict }) {
  const Icon = STATUS_ICON[verdict.status];

  return (
    <section aria-label="Funding position">
      <span
        className={cn(
          "type-caption inline-flex w-fit items-center gap-1.5 rounded-sm px-2 py-1",
          CHIP_CLASS[verdict.status]
        )}
      >
        <Icon className="h-3.5 w-3.5" aria-hidden />
        {verdict.statusLabel}
      </span>

      <h2 className="type-verdict mt-3 max-w-4xl text-ink-2">
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
