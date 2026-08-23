"use client";

import Link from "next/link";
import { Area, AreaChart, Bar, BarChart, Cell, Line } from "recharts";
import { ChartResponsive } from "@/components/charts/ChartResponsive";
import { DerivedFigure } from "@/components/dashboard/DerivedFigure";
import { monthLabelLong } from "@/lib/dashboard/month";
import { formatCurrency } from "@/lib/utils/parse";
import { cn } from "@/lib/utils/cn";
import { CAUTION_MONTHS, CRITICAL_MONTHS } from "@/lib/dashboard/attention";
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
        className="type-caption inline-flex min-h-11 items-center text-muted hover:text-ink-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
      >
        {label}
      </Link>
      <p className="type-stat mt-0.5 text-ink">{valueNode ?? value}</p>
      <p
        className={cn(
          "type-row mt-1",
          comparisonTone === "neutral" && "text-muted",
          comparisonTone === "caution" && "text-caution",
          comparisonTone === "critical" && "text-critical",
          comparisonTone === "healthy" && "text-healthy"
        )}
      >
        {comparison}
      </p>
      {spark}
    </div>
  );
}

function signed(amount: number): string {
  return `${amount >= 0 ? "+" : "−"}${formatCurrency(Math.abs(amount))}`;
}

export function AnchorStats({ overview }: { overview: DashboardOverview }) {
  const {
    availableFunds,
    accountCount,
    fundsDelta,
    fundsPriorLabel,
    monthlyBurn,
    burnMonthsUsed,
    burnDelta,
    runwayMonths,
    runwayLimitingLabel,
    runwayDeficitAmount,
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

  return (
    <section aria-label="Funding inputs" className="flex flex-col divide-y divide-rule sm:flex-row sm:divide-x sm:divide-y-0">
      <Anchor
        label="Available funds"
        href="/account-balances"
        valueNode={
          <DerivedFigure
            value={formatCurrency(availableFunds)}
            explanation={`Sum of the listed balance on all ${accountCount} accounts you track on Account Balances, excluding any you have hidden.`}
            className="type-stat text-ink"
          />
        }
        comparison={
          fundsDelta !== null && fundsPriorLabel ? (
            <>
              {accountCount} {accountCount === 1 ? "account" : "accounts"} ·{" "}
              {signed(fundsDelta)} since the {fundsPriorLabel} report
            </>
          ) : (
            <>
              {accountCount} {accountCount === 1 ? "account" : "accounts"} · no prior report to
              compare
            </>
          )
        }
        spark={<LineSpark points={overview.fundsSeries} label="Total balance by report period" />}
      />

      <Anchor
        label="Monthly burn"
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

      <Anchor
        label="Runway"
        href="/runway"
        valueNode={
          runwayMonths === null ? (
            <span className="text-muted">—</span>
          ) : runwayMonths < 0 && runwayDeficitAmount !== null ? (
            <DerivedFigure
              value={formatCurrency(runwayDeficitAmount)}
              explanation={`The current balance on ${runwayLimitingLabel ?? "the limiting account"}'s account, which has gone negative.`}
              className="type-stat text-critical"
            />
          ) : runwayMonths < 0 ? (
            <span className="type-stat text-critical">Already short</span>
          ) : (
            <DerivedFigure
              projected
              value={`${runwayMonths.toFixed(1)} mo`}
              explanation="The soonest any person or account is projected to run out, given only their own restricted funding sources — never a blend of your total balance, since accounts can't be freely reallocated."
              className="type-stat text-ink"
            />
          )
        }
        comparisonTone={runwayTone}
        comparison={
          runwayMonths === null ? (
            <>needs restricted funding data to project</>
          ) : runwayMonths < 0 && runwayDeficitAmount !== null ? (
            <>{runwayLimitingLabel ?? "an account"} is overdrawn</>
          ) : runwayMonths < 0 ? (
            <>{runwayLimitingLabel ?? "an account"} is already short</>
          ) : runwayTargetMonth ? (
            <>
              runs out {monthLabelLong(runwayTargetMonth)}
              {runwayLimitingLabel && <> · limited by {runwayLimitingLabel}</>}
            </>
          ) : null
        }
      />
    </section>
  );
}
