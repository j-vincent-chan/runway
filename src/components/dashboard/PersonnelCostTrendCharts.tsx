"use client";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartResponsive } from "@/components/charts/ChartResponsive";
import type { PersonnelCostTrendPoint, YearlyCostPoint } from "@/lib/dashboard/metrics";
import { formatCurrency } from "@/lib/utils/parse";

const CHART_HEIGHT = 260;

const COST_COLOR = "#00778b";
const ACTUAL_COLOR = "#0c2340";
const PROJECTED_COLOR = "#7dd3fc";
const HEADCOUNT_COLOR = "#d97706";

type ComboRow = {
  label: string;
  total: number;
  actual?: number;
  projected?: number;
  headcount: number;
};

function ComboTooltip({
  active,
  payload,
  labelPrefix,
}: {
  active?: boolean;
  payload?: { payload?: ComboRow }[];
  labelPrefix?: string;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  const prefix = labelPrefix ? `${labelPrefix} ` : "";
  const hasProjection = (row.projected ?? 0) > 0;

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
      <p className="font-medium text-slate-800">
        {prefix}
        {row.label}
      </p>
      {hasProjection ? (
        <div className="mt-1 space-y-0.5 text-slate-600">
          <p>
            Actuals (YTD):{" "}
            <span className="font-medium text-[#0c2340]">{formatCurrency(row.actual ?? 0)}</span>
          </p>
          <p>
            Projected remaining:{" "}
            <span className="font-medium text-sky-700">{formatCurrency(row.projected ?? 0)}</span>
          </p>
          <p>
            Est. full year:{" "}
            <span className="font-medium text-[#0c2340]">{formatCurrency(row.total)}</span>
          </p>
        </div>
      ) : (
        <p className="mt-1 text-slate-600">
          Cost: <span className="font-medium text-[#0c2340]">{formatCurrency(row.total)}</span>
        </p>
      )}
      <p className="mt-0.5 text-slate-600">
        Headcount: <span className="font-medium text-amber-700">{row.headcount}</span>
      </p>
    </div>
  );
}

function headcountDomain(rows: ComboRow[]): [number, number] {
  if (rows.length === 0) return [0, 1];
  const values = rows.map((d) => d.headcount);
  const min = Math.min(...values);
  const max = Math.max(...values);
  return [Math.max(0, min - 1), Math.max(max + 1, 1)];
}

function headcountTicks(domain: [number, number]): number[] {
  const [lo, hi] = domain;
  const start = Math.max(0, Math.ceil(lo));
  const end = Math.floor(hi);
  if (end < start) return [start];
  const span = end - start;
  const step = span > 8 ? Math.ceil(span / 6) : 1;
  const ticks: number[] = [];
  for (let n = start; n <= end; n += step) ticks.push(n);
  if (ticks[ticks.length - 1] !== end) ticks.push(end);
  return ticks;
}

function ComboPanel({
  title,
  data,
  variant,
  labelPrefix,
}: {
  title: string;
  data: ComboRow[];
  variant: "monthly" | "yearly";
  labelPrefix?: string;
}) {
  const xInterval = variant === "monthly" ? ("preserveStartEnd" as const) : undefined;
  const hasAnyProjection = data.some((d) => (d.projected ?? 0) > 0);
  const countDomain = headcountDomain(data);
  const countTicks = headcountTicks(countDomain);

  return (
    <article className="flex flex-col">
      <h3 className="text-sm font-medium text-slate-700">{title}</h3>
      <div className="mt-2 overflow-hidden rounded-lg border border-slate-100 bg-white">
        <div className="px-1 pt-1 pb-1">
          <ChartResponsive height={CHART_HEIGHT}>
            <ComposedChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 9, fill: "#64748b" }}
                interval={xInterval}
                tickLine={false}
                axisLine={{ stroke: "#e2e8f0" }}
              />
              <YAxis
                yAxisId="cost"
                tick={{ fontSize: 10, fill: "#64748b" }}
                tickFormatter={(v) => `$${(Number(v) / 1000).toFixed(0)}k`}
                width={48}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                yAxisId="headcount"
                orientation="right"
                domain={countDomain}
                ticks={countTicks}
                allowDecimals={false}
                tick={{ fontSize: 9, fill: HEADCOUNT_COLOR }}
                width={28}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip content={<ComboTooltip labelPrefix={labelPrefix} />} />
              {hasAnyProjection && (
                <Legend
                  verticalAlign="top"
                  align="right"
                  height={24}
                  iconSize={8}
                  wrapperStyle={{ fontSize: 10, color: "#64748b" }}
                />
              )}
              {variant === "yearly" ? (
                <>
                  <Bar
                    yAxisId="cost"
                    dataKey="actual"
                    name="Actuals"
                    stackId="cost"
                    fill={ACTUAL_COLOR}
                    maxBarSize={48}
                    radius={hasAnyProjection ? [0, 0, 0, 0] : [4, 4, 0, 0]}
                  />
                  <Bar
                    yAxisId="cost"
                    dataKey="projected"
                    name="Projected"
                    stackId="cost"
                    fill={PROJECTED_COLOR}
                    maxBarSize={48}
                    radius={[4, 4, 0, 0]}
                  />
                </>
              ) : (
                <Bar
                  yAxisId="cost"
                  dataKey="total"
                  name="Personnel cost"
                  fill={COST_COLOR}
                  maxBarSize={28}
                  radius={[3, 3, 0, 0]}
                />
              )}
              <Line
                yAxisId="headcount"
                type="monotone"
                dataKey="headcount"
                name="Headcount"
                stroke={HEADCOUNT_COLOR}
                strokeWidth={2.25}
                dot={{ r: 2.5, fill: HEADCOUNT_COLOR, strokeWidth: 0 }}
                activeDot={{ r: 4, fill: HEADCOUNT_COLOR }}
              />
            </ComposedChart>
          </ChartResponsive>
        </div>
      </div>
    </article>
  );
}

export function PersonnelCostTrendCharts({
  monthly,
  yearly,
}: {
  monthly: PersonnelCostTrendPoint[];
  yearly: YearlyCostPoint[];
}) {
  const monthlyRows: ComboRow[] = monthly.map((m) => ({
    label: m.label,
    total: m.total,
    headcount: m.headcount,
  }));

  const yearlyRows: ComboRow[] = yearly.map((y) => ({
    label: String(y.year),
    total: y.total,
    actual: y.actual,
    projected: y.projected,
    headcount: y.headcount,
  }));

  const hasProjection = yearlyRows.some((y) => (y.projected ?? 0) > 0);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <header className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-base font-semibold text-[#0c2340]">Personnel cost &amp; headcount</h2>
          <p className="text-xs text-slate-500">
            Cost as bars, team size as a line — so you can see whether spend is moving with roster
            size.
          </p>
        </div>
        <ul className="flex flex-wrap items-center gap-3 text-[10px] text-slate-500">
          <li className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: COST_COLOR }} />
            Personnel cost
          </li>
          <li className="flex items-center gap-1.5">
            <span className="h-0.5 w-3 rounded-full" style={{ backgroundColor: HEADCOUNT_COLOR }} />
            Headcount
          </li>
        </ul>
      </header>
      <div className="grid gap-6 lg:grid-cols-2">
        <ComboPanel title="Monthly" data={monthlyRows} variant="monthly" />
        <div className="flex flex-col">
          <ComboPanel title="Yearly" data={yearlyRows} variant="yearly" labelPrefix="Calendar" />
          <p className="mt-1.5 text-[10px] text-slate-500">
            {hasProjection
              ? "Current year stacks actuals to date with projected remaining months (avg monthly cost × months left). Headcount is the latest month in each year."
              : "Calendar-year totals from available payroll months. Headcount is the latest month in each year."}
          </p>
        </div>
      </div>
    </section>
  );
}
