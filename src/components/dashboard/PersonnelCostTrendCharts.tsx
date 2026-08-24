"use client";

import Link from "next/link";
import { Bar, BarChart, Cell, ReferenceDot, ReferenceLine, Tooltip, XAxis, YAxis } from "recharts";
import { ChartResponsive } from "@/components/charts/ChartResponsive";
import { HatchPattern, PROJECTED_PATTERN_ID, PROJECTED_STROKE_DASHARRAY, projectedFill } from "@/components/charts/HatchPattern";
import { flagAnomalousMonths, type PersonnelCostTrendPoint } from "@/lib/dashboard/metrics";
import { trailingBurn } from "@/lib/dashboard/overview";
import { formatCurrency } from "@/lib/utils/parse";

const CHART_HEIGHT = 260;
const HISTORY_WINDOW_MONTHS = 12;
const REFERENCE_WINDOW_MONTHS = 12;

function MonthlyTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload?: PersonnelCostTrendPoint }[];
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;

  return (
    <div className="rounded-md border border-rule bg-surface px-3 py-2 shadow-sm">
      <p className="type-mono text-muted">{row.label}</p>
      <p className="type-row mt-1 font-medium text-ink">{formatCurrency(row.total)}</p>
      <p className="type-mono mt-1 text-muted">{row.isProjected ? "Projected" : "Actual"}</p>
    </div>
  );
}

export function PersonnelCostTrendCharts({
  monthly,
  monthlyProjected,
  planningMonth,
  activeRuleCount,
}: {
  monthly: PersonnelCostTrendPoint[];
  monthlyProjected: PersonnelCostTrendPoint[];
  planningMonth: string;
  activeRuleCount: number;
}) {
  const history = monthly.slice(-HISTORY_WINDOW_MONTHS);
  const combined = [...history, ...monthlyProjected];

  if (combined.length === 0) {
    return (
      <section aria-label="Personnel cost">
        <h2 className="type-heading text-ink">Personnel cost</h2>
        <p className="type-row mt-2 text-muted">Not enough payroll data yet to chart cost over time.</p>
      </section>
    );
  }

  const { average: referenceAverage, monthsUsed: referenceMonthsUsed } = trailingBurn(
    monthly,
    planningMonth,
    REFERENCE_WINDOW_MONTHS
  );
  const anomalies =
    referenceMonthsUsed >= 3 ? flagAnomalousMonths(history, referenceAverage) : new Map<string, number>();

  const maxTotal = Math.max(...combined.map((p) => p.total), referenceAverage, 1);

  const historyLabel = `${history.length}-mo actual`;
  const projectedLabel =
    monthlyProjected.length > 0
      ? `${monthlyProjected.length}-mo projected`
      : null;

  const assumptionSentence =
    activeRuleCount === 0
      ? "Projected months assume current pay continues flat, with no active projection rules."
      : `Projected months assume current pay continues flat, adjusted by ${activeRuleCount} active projection ${activeRuleCount === 1 ? "rule" : "rules"}.`;

  return (
    <section aria-label="Personnel cost">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="type-heading text-ink">Personnel cost</h2>
        <p className="type-mono text-muted">
          {historyLabel}
          {projectedLabel && <> · {projectedLabel}</>}
        </p>
      </div>
      <p className="type-row mt-1 text-muted">
        Monthly personnel cost, actual and projected. Dotted reference line is the trailing{" "}
        {REFERENCE_WINDOW_MONTHS}-month average.
      </p>

      <div className="mt-3">
        <ChartResponsive height={CHART_HEIGHT}>
          <BarChart data={combined} margin={{ top: 12, right: 8, left: 0, bottom: 0 }}>
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
              domain={[0, maxTotal * 1.15]}
              tick={{ fontSize: 11, fill: "var(--muted)" }}
              tickFormatter={(v) => `$${(Number(v) / 1000).toFixed(0)}k`}
              width={52}
              tickCount={4}
              tickLine={false}
              axisLine={false}
            />
            <Tooltip content={<MonthlyTooltip />} />
            {referenceMonthsUsed > 0 && (
              <ReferenceLine
                y={referenceAverage}
                stroke="var(--rule-strong)"
                strokeDasharray="2 2"
                label={{
                  value: `trailing ${REFERENCE_WINDOW_MONTHS}-mo avg`,
                  position: "insideTopLeft",
                  fill: "var(--muted)",
                  fontSize: 11,
                }}
              />
            )}
            <Bar dataKey="total" maxBarSize={28} radius={[3, 3, 0, 0]} isAnimationActive={false}>
              {combined.map((point) => (
                <Cell
                  key={point.month}
                  fill={point.isProjected ? projectedFill() : "var(--accent)"}
                  stroke={point.isProjected ? "var(--accent)" : undefined}
                  strokeDasharray={point.isProjected ? PROJECTED_STROKE_DASHARRAY : undefined}
                />
              ))}
            </Bar>
            {[...anomalies.entries()].map(([month, deviation]) => {
              const point = combined.find((p) => p.month === month);
              if (!point) return null;
              return (
                <ReferenceDot
                  key={month}
                  x={point.label}
                  y={point.total * 1.05}
                  r={3}
                  fill="var(--rule-strong)"
                  stroke="var(--surface)"
                  strokeWidth={1}
                  shape={(props: { cx?: number; cy?: number }) => (
                    <circle cx={props.cx} cy={props.cy} r={3} fill="var(--rule-strong)" stroke="var(--surface)" strokeWidth={1}>
                      <title>
                        {point.label} · {deviation > 0 ? "+" : ""}
                        {Math.round(deviation * 100)}% vs trailing average
                      </title>
                    </circle>
                  )}
                />
              );
            })}
          </BarChart>
        </ChartResponsive>
      </div>

      {monthlyProjected.length > 0 && (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
          <p className="type-mono text-muted">{assumptionSentence}</p>
          <Link
            href="/projections"
            className="type-mono inline-flex min-h-11 items-center text-accent hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            Adjust →
          </Link>
        </div>
      )}
    </section>
  );
}
