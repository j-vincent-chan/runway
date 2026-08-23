"use client";

import { Bar, CartesianGrid, ComposedChart, Tooltip, XAxis, YAxis } from "recharts";
import { ChartResponsive } from "@/components/charts/ChartResponsive";
import type { PersonnelCostTrendPoint } from "@/lib/dashboard/metrics";
import { formatCurrency } from "@/lib/utils/parse";

const CHART_HEIGHT = 260;

const COST_COLOR = "#00778b";

type MonthlyRow = {
  label: string;
  total: number;
};

function MonthlyTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload?: MonthlyRow }[];
}) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;

  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
      <p className="font-medium text-slate-800">{row.label}</p>
      <p className="mt-1 text-slate-600">
        Cost: <span className="font-medium text-[#0c2340]">{formatCurrency(row.total)}</span>
      </p>
    </div>
  );
}

export function PersonnelCostTrendCharts({ monthly }: { monthly: PersonnelCostTrendPoint[] }) {
  const rows: MonthlyRow[] = monthly.map((m) => ({ label: m.label, total: m.total }));

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <header className="mb-4">
        <h2 className="text-base font-semibold text-[#0c2340]">Personnel cost</h2>
        <p className="text-xs text-slate-500">Monthly personnel cost, actual and projected.</p>
      </header>
      <div className="overflow-hidden rounded-lg border border-slate-100 bg-white">
        <div className="px-1 pt-1 pb-1">
          <ChartResponsive height={CHART_HEIGHT}>
            <ComposedChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 9, fill: "#64748b" }}
                interval="preserveStartEnd"
                tickLine={false}
                axisLine={{ stroke: "#e2e8f0" }}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "#64748b" }}
                tickFormatter={(v) => `$${(Number(v) / 1000).toFixed(0)}k`}
                width={48}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip content={<MonthlyTooltip />} />
              <Bar
                dataKey="total"
                name="Personnel cost"
                fill={COST_COLOR}
                maxBarSize={28}
                radius={[3, 3, 0, 0]}
              />
            </ComposedChart>
          </ChartResponsive>
        </div>
      </div>
      <p className="mt-1.5 text-[10px] text-slate-500">
        Payroll reports cover a fiscal year, so the series starts at the FY start month (July by
        default).
      </p>
    </section>
  );
}
