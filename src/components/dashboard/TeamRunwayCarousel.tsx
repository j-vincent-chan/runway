"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DerivedFigure } from "@/components/dashboard/DerivedFigure";
import { CAUTION_MONTHS, CRITICAL_MONTHS } from "@/lib/dashboard/attention";
import {
  RUNWAY_BAR_CAP_MONTHS,
  runwayBarFillPercent,
  runwayMonthsLabel,
} from "@/lib/runway/calculate";
import { ALL_TEAMS_KEY, type TeamRunwayRow } from "@/lib/dashboard/teamRunway";
import { monthLabelLong } from "@/lib/dashboard/month";
import { formatCurrency } from "@/lib/utils/parse";
import { cn } from "@/lib/utils/cn";

type Tone = "neutral" | "caution" | "critical";

function toneFor(months: number | null): Tone {
  if (months === null) return "neutral";
  if (months < CRITICAL_MONTHS) return "critical";
  if (months < CAUTION_MONTHS) return "caution";
  return "neutral";
}

/**
 * Fixed scale across every slide — 0 to RUNWAY_BAR_CAP_MONTHS — so paging
 * between teams compares like with like. A bar that rescaled per slide would
 * make every team look the same length.
 */
function RunwayBar({ months }: { months: number | null }) {
  const tone = toneFor(months);
  return (
    <div className="mt-2.5">
      <span className="block h-1.5 w-full overflow-hidden rounded-full bg-inset ring-1 ring-rule">
        <span
          className={cn(
            "block h-full rounded-full",
            tone === "critical" && "bg-critical",
            tone === "caution" && "bg-caution",
            tone === "neutral" && "bg-accent"
          )}
          style={{ width: `${months === null ? 0 : runwayBarFillPercent(months)}%` }}
        />
      </span>
      <p className="type-mono mt-1 text-muted">0 · {RUNWAY_BAR_CAP_MONTHS} mo scale</p>
    </div>
  );
}

export function TeamRunwayCarousel({
  rows,
  horizonMonths,
  priorRunwayMonths,
  priorReportLabel,
  runwayExplanation,
}: {
  rows: TeamRunwayRow[];
  horizonMonths: number;
  priorRunwayMonths: number | null;
  priorReportLabel: string | null;
  runwayExplanation: string;
}) {
  // Roll-up first: the overall number is the one a ten-second read should land on.
  const all = rows.find((r) => r.key === ALL_TEAMS_KEY);
  const slides = all ? [all, ...rows.filter((r) => r.key !== ALL_TEAMS_KEY)] : rows;
  const [index, setIndex] = useState(0);

  if (slides.length === 0) return null;
  const row = slides[Math.min(index, slides.length - 1)]!;
  const isAll = row.key === ALL_TEAMS_KEY;
  const beyondHorizon = row.months !== null && row.months > horizonMonths;

  const go = (next: number) => setIndex((next + slides.length) % slides.length);

  return (
    <div className="min-w-0 flex-1 px-0 sm:px-5 sm:first:pl-0 sm:last:pr-0">
      {/* The label owns its own full-width row so it wraps to at most two lines
          and clears the same 44px the other two anchors' labels do — otherwise
          the nav squeezes it to three and this column's figure drops out of
          line with theirs. */}
      <Link
        href="/runway"
        className="type-caption flex min-h-11 items-center text-muted hover:text-ink-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        Runway
      </Link>

      {/* aria-live so paging is announced; the figure alone would change silently. */}
      <div aria-live="polite" aria-atomic>
        {/* One mono row — the same context line the other two anchors reserve,
            so all three figures sit on one baseline. Truncates rather than
            wrapping for that reason; the full name is on the link's title. */}
        <p
          className="type-mono min-h-[1.125rem] truncate text-ink-2"
          title={row.label}
        >
          {row.shortLabel}
        </p>

        <p className="type-stat mt-0.5 text-ink">
          {row.months === null ? (
            <span className="text-muted">—</span>
          ) : row.months < 0 ? (
            <DerivedFigure
              projected
              value="Already short"
              explanation={runwayExplanation}
              className="type-stat text-critical"
            />
          ) : (
            <DerivedFigure
              projected
              value={runwayMonthsLabel(row.months)}
              explanation={runwayExplanation}
              className="type-stat text-ink"
            />
          )}
        </p>

        <p
          className={cn(
            // Three lines reserved: the roll-up slide's basis sentence is the
            // longest, and the card must not resize when you page onto it.
            "mt-1 min-h-[3.75rem] type-row",
            toneFor(row.months) === "critical"
              ? "text-critical"
              : toneFor(row.months) === "caution"
                ? "text-caution"
                : "text-muted"
          )}
        >
          {row.months === null ? (
            <>no burn on these accounts</>
          ) : isAll ? (
            <>
              {beyondHorizon ? (
                <>past the {horizonMonths}-month window</>
              ) : row.months < 0 ? (
                <>overdrawn today</>
              ) : row.targetMonth ? (
                <>runs out {monthLabelLong(row.targetMonth)}</>
              ) : null}
              {priorRunwayMonths !== null && priorReportLabel ? (
                <> · was {priorRunwayMonths.toFixed(1)} mo at the {priorReportLabel} report</>
              ) : (
                <> · no prior report to compare</>
              )}
            </>
          ) : (
            <>
              {formatCurrency(row.funds)} over {formatCurrency(row.monthlyBurn)}/mo
              {row.hasEstimatedFunds && <> · includes an estimate</>}
            </>
          )}
        </p>

        <RunwayBar months={row.months} />
      </div>

      {/* Nav sits at the foot of the column, where the other two anchors carry
          their sparklines — the only place a 44px target fits at this width
          without stealing room from the team name or pushing the figure off the
          row's shared baseline. */}
      {slides.length > 1 && (
        <div className="mt-1 flex items-center gap-1">
          <button
            type="button"
            onClick={() => go(index - 1)}
            aria-label="Previous team"
            className="inline-flex h-11 w-11 items-center justify-center text-muted hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </button>
          <span className="type-mono tabular text-muted" aria-hidden>
            {index + 1}/{slides.length}
          </span>
          <button
            type="button"
            onClick={() => go(index + 1)}
            aria-label="Next team"
            className="inline-flex h-11 w-11 items-center justify-center text-muted hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
      )}
    </div>
  );
}
