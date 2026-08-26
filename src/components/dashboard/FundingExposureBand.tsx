"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Area, AreaChart, ReferenceDot, Tooltip, XAxis, YAxis } from "recharts";
import { ChartResponsive } from "@/components/charts/ChartResponsive";
import {
  HatchPattern,
  PROJECTED_STROKE_DASHARRAY,
  UnattributedPattern,
  UNATTRIBUTED_PATTERN_ID,
  projectedFill,
} from "@/components/charts/HatchPattern";
import { monthLabelLong, monthLabelShort } from "@/lib/dashboard/month";
import { UNATTRIBUTED_THRESHOLD } from "@/lib/dashboard/attention";
import { UNATTRIBUTED_MIX_KEY } from "@/lib/dashboard/metrics";
import { formatCurrency } from "@/lib/utils/parse";
import {
  EXPOSURE_HISTORY_WINDOW_MONTHS,
  type FundingExposureTimeline,
} from "@/lib/dashboard/fundingExposure";

const CHART_HEIGHT = 260;

type ChartRow = Record<string, number | string> & { label: string };

interface StackedBand {
  key: string;
  label: string;
  color: string;
  nearKey: string;
  farKey: string;
  patternId: string;
}

function patternIdFor(key: string): string {
  return `hatch-exposure-${key.replace(/[^a-zA-Z0-9]/g, "")}`;
}

function buildChartData(timeline: FundingExposureTimeline, stackOrder: StackedBand[]): ChartRow[] {
  return timeline.months.map((month, i) => {
    const row: ChartRow = { label: monthLabelShort(month) };
    const total = timeline.totalByMonth[i] ?? 0;
    for (const band of stackOrder) {
      const source = timeline.bands.find((b) => b.key === band.key)!;
      const value = source.values[i] ?? 0;
      const pct = total > 0 ? (value / total) * 100 : 0;
      row[band.nearKey] = i < timeline.uncertaintyStartIndex ? pct : 0;
      row[band.farKey] = i >= timeline.uncertaintyStartIndex ? pct : 0;
    }
    return row;
  });
}

function ExposureTooltip({
  active,
  payload,
  label,
  stackOrder,
  timeline,
}: {
  active?: boolean;
  payload?: { dataKey?: string }[];
  label?: string;
  stackOrder: StackedBand[];
  timeline: FundingExposureTimeline;
}) {
  if (!active || !payload?.length) return null;
  const monthIndex = timeline.months.findIndex((m) => monthLabelShort(m) === label);
  if (monthIndex === -1) return null;
  const total = timeline.totalByMonth[monthIndex] ?? 0;

  return (
    <div className="rounded-md border border-rule bg-surface px-3 py-2 shadow-sm">
      <p className="type-mono text-muted">{label}</p>
      <p className="type-row mt-1 font-medium text-ink">{formatCurrency(total)} total</p>
      <ul className="mt-1 space-y-0.5">
        {stackOrder.map((band) => {
          const value = timeline.bands.find((b) => b.key === band.key)!.values[monthIndex] ?? 0;
          if (value <= 0) return null;
          const pct = total > 0 ? (value / total) * 100 : 0;
          return (
            <li key={band.key} className="type-mono flex items-center justify-between gap-3 text-ink-2">
              <span className="flex items-center gap-1.5 truncate">
                <span
                  aria-hidden
                  className="inline-block h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: band.color }}
                />
                <span className="truncate">{band.label}</span>
              </span>
              <span className="tabular-nums">
                {pct.toFixed(0)}% · {formatCurrency(value)}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function FundingExposureBand({ timeline }: { timeline: FundingExposureTimeline | null }) {
  if (!timeline || timeline.bands.length === 0) return null;

  /**
   * With nothing classified there is no mix — every band would be the same
   * grey "Uncategorized" block. Drawing it anyway dresses a data gap up as a
   * finding: a full chart, a legend, and percentages that all read 100%. Say
   * what is actually true and point at the fix instead.
   */
  if (timeline.uncategorizedShare >= 1) {
    return (
      <section aria-label="Funding exposure over time">
        <h2 className="type-caption text-muted">Funding exposure, by type</h2>
        <p className="type-body mt-2 max-w-prose text-ink-2">
          No account carries a funding type yet, so there is no mix to show here or in the
          by-team breakdown beneath. Assign types to your accounts and both fill in — the split
          is drawn from the same payroll costs already on this page.{" "}
          <Link
            href="/settings#accounts"
            className="inline-flex items-center gap-1 font-medium text-accent underline underline-offset-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Assign funding types
            <ArrowRight className="h-4 w-4" aria-hidden />
          </Link>
        </p>
      </section>
    );
  }

  const stackOrder: StackedBand[] = timeline.bands.map((band) => ({
    key: band.key,
    label: band.label,
    color: band.color,
    nearKey: `${band.key}__near`,
    farKey: `${band.key}__far`,
    patternId: patternIdFor(band.key),
  }));

  const chartData = buildChartData(timeline, stackOrder);

  return (
    <section aria-label="Funding exposure over time">
      <h2 className="type-caption text-muted">Funding exposure, by type</h2>
      <p className="type-mono mt-1 text-muted">
        Share of personnel cost by funding type, trailing 12 months actual and projected ahead.
      </p>
      {/* Above the same threshold the attention queue flags a team on, the mix
          covers only part of the money and must say so — otherwise the grey
          block reads as a category rather than a gap. */}
      {timeline.uncategorizedShare > UNATTRIBUTED_THRESHOLD && (
        <p className="type-row mt-1 text-caution">
          {/* Names its window: the matrix below carries the same measure for a
              single month, and two unlabelled percentages 400px apart read as
              a contradiction rather than as two windows. */}
          {Math.round(timeline.uncategorizedShare * 100)}% of the last{" "}
          {EXPOSURE_HISTORY_WINDOW_MONTHS} months&rsquo; cost has no funding type, so only{" "}
          {Math.round((1 - timeline.uncategorizedShare) * 100)}% of this chart is a real mix — the
          rest is the grey Uncategorized band.{" "}
          <Link
            href="/settings#accounts"
            className="font-medium underline underline-offset-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Assign funding types
          </Link>
        </p>
      )}

      <div className="mt-2">
        <ChartResponsive height={CHART_HEIGHT}>
          <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <UnattributedPattern id={UNATTRIBUTED_PATTERN_ID} />
              {stackOrder
                .filter((b) => b.key !== UNATTRIBUTED_MIX_KEY)
                .map((band) => (
                  <HatchPattern key={band.patternId} id={band.patternId} color={band.color} />
                ))}
            </defs>
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: "var(--muted)" }}
              interval="preserveStartEnd"
              tickLine={false}
              axisLine={{ stroke: "var(--rule)" }}
            />
            <YAxis
              domain={[0, 100]}
              /* Explicit whole-percent ticks and room for the widest label
                 ("100%"): an auto domain rendered a fractional tick that
                 overran the 40px gutter and printed over its neighbour. */
              ticks={[0, 25, 50, 75, 100]}
              allowDecimals={false}
              tick={{ fontSize: 11, fill: "var(--muted)" }}
              tickFormatter={(v) => `${Math.round(v)}%`}
              width={48}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip content={<ExposureTooltip stackOrder={stackOrder} timeline={timeline} />} />
            {stackOrder.map((band) => {
              const isUnattributed = band.key === UNATTRIBUTED_MIX_KEY;
              return (
                <Area
                  key={band.nearKey}
                  type="monotone"
                  dataKey={band.nearKey}
                  stackId="exposure"
                  stroke={isUnattributed ? "var(--rule-strong)" : "var(--paper)"}
                  strokeWidth={1}
                  fill={isUnattributed ? projectedFill(UNATTRIBUTED_PATTERN_ID) : band.color}
                  isAnimationActive={false}
                />
              );
            })}
            {stackOrder.map((band) => {
              const isUnattributed = band.key === UNATTRIBUTED_MIX_KEY;
              return (
                <Area
                  key={band.farKey}
                  type="monotone"
                  dataKey={band.farKey}
                  stackId="exposure"
                  stroke={isUnattributed ? "var(--rule-strong)" : band.color}
                  strokeWidth={1}
                  strokeDasharray={PROJECTED_STROKE_DASHARRAY}
                  fill={isUnattributed ? projectedFill(UNATTRIBUTED_PATTERN_ID) : projectedFill(band.patternId)}
                  isAnimationActive={false}
                />
              );
            })}
            {timeline.markers.map((marker) => (
              <ReferenceDot
                key={`${marker.month}-${marker.employeeName}`}
                x={monthLabelShort(marker.month)}
                y={100}
                r={3}
                fill="var(--rule-strong)"
                stroke="var(--surface)"
                strokeWidth={1}
                shape={(props: { cx?: number; cy?: number }) => (
                  <circle cx={props.cx} cy={props.cy} r={3} fill="var(--rule-strong)" stroke="var(--surface)" strokeWidth={1}>
                    <title>
                      {marker.employeeName} · {marker.description} · {monthLabelLong(marker.month)}
                    </title>
                  </circle>
                )}
              />
            ))}
          </AreaChart>
        </ChartResponsive>
      </div>

      <p className="type-mono mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-muted">
        {stackOrder.map((band) => (
          <span key={band.key} className="flex items-center gap-1.5">
            <span
              aria-hidden
              className="inline-block h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: band.color }}
            />
            {band.label}
          </span>
        ))}
      </p>
    </section>
  );
}
