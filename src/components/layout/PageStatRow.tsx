"use client";

import { cn } from "@/lib/utils/cn";

/**
 * The one stat row for every page but the Dashboard, whose AnchorStats adds
 * sparklines, deltas and links on top of the same shape.
 *
 * Six treatments existed before this: hairline-separated on the Dashboard,
 * bordered cards on Distributions and Projections, inline mono pairs on
 * Account Balances, a sentence on Status, a right-rail list on Upload, and
 * nothing on Runway or Employees. The design system is explicit that sections
 * are separated by whitespace and a hairline rather than card chrome, and that
 * card chrome belongs to discrete objects — one person, one account, one alert.
 *
 * Every figure is larger than its own label, figures are tabular, and each
 * basis line states what the number is measured over, in words.
 */
export function PageStatRow({
  stats,
  className,
}: {
  stats: {
    label: string;
    value: string;
    /** What the figure is measured over — roster scope, month, or period. */
    basis?: string;
    tone?: "neutral" | "caution" | "critical";
  }[];
  className?: string;
}) {
  if (stats.length === 0) return null;

  return (
    <section
      aria-label="Summary"
      className={cn(
        "flex flex-col divide-y divide-rule sm:flex-row sm:divide-x sm:divide-y-0",
        className
      )}
    >
      {stats.map((stat) => (
        <div
          key={stat.label}
          className="min-w-0 flex-1 py-2 sm:px-5 sm:py-0 sm:first:pl-0 sm:last:pr-0"
        >
          <p className="text-[11.5px] font-medium uppercase tracking-[0.11em] text-muted">
            {stat.label}
          </p>
          <p
            className={cn(
              "mt-1 text-[26px] font-medium leading-8 tabular-nums",
              stat.tone === "critical"
                ? "text-critical"
                : stat.tone === "caution"
                  ? "text-caution"
                  : "text-ink"
            )}
          >
            {stat.value}
          </p>
          {stat.basis && (
            <p className="mt-0.5 text-[11.5px] text-muted">{stat.basis}</p>
          )}
        </div>
      ))}
    </section>
  );
}
