"use client";

import Link from "next/link";
import { Area, AreaChart, Bar, BarChart, Cell, Line, ReferenceLine } from "recharts";
import { ChartResponsive } from "@/components/charts/ChartResponsive";
import { DerivedFigure } from "@/components/dashboard/DerivedFigure";
import { monthLabelLong } from "@/lib/dashboard/month";
import { formatCurrency } from "@/lib/utils/parse";
import { cn } from "@/lib/utils/cn";
import { CAUTION_MONTHS, CRITICAL_MONTHS } from "@/lib/dashboard/attention";
import { TeamRunwayCarousel } from "@/components/dashboard/TeamRunwayCarousel";
import { ALL_TEAMS_KEY, type TeamRunwayRow } from "@/lib/dashboard/teamRunway";
import { runwayMonthsLabel } from "@/lib/runway/calculate";
import type { DashboardOverview, SparkPoint } from "@/lib/dashboard/overview";

const SPARK_HEIGHT = 34;

type SparkRow = SparkPoint & { endpoint: number | null };

function withEndpoint(points: SparkPoint[]): SparkRow[] {
  const last = points.length - 1;
  return points.map((p, i) => ({ ...p, endpoint: i === last ? p.value : null }));
}

function LineSpark({ points, label }: { points: SparkPoint[]; label: string }) {
  if (points.length < 2) return <SparkPlaceholder />;
  const data = withEndpoint(points);
  return (
    <div role="img" aria-label={label}>
      <ChartResponsive height={SPARK_HEIGHT} className="mt-2">
      <AreaChart data={data} margin={{ top: 3, right: 3, bottom: 0, left: 0 }}>
        <Area
          type="monotone"
          dataKey="value"
          stroke="var(--accent)"
          strokeWidth={1.5}
          fill="var(--accent)"
          fillOpacity={0.1}
          dot={false}
          isAnimationActive={false}
        />
        <Line
          type="monotone"
          dataKey="endpoint"
          stroke="none"
          dot={{ r: 2.75, fill: "var(--accent)", strokeWidth: 0 }}
          isAnimationActive={false}
        />
      </AreaChart>
      </ChartResponsive>
    </div>
  );
}

/**
 * Balance history of the account that runs dry soonest — a zero line so a
 * crossing into deficit is visible, and the line/endpoint turn critical when
 * the current balance is already negative.
 */
function BalanceSpark({ points, label }: { points: SparkPoint[]; label: string }) {
  if (points.length < 2) return <SparkPlaceholder />;
  const data = withEndpoint(points);
  const negative = points[points.length - 1]!.value < 0;
  const color = negative ? "var(--critical)" : "var(--accent)";
  return (
    <div role="img" aria-label={label}>
      <ChartResponsive height={SPARK_HEIGHT} className="mt-2">
        <AreaChart data={data} margin={{ top: 3, right: 3, bottom: 0, left: 0 }}>
          <ReferenceLine y={0} stroke="var(--rule-strong)" strokeDasharray="2 2" />
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={1.5}
            fill={color}
            fillOpacity={0.1}
            dot={false}
            isAnimationActive={false}
          />
          <Line
            type="monotone"
            dataKey="endpoint"
            stroke="none"
            dot={{ r: 2.75, fill: color, strokeWidth: 0 }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ChartResponsive>
    </div>
  );
}

function BarSpark({ points, label }: { points: SparkPoint[]; label: string }) {
  if (points.length < 2) return <SparkPlaceholder />;
  const last = points.length - 1;
  return (
    <div role="img" aria-label={label}>
      <ChartResponsive height={SPARK_HEIGHT} className="mt-2">
        <BarChart data={points} margin={{ top: 3, right: 3, bottom: 0, left: 0 }}>
          <Bar dataKey="value" isAnimationActive={false} radius={[1, 1, 0, 0]}>
            {points.map((point, i) => (
              <Cell key={point.key} fill="var(--accent)" fillOpacity={i === last ? 1 : 0.28} />
            ))}
          </Bar>
        </BarChart>
      </ChartResponsive>
    </div>
  );
}

function SparkPlaceholder() {
  return (
    <p className="type-mono mt-2 flex h-[34px] items-end text-muted">
      Not enough history yet
    </p>
  );
}

function Anchor({
  label,
  href,
  value,
  valueNode,
  comparison,
  comparisonTone = "neutral",
  spark,
}: {
  label: string;
  href: string;
  value?: string;
  valueNode?: React.ReactNode;
  comparison: React.ReactNode;
  comparisonTone?: "neutral" | "caution" | "critical" | "healthy";
  spark?: React.ReactNode;
}) {
  return (
    <div className="min-w-0 flex-1 px-0 sm:px-5 sm:first:pl-0 sm:last:pr-0">
      <Link
        href={href}
        className="type-caption flex min-h-11 items-center text-muted hover:text-ink-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        {label}
      </Link>
      {/* Shared context line, one mono row tall. Empty for the two stats that
          scope themselves, filled by the runway carousel with the team it is
          showing — reserved in all three so the figures sit on one baseline. */}
      <p className="type-mono min-h-[1.125rem] text-ink-2" aria-hidden />
      <p className="type-stat mt-0.5 text-ink">{valueNode ?? value}</p>
      <p
        className={cn(
          "mt-1 flex items-center gap-1.5 type-row",
          comparisonTone === "neutral" && "text-muted",
          comparisonTone === "caution" && "text-caution",
          comparisonTone === "critical" && "text-critical",
          comparisonTone === "healthy" && "text-healthy"
        )}
      >
        <span className="min-w-0">{comparison}</span>
      </p>
      {spark}
    </div>
  );
}

function signed(amount: number): string {
  return `${amount >= 0 ? "+" : "−"}${formatCurrency(Math.abs(amount))}`;
}

export function AnchorStats({
  overview,
  horizonMonths,
  priorRunwayMonths,
  priorReportLabel,
  teamRows,
}: {
  overview: DashboardOverview;
  /** The Dashboard's own scope control — the runway figure never extrapolates past it. */
  horizonMonths: number;
  priorRunwayMonths: number | null;
  priorReportLabel: string | null;
  /** When more than one team exists, the runway anchor becomes a per-team carousel. */
  teamRows: TeamRunwayRow[] | null;
}) {
  const {
    availableFunds,
    accountCount,
    unpricedAccountCount,
    fundsIncludeEstimated,
    fundsDelta,
    fundsPriorLabel,
    monthlyBurn,
    burnMonthsUsed,
    burnDelta,
    runwayMonths,
    runwayLimitingLabel,
    runwayTargetMonth,
  } = overview;

  const runwayTone: "neutral" | "caution" | "critical" =
    runwayMonths === null
      ? "neutral"
      : runwayMonths < CRITICAL_MONTHS
        ? "critical"
        : runwayMonths < CAUTION_MONTHS
          ? "caution"
          : "neutral";

  const burnBasis =
    burnMonthsUsed === 1 ? "the one payroll month on file" : `the last ${burnMonthsUsed} payroll months`;

  // The month count itself is plain arithmetic — funds over burn — so it is
  // shown in full at any horizon. Only the *date* is a projection claim, and
  // that is suppressed past the window rather than extrapolated, which is what
  // buildVerdict does too.
  const beyondHorizon = runwayMonths !== null && runwayMonths > horizonMonths;

  const hasTeams = !!teamRows && teamRows.filter((r) => r.key !== ALL_TEAMS_KEY).length > 1;

  const fundsExplanation = [
    `Balance on the ${accountCount} ${accountCount === 1 ? "account" : "accounts"} that both have payroll charged to them and have a balance on file, at the same figure Runway uses.`,
    "Accounts nobody is paid from are left out, as are accounts you have hidden.",
    fundsIncludeEstimated
      ? "Includes an estimated balance for at least one account marked as not yours, worked out from the end date you set on Runway."
      : null,
    unpricedAccountCount > 0
      ? `A further ${unpricedAccountCount} ${unpricedAccountCount === 1 ? "account carries" : "accounts carry"} payroll with no balance on file, so ${unpricedAccountCount === 1 ? "it counts" : "they count"} as $0 here — the real total is higher.`
      : null,
  ]
    .filter(Boolean)
    .join(" ");

  const runwayExplanation = [
    "Available payroll divided by the combined monthly burn on those same accounts — an average across them, not a promise about any one person.",
    beyondHorizon
      ? `That lands past the ${horizonMonths}-month window in view, so the month count is shown but no exact date is — projecting one that far would go beyond what the scope covers.`
      : "Individual people and accounts run dry sooner — those are listed under what needs attention.",
    unpricedAccountCount > 0
      ? `${unpricedAccountCount} ${unpricedAccountCount === 1 ? "account is" : "accounts are"} charged with no balance on file, counted at $0, so this reads shorter than the truth.`
      : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <section aria-label="Funding inputs" className="flex flex-col divide-y divide-rule sm:flex-row sm:divide-x sm:divide-y-0">
      <Anchor
        label="Available Payroll"
        href="/account-balances"
        valueNode={
          <DerivedFigure
            value={formatCurrency(availableFunds)}
            explanation={fundsExplanation}
            className="type-stat text-ink"
          />
        }
        comparison={
          <>
            {accountCount} {accountCount === 1 ? "account" : "accounts"} with payroll ·{" "}
            {unpricedAccountCount > 0 ? (
              <Link href="/runway" className="underline decoration-dotted underline-offset-2">
                {unpricedAccountCount} more {unpricedAccountCount === 1 ? "needs" : "need"} a
                balance
              </Link>
            ) : fundsDelta !== null && fundsPriorLabel ? (
              <>
                {signed(fundsDelta)} since the {fundsPriorLabel} report
              </>
            ) : (
              <>no prior report to compare</>
            )}
          </>
        }
        spark={
          <LineSpark
            points={overview.fundsSeries}
            label="Balance on the payroll accounts by report period"
          />
        }
      />

      <Anchor
        label="Monthly Payroll Burn"
        href="/timeline"
        valueNode={
          <DerivedFigure
            value={formatCurrency(monthlyBurn)}
            explanation={`Average total personnel cost — salary and benefits — across ${burnBasis}.`}
            className="type-stat text-ink"
          />
        }
        comparison={
          burnDelta !== null ? (
            <>
              {burnMonthsUsed}-mo avg · {signed(burnDelta)} vs the prior {burnMonthsUsed} months
            </>
          ) : (
            <>{burnMonthsUsed}-mo avg · not enough history to compare</>
          )
        }
        spark={<BarSpark points={overview.burnSeries} label="Monthly personnel cost" />}
      />

      {hasTeams ? (
        <TeamRunwayCarousel
          rows={teamRows!}
          horizonMonths={horizonMonths}
          priorRunwayMonths={priorRunwayMonths}
          priorReportLabel={priorReportLabel}
          runwayExplanation={runwayExplanation}
        />
      ) : (
      <Anchor
        label="Avg Payroll Runway"
        href="/runway"
        valueNode={
          runwayMonths === null ? (
            <span className="text-muted">—</span>
          ) : runwayMonths < 0 ? (
            <DerivedFigure
              projected
              value="Already short"
              explanation="Combined burn on your payroll accounts already exceeds what is left in them."
              className="type-stat text-critical"
            />
          ) : (
            <DerivedFigure
              projected
              value={runwayMonthsLabel(runwayMonths)}
              explanation={runwayExplanation}
              className="type-stat text-ink"
            />
          )
        }
        comparisonTone={runwayTone}
        comparison={
          runwayMonths === null ? (
            <>needs account balances to project</>
          ) : (
            <>
              {runwayMonths < 0 ? (
                <>overdrawn today</>
              ) : beyondHorizon ? (
                <>past the {horizonMonths}-month window</>
              ) : runwayTargetMonth ? (
                <>runs out {monthLabelLong(runwayTargetMonth)}</>
              ) : null}
              {priorRunwayMonths !== null && priorReportLabel ? (
                <> · was {priorRunwayMonths.toFixed(1)} mo at the {priorReportLabel} report</>
              ) : (
                <> · no prior report to compare</>
              )}
            </>
          )
        }
        spark={
          <BalanceSpark
            points={overview.runwaySeries}
            label={
              runwayLimitingLabel
                ? `Balance of ${runwayLimitingLabel}, the first to run dry`
                : "Balance of the account that runs dry first"
            }
          />
        }
      />
      )}
    </section>
  );
}
