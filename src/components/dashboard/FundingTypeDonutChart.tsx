"use client";

import { Cell, Pie, PieChart, Tooltip } from "recharts";
import { ChartResponsive } from "@/components/charts/ChartResponsive";
import { formatCurrency, formatMonthDisplay } from "@/lib/utils/parse";
import type { FundingMixSlice } from "@/lib/dashboard/metrics";
import { cn } from "@/lib/utils/cn";

type DonutSize = "hero" | "default" | "stacked";

const SIZE_CONFIG: Record<
  DonutSize,
  {
    chartHeightPx: number;
    chartWidthPx?: number;
    chartClassName?: string;
    innerRadius: number;
    outerRadius: number;
    legend: "full" | "compact" | "inline";
    padding: string;
    titleClass: string;
  }
> = {
  hero: {
    chartHeightPx: 272,
    innerRadius: 62,
    outerRadius: 98,
    legend: "full",
    padding: "p-5",
    titleClass: "text-base",
  },
  default: {
    chartHeightPx: 224,
    innerRadius: 52,
    outerRadius: 82,
    legend: "full",
    padding: "p-4",
    titleClass: "text-sm",
  },
  stacked: {
    chartHeightPx: 72,
    chartWidthPx: 72,
    innerRadius: 22,
    outerRadius: 34,
    legend: "inline",
    padding: "p-3",
    titleClass: "text-xs",
  },
};

function DonutLegend({
  slices,
  total,
  variant,
}: {
  slices: FundingMixSlice[];
  total: number;
  variant: "full" | "compact" | "inline";
}) {
  if (total <= 0) return null;

  if (variant === "inline") {
    return (
      <ul className="min-w-0 flex-1 space-y-0.5 text-[10px]">
        {slices.slice(0, 4).map((s) => (
          <li key={s.key} className="flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-1.5">
              <span
                className="h-1.5 w-1.5 shrink-0 rounded-full"
                style={{ backgroundColor: s.color }}
              />
              <span className="truncate text-slate-600">{s.name}</span>
            </span>
            <span className="shrink-0 font-medium tabular-nums text-slate-800">
              {((s.value / total) * 100).toFixed(0)}%
            </span>
          </li>
        ))}
        {slices.length > 4 && (
          <li className="text-slate-400">+{slices.length - 4} more</li>
        )}
      </ul>
    );
  }

  return (
    <ul
      className={cn(
        "space-y-1.5",
        variant === "compact" ? "mt-2 text-[10px]" : "mt-3 text-xs"
      )}
    >
      {slices.map((s) => (
        <li key={s.key} className="flex items-center justify-between gap-2">
          <span className="flex min-w-0 items-center gap-2">
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: s.color }}
            />
            <span className="truncate text-slate-700">{s.name}</span>
          </span>
          <span className="shrink-0 font-medium tabular-nums text-slate-900">
            {((s.value / total) * 100).toFixed(1)}%
          </span>
        </li>
      ))}
    </ul>
  );
}

export function FundingTypeDonutChart({
  title,
  subtitle,
  slices,
  size = "default",
}: {
  title: string;
  subtitle?: string;
  slices: FundingMixSlice[];
  size?: DonutSize;
}) {
  const config = SIZE_CONFIG[size];
  const total = slices.reduce((s, x) => s + x.value, 0);
  const isStacked = size === "stacked";

  if (total <= 0) {
    return (
      <section
        className={cn(
          "w-full min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm",
          config.padding,
          isStacked && "min-h-[5.5rem]"
        )}
      >
        <div className="min-w-0">
          <h3 className={cn("font-semibold text-[#0c2340]", config.titleClass)}>{title}</h3>
          {subtitle && <p className="text-[10px] text-slate-500">{subtitle}</p>}
          <p className="mt-1 text-[10px] text-slate-500">No charges this period.</p>
        </div>
      </section>
    );
  }

  return (
    <section
      className={cn(
        "w-full min-w-0 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm",
        config.padding,
        isStacked && "grid grid-cols-[4.5rem_minmax(0,1fr)] items-center gap-3"
      )}
    >
      {isStacked ? (
        <>
          <div className="flex h-[4.5rem] w-[4.5rem] shrink-0 items-center justify-center overflow-hidden">
            <ChartResponsive
              height={config.chartHeightPx}
              width={config.chartWidthPx}
            >
              <PieChart>
                <Pie
                  data={slices}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={config.innerRadius}
                  outerRadius={config.outerRadius}
                  paddingAngle={1}
                  stroke="#fff"
                  strokeWidth={1.5}
                >
                  {slices.map((s) => (
                    <Cell key={s.key} fill={s.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v) => {
                    const amount = Number(v ?? 0);
                    const pct = total > 0 ? ((amount / total) * 100).toFixed(1) : "0";
                    return `${formatCurrency(amount)} (${pct}%)`;
                  }}
                />
              </PieChart>
            </ChartResponsive>
          </div>
          <div className="min-w-0">
            <h3 className={cn("font-semibold leading-tight text-[#0c2340]", config.titleClass)}>
              {title}
            </h3>
            <p className="mt-0.5 text-[10px] font-medium text-slate-600">{formatCurrency(total)}</p>
            <DonutLegend slices={slices} total={total} variant="inline" />
          </div>
        </>
      ) : (
        <>
          <h3 className={cn("font-semibold text-[#0c2340]", config.titleClass)}>{title}</h3>
          {subtitle && <p className="text-[10px] text-slate-500">{subtitle}</p>}
          <p className="mt-1 text-xs font-medium text-slate-600">{formatCurrency(total)} total</p>
          <div className="mt-2">
            <ChartResponsive height={config.chartHeightPx} className={config.chartClassName}>
              <PieChart>
                <Pie
                  data={slices}
                  dataKey="value"
                  nameKey="name"
                  innerRadius={config.innerRadius}
                  outerRadius={config.outerRadius}
                  paddingAngle={2}
                  stroke="#fff"
                  strokeWidth={2}
                >
                  {slices.map((s) => (
                    <Cell key={s.key} fill={s.color} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v) => {
                    const amount = Number(v ?? 0);
                    const pct = total > 0 ? ((amount / total) * 100).toFixed(1) : "0";
                    return `${formatCurrency(amount)} (${pct}%)`;
                  }}
                />
              </PieChart>
            </ChartResponsive>
          </div>
          <DonutLegend slices={slices} total={total} variant={config.legend} />
        </>
      )}
    </section>
  );
}

export function FundingTypeDonutSection({
  planningMonth,
  totalSlices,
  byPersonnelType,
}: {
  planningMonth: string;
  totalSlices: FundingMixSlice[];
  byPersonnelType: { label: string; slices: FundingMixSlice[]; total: number }[];
}) {
  const monthLabel = formatMonthDisplay(planningMonth);

  return (
    <section className="space-y-4">
      <header>
        <h2 className="text-base font-semibold text-[#0c2340]">Funding type mix</h2>
        <p className="text-xs text-slate-500">
          Share of personnel charges by account type · {monthLabel} (latest actual month)
        </p>
      </header>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)] lg:items-start">
        <FundingTypeDonutChart
          title="All personnel"
          subtitle="Total planning roster"
          slices={totalSlices}
          size="hero"
        />
        <div className="flex min-w-0 flex-col gap-3">
          {byPersonnelType.map((g) => (
            <FundingTypeDonutChart key={g.label} title={g.label} slices={g.slices} size="stacked" />
          ))}
        </div>
      </div>
    </section>
  );
}
