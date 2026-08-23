"use client";

import Link from "next/link";
import { Area, AreaChart, Bar, BarChart, Cell, Line } from "recharts";
import { ChartResponsive } from "@/components/charts/ChartResponsive";
import { DerivedFigure } from "@/components/dashboard/DerivedFigure";
import { monthLabelLong } from "@/lib/dashboard/month";
import { formatCurrency } from "@/lib/utils/parse";
import { cn } from "@/lib/utils/cn";
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
  spark: React.ReactNode;
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
    runwayPriorMonths,
    runwayTargetMonth,
  } = overview;

  const runwayDrop =
    runwayMonths !== null && runwayPriorMonths !== null
      ? runwayMonths - runwayPriorMonths
      : null;

  return (
    <section aria-label="Funding inputs" className="flex flex-col divide-y divide-rule sm:flex-row sm:divide-x sm:divide-y-0">
      <Anchor
        label="Available funds"
        href="/account-balances"
        value={formatCurrency(availableFunds)}
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
        value={formatCurrency(monthlyBurn)}
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
          runwayMonths !== null ? (
            <DerivedFigure
              projected
              value={`${runwayMonths.toFixed(1)} mo`}
              explanation="Available funds divided by the trailing monthly burn, at today's spending rate."
              className="type-stat text-ink"
            />
          ) : (
            <span className="text-muted">—</span>
          )
        }
        comparisonTone={runwayDrop !== null && runwayDrop < -0.5 ? "caution" : "neutral"}
        comparison={
          runwayTargetMonth ? (
            <>
              runs out {monthLabelLong(runwayTargetMonth)}
              {runwayPriorMonths !== null ? (
                <> · was {runwayPriorMonths.toFixed(1)} last report</>
              ) : (
                <> · no prior report to compare</>
              )}
            </>
          ) : (
            <>needs balances and a burn rate to project</>
          )
        }
        spark={<LineSpark points={overview.runwaySeries} label="Months of runway by report period" />}
      />
    </section>
  );
}
