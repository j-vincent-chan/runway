"use client";

import { useState } from "react";
import { Area, AreaChart, ReferenceDot, Tooltip, XAxis, YAxis } from "recharts";
import { ChartResponsive } from "@/components/charts/ChartResponsive";
import { HatchPattern, PROJECTED_PATTERN_ID, projectedFill } from "@/components/charts/HatchPattern";
import { monthLabelLong, monthLabelShort } from "@/lib/dashboard/month";
import { formatCurrency } from "@/lib/utils/parse";
import { cn } from "@/lib/utils/cn";
import { ribbonTotals, type RunwayRibbon as RunwayRibbonData } from "@/lib/dashboard/runwayRibbon";

const CHART_HEIGHT = 260;
/** Bottom (healthiest, never depletes) to top (soonest to deplete) — narrowing at the top is the depletion signal. */
const MIN_BAND_OPACITY = 0.14;
const MAX_BAND_OPACITY = 0.6;

type ChartRow = Record<string, number | string> & { label: string };

interface StackedBand {
  chartRoot: string;
  label: string;
  nearKey: string;
  farKey: string;
  opacity: number;
}

function buildChartData(ribbon: RunwayRibbonData, stackOrder: StackedBand[]): ChartRow[] {
  return ribbon.months.map((month, i) => {
    const row: ChartRow = { label: monthLabelShort(month) };
    for (const band of stackOrder) {
      const source = ribbon.bands.find((b) => b.chartRoot === band.chartRoot)!;
      const value = source.values[i] ?? 0;
      row[band.nearKey] = i < ribbon.uncertaintyStartIndex ? value : 0;
      row[band.farKey] = i >= ribbon.uncertaintyStartIndex ? value : 0;
    }
    return row;
  });
}

function RibbonTooltip({
  active,
  payload,
  label,
  stackOrder,
}: {
  active?: boolean;
  payload?: { value?: number; dataKey?: string }[];
  label?: string;
  stackOrder: StackedBand[];
}) {
  if (!active || !payload?.length) return null;
  const byBand = new Map<string, number>();
  for (const band of stackOrder) {
    const near = payload.find((p) => p.dataKey === band.nearKey)?.value ?? 0;
    const far = payload.find((p) => p.dataKey === band.farKey)?.value ?? 0;
    const value = near || far;
    if (value > 0) byBand.set(band.label, value);
  }
  const total = [...byBand.values()].reduce((sum, v) => sum + v, 0);

  return (
    <div className="rounded-md border border-rule bg-surface px-3 py-2 shadow-sm">
      <p className="type-mono text-muted">{label}</p>
      <p className="type-row mt-1 font-medium text-ink">{formatCurrency(total)} total</p>
      <ul className="mt-1 space-y-0.5">
        {[...byBand.entries()].map(([name, value]) => (
          <li key={name} className="type-mono flex justify-between gap-3 text-ink-2">
            <span className="truncate">{name}</span>
            <span className="tabular-nums">{formatCurrency(value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function RunwayRibbon({ ribbon }: { ribbon: RunwayRibbonData | null }) {
  const [includeAllAccounts, setIncludeAllAccounts] = useState(false);

  if (!ribbon || ribbon.bands.length === 0) return null;

  const currentBands = ribbon.bands.filter((b) => b.hasCurrentPersonnel);
  const noCurrentPersonnel = currentBands.length === 0;
  const showAll = includeAllAccounts || noCurrentPersonnel;
  const scopedBands = showAll ? ribbon.bands : currentBands;
  const { totalByMonth, terminalIndex } = showAll
    ? { totalByMonth: ribbon.totalByMonth, terminalIndex: ribbon.terminalIndex }
    : ribbonTotals(scopedBands, ribbon.months.length);

  // Soonest-to-deplete last (top of stack), so the outer edge narrowing is the depletion signal.
  const orderedBands = [...scopedBands].sort((a, b) => {
    const aIdx = a.depletionMonthIndex ?? Number.POSITIVE_INFINITY;
    const bIdx = b.depletionMonthIndex ?? Number.POSITIVE_INFINITY;
    return bIdx - aIdx;
  });

  const stackOrder: StackedBand[] = orderedBands.map((band, i) => ({
    chartRoot: band.chartRoot,
    label: band.label,
    nearKey: `${band.chartRoot}__near`,
    farKey: `${band.chartRoot}__far`,
    opacity:
      orderedBands.length > 1
        ? MIN_BAND_OPACITY + (i / (orderedBands.length - 1)) * (MAX_BAND_OPACITY - MIN_BAND_OPACITY)
        : MAX_BAND_OPACITY,
  }));

  const chartData = buildChartData(ribbon, stackOrder);
  const maxTotal = Math.max(...totalByMonth, 1);

  const namedBands = [...scopedBands]
    .sort((a, b) => (b.values[0] ?? 0) - (a.values[0] ?? 0))
    .slice(0, 5);
  const hiddenBandCount = Math.max(0, scopedBands.length - namedBands.length);

  const scopeCaption = noCurrentPersonnel
    ? "No account currently has active personnel funding, so all accounts are shown."
    : showAll
      ? `Showing all ${ribbon.bands.length} ${ribbon.bands.length === 1 ? "account" : "accounts"} in the projection.`
      : `Showing ${scopedBands.length} of ${ribbon.bands.length} accounts — those with current personnel.`;

  return (
    <section aria-label="Funding depletion over time">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="type-caption text-muted">Funding depletion, next 24 months</h2>
        {!noCurrentPersonnel && (
          <button
            type="button"
            onClick={() => setIncludeAllAccounts((v) => !v)}
            className="type-mono inline-flex min-h-11 items-center text-muted hover:text-ink-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {showAll ? "Show current personnel only" : "Include all accounts"}
          </button>
        )}
      </div>
      <p className="type-mono mt-1 text-muted">
        Shows funded capacity remaining, floored at zero — not deficit depth. An account already
        overdrawn today still starts this chart at $0, not negative. {scopeCaption}
      </p>

      <div className="mt-2">
        <ChartResponsive height={CHART_HEIGHT}>
          <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <HatchPattern id={PROJECTED_PATTERN_ID} color="var(--accent)" />
            </defs>
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: "var(--muted)" }}
              interval="preserveStartEnd"
              tickLine={false}
              axisLine={{ stroke: "var(--rule)" }}
            />
            <YAxis
              domain={[0, maxTotal]}
              tick={{ fontSize: 11, fill: "var(--muted)" }}
              tickFormatter={(v) => `$${(Number(v) / 1000).toFixed(0)}k`}
              width={52}
              tickCount={4}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip content={<RibbonTooltip stackOrder={stackOrder} />} />
            {stackOrder.map((band) => (
              <Area
                key={band.nearKey}
                type="monotone"
                dataKey={band.nearKey}
                stackId="ribbon"
                stroke="var(--paper)"
                strokeWidth={1}
                fill="var(--accent)"
                fillOpacity={band.opacity}
                isAnimationActive={false}
              />
            ))}
            {stackOrder.map((band) => (
              <Area
                key={band.farKey}
                type="monotone"
                dataKey={band.farKey}
                stackId="ribbon"
                stroke="var(--paper)"
                strokeWidth={1}
                strokeDasharray="1 3"
                fill={projectedFill()}
                fillOpacity={band.opacity}
                isAnimationActive={false}
              />
            ))}
            {ribbon.markers.map((marker) => (
              <ReferenceDot
                key={`${marker.month}-${marker.employeeName}`}
                x={monthLabelShort(marker.month)}
                y={maxTotal}
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

      <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <p className="type-mono flex flex-wrap items-center gap-x-1.5 text-muted">
          {namedBands.map((band, i) => (
            <span key={band.chartRoot}>
              {i > 0 && <span aria-hidden> · </span>}
              {band.label}
            </span>
          ))}
          {hiddenBandCount > 0 && <span> · +{hiddenBandCount} more</span>}
        </p>
        <p
          className={cn(
            "type-mono",
            terminalIndex !== null ? "text-critical" : "text-healthy"
          )}
        >
          {terminalIndex !== null
            ? `Runs out ${monthLabelLong(ribbon.months[terminalIndex]!)}`
            : "Funded through the full 24-month window"}
        </p>
      </div>
    </section>
  );
}
