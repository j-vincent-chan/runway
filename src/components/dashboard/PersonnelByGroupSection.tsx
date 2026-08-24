"use client";

import type { ReactElement } from "react";
import { Bar, BarChart, Tooltip, XAxis, YAxis } from "recharts";
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
    <div className="rounded-md border border-rule bg-surface px-3 py-2 shadow-sm">
      <p className="type-mono text-muted">{row.label}</p>
      <p className="type-row mt-1 font-medium text-ink">{row.count}</p>
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
    <div className="rounded-md border border-rule bg-surface px-3 py-2 shadow-sm">
      <p className="type-mono text-muted">{row.label}</p>
      <p className="type-row mt-1 font-medium text-ink">{formatCurrency(row.cost)}</p>
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
        <XAxis
          type="number"
          tick={{ fontSize: 11, fill: "var(--muted)" }}
          tickLine={false}
          axisLine={{ stroke: "var(--rule)" }}
          tickFormatter={
            dataKey === "cost" ? (v) => `$${(Number(v) / 1000).toFixed(0)}k` : undefined
          }
          allowDecimals={dataKey === "cost"}
        />
        <YAxis
          type="category"
          dataKey="axisLabel"
          width={100}
          tick={{ fontSize: 11, fill: "var(--ink-2)" }}
          tickLine={false}
          axisLine={false}
        />
        <Tooltip content={tooltip} />
        <Bar dataKey={dataKey} fill="var(--accent)" radius={[0, 3, 3, 0]} maxBarSize={22} isAnimationActive={false} />
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
      <h3 className="type-row font-medium text-ink-2">{title}</h3>
      {rows.length === 0 || total <= 0 ? (
        <p className="type-row mt-2 text-muted">{empty}</p>
      ) : (
        <>
          <p className="type-stat mt-1 text-ink">{totalLabel}</p>
          <div className="mt-2">
            <GroupBarChart rows={rows} dataKey={dataKey} tooltip={tooltip} />
          </div>
          <ul className="mt-2 space-y-1 border-t border-rule pt-2">
            {rows.map((g) => (
              <li key={g.key} className="type-row flex items-center justify-between gap-2 text-ink-2">
                <span className="min-w-0 truncate">{g.label}</span>
                <span className="shrink-0 font-medium tabular-nums text-ink">
                  {formatValue(g)}
                  <span className="type-mono ml-1 text-muted">
                    ({total > 0 ? ((valueOf(g) / total) * 100).toFixed(0) : 0}%)
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
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
    <section aria-label="Personnel by group">
      <div className="flex items-baseline justify-between gap-2">
        <div>
          <h2 className="type-heading text-ink">By personnel group</h2>
          <p className="type-row mt-1 text-muted">
            Headcount and cost for the active planning roster. Completes the picture with funding
            mix by group below.
          </p>
        </div>
        <p className="type-mono shrink-0 text-muted">{monthLabel}</p>
      </div>

      <div className="mt-4 grid gap-6 lg:grid-cols-2 lg:items-start">
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
