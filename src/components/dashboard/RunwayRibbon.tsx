"use client";

import { useState } from "react";
import {
  Area,
  AreaChart,
  ReferenceArea,
  ReferenceDot,
  ReferenceLine,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartResponsive } from "@/components/charts/ChartResponsive";
import { HatchPattern, PROJECTED_PATTERN_ID, projectedFill } from "@/components/charts/HatchPattern";
import { monthLabelLong, monthLabelShort } from "@/lib/dashboard/month";
import { formatCurrency } from "@/lib/utils/parse";
import { cn } from "@/lib/utils/cn";
import {
  collapseBands,
  ribbonTotals,
  RIBBON_OTHER_ROOT,
  type RibbonBand,
  type RunwayRibbon as RunwayRibbonData,
} from "@/lib/dashboard/runwayRibbon";

const CHART_HEIGHT = 260;
/**
 * Bottom (healthiest, never depletes) to top (soonest to deplete) — narrowing
 * at the top is the depletion signal. The floor is set by contrast, not taste:
 * accent over surface reaches 3:1 at roughly 0.65 opacity, and every band is a
 * graphical object carrying meaning, so none may sit below it. At six bands the
 * ramp still steps ~0.07 apiece, which stays distinguishable.
 */
const MIN_BAND_OPACITY = 0.65;
const MAX_BAND_OPACITY = 1;
/** $2.8M above a million, $950k below — never "$2777k". */
function formatAxisMoney(value: number): string {
  const v = Number(value);
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  return `$${Math.round(v / 1000)}k`;
}

type ChartRow = Record<string, number | string> & { label: string };

interface StackedBand {
  chartRoot: string;
  label: string;
  key: string;
  opacity: number;
}

/**
 * Reads from the collapsed band list, which contains an aggregate
 * `ribbon.bands` does not.
 *
 * One series per band. Each band used to be split into a "near" and a "far"
 * series sharing the stack, each zero outside its own half of the window — so
 * at the certainty boundary the near series fell from its full value to zero
 * while the far series rose from zero, and the solid fill appeared to plunge
 * to the floor in a single month. The total was continuous throughout; only
 * the fills crossed over. Reported as "why is there such a large dropoff",
 * which is exactly how it read.
 */
function buildChartData(
  bands: RibbonBand[],
  months: string[],
  stackOrder: StackedBand[]
): ChartRow[] {
  const byRoot = new Map(bands.map((b) => [b.chartRoot, b]));
  return months.map((month, i) => {
    const row: ChartRow = { label: monthLabelShort(month) };
    for (const band of stackOrder) {
      row[band.key] = byRoot.get(band.chartRoot)?.values[i] ?? 0;
    }
    return row;
  });
}

/**
 * One entry per band: the account, when it runs dry, and — only for the ones
 * that do — the point on the chart to mark it.
 *
 * The text was in-chart first, which is what the design system asks for. On
 * real data five of six bands deplete within a few months of each other, so
 * the labels landed on top of one another: ten overlapping pairs at every
 * scope. Direct labelling is genuinely impossible here, which is the condition
 * under which an ordered list is the sanctioned fallback.
 *
 * What stays on the chart is the mark, not the name — a dot at each zero
 * crossing, so "when" is still read directly off the axis. A band that never
 * runs dry has no crossing to mark, hence `dryPoint: null`.
 */
function bandCallouts(
  months: string[],
  stackOrder: StackedBand[],
  byRoot: Map<string, RibbonBand>
): {
  key: string;
  label: string;
  when: string;
  depleted: boolean;
  dryPoint: { x: string; y: number } | null;
}[] {
  const lastIndex = months.length - 1;

  return stackOrder.flatMap((band) => {
    const source = byRoot.get(band.chartRoot);
    if (!source) return [];

    const depletionIdx = source.depletionMonthIndex;
    const depleted = depletionIdx !== null && depletionIdx <= lastIndex;
    const many = band.chartRoot === RIBBON_OTHER_ROOT;

    let dryPoint: { x: string; y: number } | null = null;
    if (depleted) {
      // The band's own top edge at that month: everything stacked beneath it.
      // Its own value is zero there, which is what "runs dry" means.
      let below = 0;
      for (const other of stackOrder) {
        if (other.chartRoot === band.chartRoot) break;
        below += byRoot.get(other.chartRoot)?.values[depletionIdx!] ?? 0;
      }
      dryPoint = { x: monthLabelShort(months[depletionIdx!]!), y: below };
    }

    /**
     * The aggregate's own depletion date describes the summed balance, which
     * stays positive while accounts inside it run dry — so reporting only that
     * date said "30 other accounts hold past July 2027" beneath a header
     * saying 23 of 35 run dry. When some but not all of its members deplete,
     * say how many rather than speaking for the sum.
     */
    const partial =
      many &&
      !depleted &&
      (source.depletedMemberCount ?? 0) > 0 &&
      (source.memberCount ?? 0) > 0;

    return [{
      key: band.chartRoot,
      label: band.label,
      // The aggregate names many accounts, so the verb has to agree with it as
      // well as with a single account.
      when: partial
        ? `${source.depletedMemberCount} of ${source.memberCount} run dry by ${monthLabelLong(months[lastIndex]!)}`
        : depleted
          ? `${many ? "run" : "runs"} dry ${monthLabelLong(months[depletionIdx!]!)}`
          : `${many ? "hold" : "holds"} past ${monthLabelLong(months[lastIndex]!)}`,
      depleted: depleted || partial,
      dryPoint,
    }];
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
    const value = payload.find((p) => p.dataKey === band.key)?.value ?? 0;
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

  // Five named accounts plus one aggregate. Totals are unchanged by this —
  // collapseBands sums, it does not recompute — so the figures below still
  // describe every scoped account, not just the ones drawn separately.
  const drawnBands = collapseBands(scopedBands);
  const { totalByMonth, terminalIndex } = ribbonTotals(drawnBands, ribbon.months.length);

  // Soonest-to-deplete last (top of stack), so the outer edge narrowing is the depletion signal.
  const orderedBands = [...drawnBands].sort((a, b) => {
    const aIdx = a.depletionMonthIndex ?? Number.POSITIVE_INFINITY;
    const bIdx = b.depletionMonthIndex ?? Number.POSITIVE_INFINITY;
    return bIdx - aIdx;
  });

  const stackOrder: StackedBand[] = orderedBands.map((band, i) => ({
    chartRoot: band.chartRoot,
    label: band.label,
    key: band.chartRoot,
    opacity:
      orderedBands.length > 1
        ? MIN_BAND_OPACITY + (i / (orderedBands.length - 1)) * (MAX_BAND_OPACITY - MIN_BAND_OPACITY)
        : MAX_BAND_OPACITY,
  }));

  const byRoot = new Map(drawnBands.map((b) => [b.chartRoot, b]));
  const chartData = buildChartData(drawnBands, ribbon.months, stackOrder);
  const maxTotal = Math.max(...totalByMonth, 1);
  const callouts = bandCallouts(ribbon.months, stackOrder, byRoot);

  const scopeCaption = noCurrentPersonnel
    ? "No account currently has active personnel funding, so all accounts are shown."
    : showAll
      ? `Showing all ${ribbon.bands.length} ${ribbon.bands.length === 1 ? "account" : "accounts"} in the projection.`
      : `Showing ${scopedBands.length} of ${ribbon.bands.length} accounts — those with current personnel.`;

  const horizonMonths = ribbon.months.length;
  /**
   * A short scope can contain no depletion at all. Saying so is a positive
   * statement the reader can act on; a chart of flat bands is not, and reads
   * as though the projection failed.
   */
  const depletingCount = scopedBands.filter((b) => b.depletionMonthIndex !== null).length;
  const nothingDepletes = depletingCount === 0;

  return (
    <section aria-label="Funding depletion over time">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="type-caption text-muted">
          Funding depletion, next {horizonMonths} months
        </h2>
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
      {nothingDepletes ? (
        <p className="type-row mt-1 text-healthy">
          No account runs dry inside the next {horizonMonths} months. Widen the scope above to see
          when the first one does.
        </p>
      ) : (
        <p className="type-row mt-1 text-ink-2">
          {depletingCount} of {scopedBands.length}{" "}
          {scopedBands.length === 1 ? "account runs" : "accounts run"} dry inside the next{" "}
          {horizonMonths} months.
        </p>
      )}
      <p className="type-mono mt-1 text-muted">
        Shows funded capacity remaining, floored at zero — not deficit depth. An account already
        overdrawn today still starts this chart at $0, not negative. {scopeCaption}
        {ribbon.hasEstimatedOpening && (
          <>
            {" "}
            An account you marked as not yours starts at the amount its end date implies — its
            burn to that date — rather than the balance on file.
          </>
        )}
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
              tickFormatter={formatAxisMoney}
              width={56}
              tickCount={4}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip content={<RibbonTooltip stackOrder={stackOrder} />} />
            {stackOrder.map((band) => (
              <Area
                key={band.key}
                type="monotone"
                dataKey={band.key}
                stackId="ribbon"
                stroke="var(--paper)"
                strokeWidth={1}
                fill="var(--accent)"
                fillOpacity={band.opacity}
                isAnimationActive={false}
              />
            ))}
            {/* The hatch marks a period, not a band. Declared after the areas
                so it veils them, and spanning the plot rather than the stack
                because what is less certain is the time, not any one account. */}
            {ribbon.uncertaintyStartIndex > 0 &&
              ribbon.uncertaintyStartIndex < ribbon.months.length && (
                <ReferenceArea
                  x1={monthLabelShort(ribbon.months[ribbon.uncertaintyStartIndex]!)}
                  x2={monthLabelShort(ribbon.months[ribbon.months.length - 1]!)}
                  fill={projectedFill()}
                  fillOpacity={1}
                  stroke="none"
                  ifOverflow="extendDomain"
                />
              )}
            {/* Not a "today" rule — this chart begins at today and is projection
                end to end. What is worth marking is where the projection stops
                being near-term, which is also where the fill turns hatched. */}
            {ribbon.uncertaintyStartIndex > 0 &&
              ribbon.uncertaintyStartIndex < ribbon.months.length && (
                <ReferenceLine
                  x={monthLabelShort(ribbon.months[ribbon.uncertaintyStartIndex]!)}
                  stroke="var(--rule-strong)"
                  strokeDasharray="2 2"
                  label={{
                    value: "less certain beyond here",
                    position: "insideTopRight",
                    fill: "var(--muted)",
                    fontSize: 11,
                  }}
                />
              )}
            {callouts
              .filter((entry) => entry.dryPoint !== null)
              .map((entry) => (
                <ReferenceDot
                  key={`dry-${entry.key}`}
                  x={entry.dryPoint!.x}
                  y={entry.dryPoint!.y}
                  r={3.5}
                  fill="var(--critical)"
                  stroke="var(--surface)"
                  strokeWidth={1.5}
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

      {/* Stack order, top band first, so a row maps onto the band above it.
          The swatch carries the same opacity the band is drawn at. */}
      <ul className="mt-2 grid gap-x-6 gap-y-1 sm:grid-cols-2 lg:grid-cols-3">
        {[...callouts].reverse().map((entry) => {
          const band = stackOrder.find((b) => b.chartRoot === entry.key);
          return (
            <li key={entry.key} className="type-row flex items-baseline gap-2 text-ink-2">
              <span
                aria-hidden
                className="mt-1 inline-block h-2 w-2 shrink-0 rounded-xs bg-accent"
                style={{ opacity: band?.opacity ?? 1 }}
              />
              <span className="min-w-0 flex-1 truncate text-ink" title={entry.label}>
                {entry.label}
              </span>
              <span
                className={cn("type-mono shrink-0", entry.depleted ? "text-critical" : "text-muted")}
              >
                {entry.when}
              </span>
            </li>
          );
        })}
      </ul>

      <div className="mt-2 flex flex-wrap items-center justify-end gap-x-4 gap-y-1">
        <p
          className={cn(
            "type-mono",
            terminalIndex !== null ? "text-critical" : "text-healthy"
          )}
        >
          {terminalIndex !== null
            ? `Runs out ${monthLabelLong(ribbon.months[terminalIndex]!)}`
            : `Funded through the full ${horizonMonths}-month window`}
        </p>
      </div>
    </section>
  );
}
