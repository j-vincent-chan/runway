"use client";

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartResponsive } from "@/components/charts/ChartResponsive";
import type { PersonnelCostTrendPoint, YearlyCostPoint } from "@/lib/dashboard/metrics";
import { formatCurrency } from "@/lib/utils/parse";

const COST_CHART_HEIGHT = 208;
const HEADCOUNT_CHART_HEIGHT = 84;

const HEADCOUNT_COLOR = "#d97706";
const COST_COLOR = "#00778b";

type TrendRow = {
  label: string;
  total: number;
  headcount: number;
  actual?: number;
  projected?: number;
};

function CostTooltip({
  active,
  payload,
  labelPrefix,
}: {
  active?: boolean;
  payload?: { payload?: TrendRow }[];
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
            YTD: <span className="font-medium text-[#0c2340]">{formatCurrency(row.actual ?? 0)}</span>
          </p>
          <p>
            Projected:{" "}
            <span className="font-medium text-sky-700">{formatCurrency(row.projected ?? 0)}</span>
          </p>
          <p className="border-t border-slate-100 pt-1">
            Est. full year:{" "}
            <span className="font-medium text-[#0c2340]">{formatCurrency(row.total)}</span>
          </p>
        </div>
      ) : (
        <p className="mt-1 text-slate-600">
          Cost: <span className="font-medium text-[#0c2340]">{formatCurrency(row.total)}</span>
        </p>
      )}
    </div>
  );
}

function HeadcountTooltip({
  active,
  payload,
  labelPrefix,
}: {
  active?: boolean;
  payload?: { payload?: TrendRow }[];
  labelPrefix?: string;
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  const prefix = labelPrefix ? `${labelPrefix} ` : "";
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
      <p className="font-medium text-slate-800">
        {prefix}
        {row.label}
      </p>
      <p className="mt-1 text-slate-600">
        Personnel: <span className="font-medium text-amber-700">{row.headcount}</span>
      </p>
    </div>
  );
}

function sharedHeadcountDomain(monthly: TrendRow[], yearly: TrendRow[]): [number, number] {
  const values = [...monthly, ...yearly].map((d) => d.headcount);
  if (values.length === 0) return [0, 1];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const pad = 1;
  return [Math.max(0, min - pad), max + pad];
}

function headcountAxisTicks(domain: [number, number]): number[] {
  const [lo, hi] = domain;
  const start = Math.max(0, Math.ceil(lo));
  const end = Math.floor(hi);
  if (end < start) return [start];
  const ticks: number[] = [];
  for (let n = start; n <= end; n++) ticks.push(n);
  return ticks;
}

function StackedTrendPanel({
  title,
  data,
  variant,
  labelPrefix,
  headcountDomain,
  headcountTicks,
}: {
  title: string;
  data: TrendRow[];
  variant: "monthly" | "yearly";
  labelPrefix?: string;
  headcountDomain: [number, number];
  headcountTicks: number[];
}) {
  const xInterval = variant === "monthly" ? ("preserveStartEnd" as const) : undefined;

  return (
    <article className="flex flex-col">
      <h3 className="text-sm font-medium text-slate-700">{title}</h3>
      <div className="mt-2 flex flex-col overflow-hidden rounded-lg border border-slate-100 bg-slate-50/40">
        {/* Cost — primary */}
        <div className="bg-white px-1 pt-1">
          <ChartResponsive height={COST_CHART_HEIGHT}>
            {variant === "monthly" ? (
              <LineChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="label" hide />
                <YAxis
                  tick={{ fontSize: 10, fill: "#64748b" }}
                  tickFormatter={(v) => `$${(Number(v) / 1000).toFixed(0)}k`}
                  width={48}
                />
                <Tooltip content={<CostTooltip labelPrefix={labelPrefix} />} />
                <Line
                  type="monotone"
                  dataKey="total"
                  stroke={COST_COLOR}
                  strokeWidth={2.5}
                  dot={{ r: 2, fill: COST_COLOR }}
                  activeDot={{ r: 4 }}
                />
              </LineChart>
            ) : (
              <BarChart
                data={data}
                margin={{ top: 8, right: 12, left: 0, bottom: 0 }}
                barCategoryGap="36%"
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
                <XAxis dataKey="label" hide />
                <YAxis
                  tick={{ fontSize: 10, fill: "#64748b" }}
                  tickFormatter={(v) => `$${(Number(v) / 1000).toFixed(0)}k`}
                  width={48}
                />
                <Tooltip content={<CostTooltip labelPrefix={labelPrefix} />} />
                <Bar
                  stackId="yearCost"
                  dataKey="actual"
                  name="YTD"
                  fill="#0c2340"
                  maxBarSize={48}
                />
                <Bar
                  stackId="yearCost"
                  dataKey="projected"
                  name="Projected"
                  fill="#7dd3fc"
                  stroke="#0ea5e9"
                  strokeWidth={1}
                  maxBarSize={48}
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            )}
          </ChartResponsive>
        </div>

        {/* Headcount — compact strip */}
        <div className="border-t border-slate-200 bg-amber-50/30">
          <p className="px-3 pt-1.5 text-[10px] font-medium uppercase tracking-wide text-amber-800/80">
            Personnel count
          </p>
          <div className="px-1 pb-1">
            <ChartResponsive height={HEADCOUNT_CHART_HEIGHT}>
              <LineChart data={data} margin={{ top: 2, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#fde68a" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 9, fill: "#64748b" }}
                  interval={xInterval}
                  tickLine={false}
                  axisLine={{ stroke: "#e2e8f0" }}
                />
                <YAxis
                  domain={headcountDomain}
                  ticks={headcountTicks}
                  allowDecimals={false}
                  tick={{ fontSize: 9, fill: HEADCOUNT_COLOR }}
                  width={28}
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip content={<HeadcountTooltip labelPrefix={labelPrefix} />} />
                <Line
                  type="stepAfter"
                  dataKey="headcount"
                  stroke={HEADCOUNT_COLOR}
                  strokeWidth={1.75}
                  dot={false}
                  activeDot={{ r: 2.5, fill: HEADCOUNT_COLOR }}
                />
              </LineChart>
            </ChartResponsive>
          </div>
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
  const monthlyRows: TrendRow[] = monthly.map((m) => ({
    label: m.label,
    total: m.total,
    headcount: m.headcount,
  }));

  const yearlyRows: TrendRow[] = yearly.map((y) => ({
    label: String(y.year),
    total: y.total,
    actual: y.actual,
    projected: y.projected,
    headcount: y.headcount,
  }));

  const hasYearProjection = yearly.some((y) => y.projected > 0);

  const headcountDomain = useMemo(
    () => sharedHeadcountDomain(monthlyRows, yearlyRows),
    [monthlyRows, yearlyRows]
  );
  const headcountTicks = useMemo(() => headcountAxisTicks(headcountDomain), [headcountDomain]);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <header className="mb-4">
        <h2 className="text-base font-semibold text-[#0c2340]">Personnel cost trend</h2>
        <p className="text-xs text-slate-500">
          Salary + benefits for active planning roster (excludes hidden and alumni). Personnel count
          follows start and end dates from Employees when set; otherwise uses payroll activity.
        </p>
      </header>
      <div className="grid gap-6 lg:grid-cols-2">
        <StackedTrendPanel
          title="Monthly"
          data={monthlyRows}
          variant="monthly"
          headcountDomain={headcountDomain}
          headcountTicks={headcountTicks}
        />
        <div className="flex flex-col">
          <StackedTrendPanel
            title="Yearly"
            data={yearlyRows}
            variant="yearly"
            labelPrefix="Calendar"
            headcountDomain={headcountDomain}
            headcountTicks={headcountTicks}
          />
          {hasYearProjection && (
            <p className="mt-1.5 flex flex-wrap items-center gap-3 text-[10px] text-slate-500">
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-sm bg-[#0c2340]" />
                YTD actual
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-sm border border-sky-500 bg-sky-300" />
                Projected to Dec (avg of months to date)
              </span>
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
