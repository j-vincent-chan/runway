"use client";

import Link from "next/link";
import { EmployeeAvatar } from "@/components/employees/EmployeeAvatar";
import { ALL_TEAMS_KEY, type TeamRunwayRow } from "@/lib/dashboard/teamRunway";
import { CAUTION_MONTHS, CRITICAL_MONTHS } from "@/lib/dashboard/attention";
import { RUNWAY_BAR_CAP_MONTHS, runwayBarFillPercent } from "@/lib/runway/calculate";
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

function RunwayCell({ row }: { row: TeamRunwayRow }) {
  const tone = toneFor(row.months);
  if (row.months === null) {
    return <span className="type-row text-muted">No burn on these accounts</span>;
  }
  const beyondCap = row.months > RUNWAY_BAR_CAP_MONTHS;
  return (
    <div className="flex items-center justify-end gap-3">
      <span
        aria-hidden
        className="hidden h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-inset ring-1 ring-rule sm:block"
      >
        <span
          className={cn(
            "block h-full rounded-full",
            tone === "critical" && "bg-critical",
            tone === "caution" && "bg-caution",
            tone === "neutral" && "bg-accent"
          )}
          style={{ width: `${runwayBarFillPercent(row.months)}%` }}
        />
      </span>
      <span
        className={cn(
          "type-row w-24 shrink-0 text-right tabular font-medium",
          tone === "critical" && "text-critical",
          tone === "caution" && "text-caution",
          tone === "neutral" && "text-ink"
        )}
      >
        {row.months < 0
          ? "Already short"
          : beyondCap
            ? `~${RUNWAY_BAR_CAP_MONTHS}+ mo`
            : `~${row.months.toFixed(1)} mo`}
      </span>
    </div>
  );
}

function Row({ row, isTotal }: { row: TeamRunwayRow; isTotal: boolean }) {
  return (
    <tbody className={cn(isTotal ? "border-t border-rule-strong" : "border-b border-rule")}>
      <tr>
        <th
          scope="row"
          className={cn(
            "py-2.5 pr-4 text-left align-top type-row font-medium",
            isTotal ? "text-ink" : "text-ink-2"
          )}
        >
          {row.label}
          <span className="type-mono ml-2 font-normal text-muted">
            {row.memberCount} {row.memberCount === 1 ? "person" : "people"}
          </span>
          {row.hasEstimatedFunds && (
            <span className="type-mono ml-2 rounded-xs border border-rule px-1.5 py-0.5 font-normal text-muted">
              incl. estimate
            </span>
          )}
        </th>
        <td className="py-2.5 pr-4 text-right align-top type-row tabular text-ink">
          {formatCurrency(row.funds)}
        </td>
        <td className="py-2.5 pr-4 text-right align-top type-row tabular text-ink-2">
          {formatCurrency(row.monthlyBurn)}
        </td>
        <td className="py-2.5 text-right align-top">
          <RunwayCell row={row} />
        </td>
      </tr>
      {/* Suppressed on the total row: the soonest person overall is already the
          attention queue's first item, and repeating it here is the duplication
          the previous "shortest runway" stat was faulted for. */}
      {row.firstShort && !isTotal && (
        <tr>
          <td colSpan={4} className="pb-2.5">
            <p
              className={cn(
                "type-row flex items-center gap-1.5",
                toneFor(row.firstShort.months) === "critical" ? "text-critical" : "text-caution"
              )}
            >
              <span aria-hidden>
                <EmployeeAvatar
                  name={row.firstShort.name}
                  photoUrl={row.firstShort.photoUrl ?? undefined}
                  size="xs"
                />
              </span>
              <span className="min-w-0">
                {row.firstShort.months < 1 ? (
                  <>{row.firstShort.name} is already short</>
                ) : (
                  <>
                    {row.firstShort.name} runs short {monthLabelLong(row.firstShort.month)}, sooner
                    than the team as a whole
                  </>
                )}
              </span>
            </p>
          </td>
        </tr>
      )}
    </tbody>
  );
}

/**
 * Runway per team, with the whole-roster figure as the closing total row.
 * Renders nothing when no team has been set up — the Runway anchor stat
 * already carries that single number.
 */
export function TeamRunwaySection({ rows }: { rows: TeamRunwayRow[] }) {
  const teams = rows.filter((r) => r.key !== ALL_TEAMS_KEY);
  const total = rows.find((r) => r.key === ALL_TEAMS_KEY);
  if (teams.length < 2 || !total) return null;

  return (
    <section aria-label="Runway by team" className="border-t border-rule pt-6">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="type-heading text-ink">Runway by team</h2>
        <Link
          href="/runway"
          className="type-mono inline-flex min-h-11 items-center text-accent hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          Per person
        </Link>
      </div>
      <p className="type-row mt-1 max-w-prose text-muted">
        Each team&rsquo;s funds over the burn on those same accounts. An account two teams share
        counts its full cost against both, so a shared account reads as shorter, never longer.
      </p>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[34rem] border-collapse">
          <thead>
            <tr className="border-b border-rule">
              <th scope="col" className="type-caption pb-2 pr-4 text-left font-normal text-muted">
                Team
              </th>
              <th scope="col" className="type-caption pb-2 pr-4 text-right font-normal text-muted">
                Funds
              </th>
              <th
                scope="col"
                className="type-caption whitespace-nowrap pb-2 pr-4 text-right font-normal text-muted"
              >
                Burn/mo
              </th>
              <th scope="col" className="type-caption pb-2 text-right font-normal text-muted">
                Runway
              </th>
            </tr>
          </thead>
          {teams.map((row) => (
            <Row key={row.key} row={row} isTotal={false} />
          ))}
          <Row key={total.key} row={total} isTotal />
        </table>
      </div>
    </section>
  );
}
