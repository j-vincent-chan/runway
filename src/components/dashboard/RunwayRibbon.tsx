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
  alreadyDryLabels,
  collapseBands,
  depletionEvents,
  ribbonTotals,
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
/**
 * Depletion dots scale by area, not radius — four accounts emptying in one
 * month must not read as sixteen times one. Capped so a heavy month stays a
 * dot rather than a blob, and floored so a single account is still findable.
 *//** Roster-date pins: tick height above the axis, then the circle on top. */
const MARKER_TICK = 10;
/** Big enough that a face is recognisable at a glance, not just a coloured dot. */
const MARKER_R = 13;
const MARKER_CLIP_ID = "ribbon-marker-clip";
const DRY_DOT_MIN_R = 3.5;
const DRY_DOT_MAX_R = 9;
function dryDotRadius(count: number): number {
  return Math.min(DRY_DOT_MAX_R, DRY_DOT_MIN_R * Math.sqrt(Math.max(count, 1)));
}
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
 * What ran out this month, then what is left.
 *
 * The remaining-balance list filters to bands still holding money — which is
 * every band *except* the ones that just emptied, since a depleted band's
 * value is zero. So the one account the red dot was marking was the one
 * account the tooltip could never name. The dry list is sourced from the same
 * events the dots are, and leads, because it is the reason the dot is there.
 */
function RibbonTooltip({
  active,
  payload,
  label,
  stackOrder,
  dryByLabel,
}: {
  active?: boolean;
  payload?: { value?: number; dataKey?: string }[];
  label?: string;
  stackOrder: StackedBand[];
  /** Month label → accounts emptying at that point, and whether they were already dry going in. */
  dryByLabel: Map<string, { already: boolean; labels: string[] }>;
}) {
  if (!active || !payload?.length) return null;
  const byBand = new Map<string, number>();
  for (const band of stackOrder) {
    const value = payload.find((p) => p.dataKey === band.key)?.value ?? 0;
    if (value > 0) byBand.set(band.label, value);
  }
  const total = [...byBand.values()].reduce((sum, v) => sum + v, 0);
  const dry = label ? dryByLabel.get(label) : undefined;

  return (
    <div className="max-w-sm rounded-md border border-rule bg-surface px-3 py-2 shadow-sm">
      <p className="type-mono text-muted">{label}</p>
      {dry && dry.labels.length > 0 && (
        <>
          <p className="type-row mt-1 font-medium text-critical">
            {dry.already
              ? dry.labels.length === 1
                ? "Already dry"
                : `${dry.labels.length} already dry`
              : dry.labels.length === 1
                ? "Runs dry this month"
                : `${dry.labels.length} run dry this month`}
          </p>
          <ul className="mt-0.5 space-y-0.5">
            {dry.labels.map((name) => (
              <li key={name} className="type-mono truncate text-critical">
                {name}
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="type-row mt-2 font-medium text-ink">{formatCurrency(total)} still funded</p>
      <ul className="mt-0.5 space-y-0.5">
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

  /**
   * Computed from the scoped bands, not the drawn ones: collapsing caps the
   * drawn list at five plus an aggregate, and the aggregate never reports a
   * depletion date, so the dots would have covered a fraction of the accounts
   * the header counts.
   */
  const dryEvents = depletionEvents(scopedBands, ribbon.months);
  const alreadyDry = alreadyDryLabels(scopedBands);

  /**
   * Every zero-crossing the chart can name, keyed by month label so both the
   * dot and the whole-row tooltip read off the same map. Already-dry accounts
   * are folded in under the chart's first month: they hold nothing at that
   * point too, just not because of anything that happened during the window —
   * "already" is preserved in the label so the wording never claims a
   * transition that happened before the chart began.
   */
  const dryByLabel = new Map<string, { already: boolean; labels: string[] }>(
    dryEvents.map((e) => [monthLabelShort(e.month), { already: false, labels: e.labels }])
  );
  if (alreadyDry.length > 0 && ribbon.months.length > 0) {
    const firstLabel = monthLabelShort(ribbon.months[0]!);
    const existing = dryByLabel.get(firstLabel)?.labels ?? [];
    dryByLabel.set(firstLabel, {
      already: true,
      labels: [...new Set([...alreadyDry, ...existing])].sort((a, b) => a.localeCompare(b)),
    });
  }

  const chartData = buildChartData(drawnBands, ribbon.months, stackOrder);
  const maxTotal = Math.max(...totalByMonth, 1);

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
              {/* objectBoundingBox so one clip serves every pin, wherever it sits. */}
              <clipPath id={MARKER_CLIP_ID} clipPathUnits="objectBoundingBox">
                <circle cx="0.5" cy="0.5" r="0.5" />
              </clipPath>
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
            <Tooltip content={<RibbonTooltip stackOrder={stackOrder} dryByLabel={dryByLabel} />} />
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
            {/*
              One dot per zero-crossing month, sized by how many accounts empty
              there, riding the top edge of the area so a month-level event
              sits on the outline the eye is already following. Size alone
              cannot carry meaning, so every dot's hover names its accounts —
              the legend below explains what the dot means, the hover supplies
              the specifics, and nothing is duplicated in static text.

              Already-dry accounts get the same treatment at the chart's first
              month: they hold nothing there too, just not because of anything
              that happened during the window.
            */}
            {[...dryByLabel.entries()].map(([monthLabel, entry]) => {
              const count = entry.labels.length;
              const radius = dryDotRadius(count);
              const monthIndex = ribbon.months.findIndex(
                (m) => monthLabelShort(m) === monthLabel
              );
              const title = entry.already
                ? `Already dry as of ${monthLabel} · ${
                    count === 1 ? "1 account" : `${count} accounts`
                  }: ${entry.labels.join(", ")}`
                : `${monthLabelLong(ribbon.months[monthIndex] ?? monthLabel)} · ${
                    count === 1 ? "1 account runs dry" : `${count} accounts run dry`
                  }: ${entry.labels.join(", ")}`;
              return (
                <ReferenceDot
                  key={`dry-${monthLabel}`}
                  x={monthLabel}
                  y={totalByMonth[monthIndex] ?? 0}
                  r={radius}
                  fill="var(--critical)"
                  stroke="var(--surface)"
                  strokeWidth={1.5}
                  shape={(props: { cx?: number; cy?: number }) => (
                    <circle
                      cx={props.cx}
                      cy={props.cy}
                      r={radius}
                      fill="var(--critical)"
                      stroke="var(--surface)"
                      strokeWidth={1.5}
                    >
                      <title>{title}</title>
                    </circle>
                  )}
                />
              );
            })}
            {/*
              Roster dates stand on the axis rather than floating at the top of
              the plot: they are facts about a date, not about a balance, and a
              dot at maxTotal implied a height it never had.

              Start and end are told apart by fill as well as tone — filled for
              an ending, hollow for a start — so the pair survives greyscale and
              a color-vision deficiency. Neither wears --critical, --caution or
              --healthy: those three mean severity here, and a roster date is
              not a severity.
            */}
            {ribbon.markers.map((marker) => {
              const ending = marker.kind === "end";
              const initials = marker.employeeName
                .split(/\s+/)
                .slice(0, 2)
                .map((part) => part[0] ?? "")
                .join("")
                .toUpperCase();
              return (
                <ReferenceDot
                  key={`${marker.month}-${marker.kind}-${marker.employeeName}`}
                  x={monthLabelShort(marker.month)}
                  y={0}
                  r={MARKER_R}
                  fill="var(--ink-2)"
                  shape={(props: { cx?: number; cy?: number }) => {
                    const cx = props.cx ?? 0;
                    const cy = (props.cy ?? 0) - MARKER_TICK - MARKER_R;
                    return (
                      <g>
                        <line
                          x1={cx}
                          y1={props.cy}
                          x2={cx}
                          y2={cy}
                          stroke="var(--ink-2)"
                          strokeWidth={1.5}
                        />
                        {marker.photoUrl ? (
                          <image
                            href={marker.photoUrl}
                            x={cx - MARKER_R}
                            y={cy - MARKER_R}
                            width={MARKER_R * 2}
                            height={MARKER_R * 2}
                            clipPath={`url(#${MARKER_CLIP_ID})`}
                            preserveAspectRatio="xMidYMid slice"
                          />
                        ) : (
                          <>
                            <circle cx={cx} cy={cy} r={MARKER_R} fill="var(--inset)" />
                            <text
                              x={cx}
                              y={cy}
                              textAnchor="middle"
                              dominantBaseline="central"
                              fontSize={11}
                              fontWeight={500}
                              fill="var(--ink-2)"
                            >
                              {initials}
                            </text>
                          </>
                        )}
                        {/* The ring, not the photo, says which kind this is:
                            solid for an ending, dashed for a start. Shape
                            rather than hue, because --critical, --caution and
                            --healthy mean severity here and a roster date is
                            not a severity. */}
                        <circle
                          cx={cx}
                          cy={cy}
                          r={MARKER_R}
                          fill="none"
                          stroke="var(--ink-2)"
                          strokeWidth={2}
                          strokeDasharray={ending ? undefined : "2 2"}
                        />
                        <circle cx={cx} cy={cy} r={MARKER_R} fill="transparent">
                          <title>
                            {marker.employeeName} · {marker.description} ·{" "}
                            {monthLabelLong(marker.month)}
                          </title>
                        </circle>
                      </g>
                    );
                  }}
                />
              );
            })}
          </AreaChart>
        </ChartResponsive>
      </div>

      {/*
        A dry-date schedule, not a band legend.
        This carried a color swatch per row, which asked the reader to match
        shades against bands drawn in one hue — unreadable, and the swatch
        opacity was assigned by stack position rather than by anything about
        the account. What the rows are actually good for is naming what runs
        dry and when, which is also the text equivalent of the dots above: the
        same facts, reachable without a pointer.
      */}
      {/*
        One key for every mark on the chart, because a shape or a size with no
        name is only decoration. This used to be a written schedule under the
        chart, naming every account and when it empties — which repeated the
        dot's own hover almost verbatim, in a much larger footprint, and still
        had to truncate past a handful of rows. The dot already says everything
        the list said; the key just explains what the dot means, once.

        hiddenMarkerCount was computed and never shown, so a chart capped at
        five roster pins was claiming to display all of them.
      */}
      {(dryByLabel.size > 0 || ribbon.markers.length > 0) && (
        <p className="type-mono mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-muted">
          {dryByLabel.size > 0 && (
            <span className="inline-flex items-center gap-1.5">
              <svg width="12" height="12" aria-hidden>
                <circle cx="6" cy="6" r="4.5" fill="var(--critical)" />
              </svg>
              account runs dry (size = how many)
            </span>
          )}
          {ribbon.markers.length > 0 && (
            <>
              <span className="inline-flex items-center gap-1.5">
                <svg width="12" height="12" aria-hidden>
                  <circle
                    cx="6"
                    cy="6"
                    r="4.5"
                    fill="var(--inset)"
                    stroke="var(--ink-2)"
                    strokeWidth="2"
                  />
                </svg>
                employment or funding ends
              </span>
              <span className="inline-flex items-center gap-1.5">
                <svg width="12" height="12" aria-hidden>
                  <circle
                    cx="6"
                    cy="6"
                    r="4.5"
                    fill="var(--inset)"
                    stroke="var(--ink-2)"
                    strokeWidth="2"
                    strokeDasharray="2 2"
                  />
                </svg>
                employment starts
              </span>
              {ribbon.hiddenMarkerCount > 0 && (
                <span>+ {ribbon.hiddenMarkerCount} more not pinned</span>
              )}
            </>
          )}
        </p>
      )}

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
