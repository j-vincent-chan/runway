"use client";

import type { ReactElement } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Tooltip, XAxis, YAxis } from "recharts";
import { ChartResponsive } from "@/components/charts/ChartResponsive";
import type { PersonnelGroupBreakdown } from "@/lib/dashboard/metrics";
import { formatCurrency, formatMonthDisplay } from "@/lib/utils/parse";

const GROUP_CHART_HEIGHT = 220;

function CountTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload?: PersonnelGroupBreakdown }[];
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
      <p className="font-medium text-slate-800">{row.label}</p>
      <p className="mt-1 text-slate-600">
        Count: <span className="font-medium text-[#0c2340]">{row.count}</span>
      </p>
    </div>
  );
}

function CostTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload?: PersonnelGroupBreakdown }[];
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
      <p className="font-medium text-slate-800">{row.label}</p>
      <p className="mt-1 text-slate-600">
        Cost: <span className="font-medium text-[#0c2340]">{formatCurrency(row.cost)}</span>
      </p>
    </div>
  );
}

function GroupBarChart({
  rows,
  dataKey,
  tooltip,
}: {
  rows: PersonnelGroupBreakdown[];
  dataKey: "count" | "cost";
  tooltip: ReactElement;
}) {
  return (
    <ChartResponsive height={GROUP_CHART_HEIGHT}>
      <BarChart
        data={rows.map((g) => ({ ...g, axisLabel: g.shortLabel }))}
        layout="vertical"
        margin={{ top: 4, right: 16, left: 4, bottom: 4 }}
      >
        <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" horizontal={false} />
        <XAxis
          type="number"
          tick={{ fontSize: 9, fill: "#64748b" }}
          tickLine={false}
          axisLine={false}
          tickFormatter={
            dataKey === "cost" ? (v) => `$${(Number(v) / 1000).toFixed(0)}k` : undefined
          }
          allowDecimals={dataKey === "cost"}
        />
        <YAxis
          type="category"
          dataKey="axisLabel"
          width={100}
          tick={{ fontSize: 10, fill: "#475569" }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip content={tooltip} />
        <Bar dataKey={dataKey} radius={[0, 4, 4, 0]} maxBarSize={22}>
          {rows.map((g) => (
            <Cell key={g.key} fill={g.color} />
          ))}
        </Bar>
      </BarChart>
    </ChartResponsive>
  );
}

function GroupPanel({
  title,
  empty,
  rows,
  total,
  dataKey,
  totalLabel,
  valueOf,
  formatValue,
  tooltip,
}: {
  title: string;
  empty: string;
  rows: PersonnelGroupBreakdown[];
  total: number;
  dataKey: "count" | "cost";
  totalLabel: string;
  valueOf: (row: PersonnelGroupBreakdown) => number;
  formatValue: (row: PersonnelGroupBreakdown) => string;
  tooltip: ReactElement;
}) {
  return (
    <article className="flex min-w-0 flex-col">
      <h3 className="text-sm font-medium text-slate-700">{title}</h3>
      <div className="mt-2 overflow-hidden rounded-lg border border-slate-100 bg-slate-50/50 p-3">
        {rows.length === 0 || total <= 0 ? (
          <p className="text-xs text-slate-500">{empty}</p>
        ) : (
          <>
            <p className="mb-2 text-xs text-slate-600">
              <span className="font-semibold tabular-nums text-[#0c2340]">{totalLabel}</span>
            </p>
            <GroupBarChart rows={rows} dataKey={dataKey} tooltip={tooltip} />
            <ul className="mt-2 space-y-1 border-t border-slate-100 pt-2">
              {rows.map((g) => (
                <li key={g.key} className="flex items-center justify-between gap-2 text-[11px]">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <span
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ backgroundColor: g.color }}
                    />
                    <span className="truncate text-slate-600">{g.label}</span>
                  </span>
                  <span className="shrink-0 font-medium tabular-nums text-slate-800">
                    {formatValue(g)}
                    <span className="ml-1 font-normal text-slate-400">
                      ({total > 0 ? ((valueOf(g) / total) * 100).toFixed(0) : 0}%)
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
    </article>
  );
}

export function PersonnelByGroupSection({
  groupBreakdown,
  planningMonth,
}: {
  groupBreakdown: PersonnelGroupBreakdown[];
  planningMonth: string;
}) {
  const monthLabel = formatMonthDisplay(planningMonth);
  const countRows = [...groupBreakdown].filter((g) => g.count > 0).sort((a, b) => b.count - a.count);
  const costRows = [...groupBreakdown].filter((g) => g.cost > 0).sort((a, b) => b.cost - a.cost);
  const totalCount = countRows.reduce((s, g) => s + g.count, 0);
  const totalCost = costRows.reduce((s, g) => s + g.cost, 0);

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <header className="mb-4 flex items-baseline justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-[#0c2340]">By personnel group</h2>
          <p className="text-xs text-slate-500">
            Headcount and cost for the active planning roster. Completes the picture with funding
            mix by group below.
          </p>
        </div>
        <p className="shrink-0 text-[10px] text-slate-500">{monthLabel}</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
        <GroupPanel
          title="Personnel count"
          empty="No active personnel this month."
          rows={countRows}
          total={totalCount}
          dataKey="count"
          totalLabel={`${totalCount} active`}
          valueOf={(g) => g.count}
          formatValue={(g) => String(g.count)}
          tooltip={<CountTooltip />}
        />
        <GroupPanel
          title="Personnel cost"
          empty="No personnel cost this month."
          rows={costRows}
          total={totalCost}
          dataKey="cost"
          totalLabel={`${formatCurrency(totalCost)} total`}
          valueOf={(g) => g.cost}
          formatValue={(g) => formatCurrency(g.cost)}
          tooltip={<CostTooltip />}
        />
      </div>
    </section>
  );
}
