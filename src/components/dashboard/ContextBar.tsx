"use client";

import Link from "next/link";
import type { ImportContext } from "@/lib/dashboard/importContext";

/**
 * Runway ÷ burn is a division, not a trend read off historical periods, so
 * (unlike the funding-mix averaging windows) no window here outruns the data.
 *
 * The longest option must stay within MAX_PROJECTION_MONTHS: `monthsInclusive`
 * stops at that ceiling without complaint, so a longer option here would
 * quietly render a shorter window than the one the reader picked.
 */
const HORIZON_OPTIONS = [6, 12, 24, 48] as const;

export function ContextBar({
  context,
  horizonMonths,
  onHorizonChange,
}: {
  context: ImportContext;
  horizonMonths: number;
  onHorizonChange: (months: number) => void;
}) {
  return (
    <div className="mt-2 flex min-h-8 flex-wrap items-center justify-between gap-x-4 gap-y-1 border-b border-rule pb-2">
      <p className="type-mono flex flex-wrap items-center gap-x-1.5 text-muted">
        <span>{context.periodLabel}</span>
        <span aria-hidden>·</span>
        <span className={context.closed ? undefined : "text-caution"}>
          {context.closed ? "closed" : "in progress"}
        </span>
        <span aria-hidden>·</span>
        <span>Imported {context.importedAtLabel}</span>
        {context.syncLabel && (
          <>
            <span aria-hidden>·</span>
            <span>{context.syncLabel}</span>
          </>
        )}
        <span aria-hidden>·</span>
        <Link
          href="/upload"
          className="text-accent underline underline-offset-4 hover:no-underline focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          {context.sourceFileName}
        </Link>
      </p>
      <label className="flex items-center gap-1.5">
        <span className="sr-only">Scope this page to</span>
        <select
          value={horizonMonths}
          onChange={(e) => onHorizonChange(Number(e.target.value))}
          className="type-mono min-h-11 rounded-md border border-rule bg-surface px-2 text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          {HORIZON_OPTIONS.map((months) => (
            <option key={months} value={months}>
              Next {months} months
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
