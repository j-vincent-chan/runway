"use client";

import Link from "next/link";
import { CAUTION_MONTHS, CRITICAL_MONTHS } from "@/lib/dashboard/attention";
import {
  RUNWAY_BAR_CAP_MONTHS,
  runwayBarFillPercent,
  runwayMonthsLabel,
} from "@/lib/runway/calculate";
import { ALL_TEAMS_KEY, type TeamRunwayRow } from "@/lib/dashboard/teamRunway";
import { formatCurrency } from "@/lib/utils/parse";
import { cn } from "@/lib/utils/cn";

type Tone = "neutral" | "caution" | "critical";

function toneFor(months: number | null): Tone {
  if (months === null) return "neutral";
  if (months < CRITICAL_MONTHS) return "critical";
  if (months < CAUTION_MONTHS) return "caution";
  return "neutral";
}

/** Fixed 0–RUNWAY_BAR_CAP_MONTHS scale so rows compare like with like. */
function RunwayBar({ months }: { months: number | null }) {
  const tone = toneFor(months);
  return (
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
  );
}

/**
 * Per-team runway, weakest first.
 *
 * This used to page through the anchor stat, which meant one member of a
 * three-stat row changed its subject on click and showed whatever the last
 * reader left it on. A table states every team at once, and sorting ascending
 * puts the team that needs attention first by construction rather than by
 * where someone stopped clicking.
 *
 * Teams with no burn cannot be ranked, so they sort last and say so instead of
 * rendering as zero.
 */
export function TeamRunwayTable({ rows }: { rows: TeamRunwayRow[] | null }) {
  if (!rows) return null;
  const teams = rows.filter((r) => r.key !== ALL_TEAMS_KEY);
  if (teams.length < 2) return null;

  const sorted = [...teams].sort((a, b) => {
    if (a.months === null && b.months === null) return a.label.localeCompare(b.label);
    if (a.months === null) return 1;
    if (b.months === null) return -1;
    return a.months - b.months;
  });

  return (
    <section aria-label="Payroll runway by team">
      <h2 className="type-caption text-muted">Payroll runway, by team</h2>
      <p className="type-mono mt-1 text-muted">
        Team funds over team burn, weakest first. An average — a member can run dry sooner.
      </p>
      <div className="mt-3 overflow-x-auto">
        <table className="min-w-full border-collapse text-left">
          <thead>
            <tr className="border-b border-rule-strong">
              <th className="type-caption py-2 pr-4 font-normal text-muted">Team</th>
              <th className="type-caption py-2 pr-4 text-right font-normal text-muted">People</th>
              <th className="type-caption py-2 pr-4 text-right font-normal text-muted">Funds</th>
              <th className="type-caption py-2 pr-4 text-right font-normal text-muted">Burn/mo</th>
              <th className="type-caption w-[38%] py-2 text-right font-normal text-muted">
                Avg runway
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => {
              const tone = toneFor(row.months);
              return (
                <tr key={row.key} className="border-b border-rule">
                  <td className="type-row max-w-[14rem] truncate py-2 pr-4 text-ink" title={row.label}>
                    <Link
                      href="/runway"
                      className="hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      {row.shortLabel}
                    </Link>
                  </td>
                  <td className="type-row py-2 pr-4 text-right tabular text-ink-2">
                    {row.memberCount}
                  </td>
                  <td className="type-row py-2 pr-4 text-right tabular text-ink-2">
                    {formatCurrency(row.funds)}
                    {row.hasEstimatedFunds && (
                      <span className="type-mono ml-1 text-muted" title="Includes an estimated balance">
                        est.
                      </span>
                    )}
                  </td>
                  <td className="type-row py-2 pr-4 text-right tabular text-ink-2">
                    {formatCurrency(row.monthlyBurn)}
                  </td>
                  <td className="py-2">
                    <div className="flex items-center justify-end gap-3">
                      <span className="w-full max-w-[8rem]">
                        <RunwayBar months={row.months} />
                      </span>
                      <span
                        className={cn(
                          "type-row w-[6.5rem] shrink-0 text-right tabular",
                          tone === "critical"
                            ? "text-critical"
                            : tone === "caution"
                              ? "text-caution"
                              : "text-ink"
                        )}
                      >
                        {row.months === null ? (
                          <span className="text-muted">no burn</span>
                        ) : row.months < 0 ? (
                          "Already short"
                        ) : (
                          <>~{runwayMonthsLabel(row.months)}</>
                        )}
                      </span>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="type-mono mt-2 text-muted">0 · {RUNWAY_BAR_CAP_MONTHS} mo bar scale</p>
    </section>
  );
}
