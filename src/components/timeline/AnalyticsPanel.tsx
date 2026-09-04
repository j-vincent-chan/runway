"use client";

import { useMemo } from "react";
import { PanelRightClose } from "lucide-react";
import { useApp } from "@/context/AppContext";
import {
  calculateEmployeeCoverage,
  detectFundingCliffs,
  getAllMonths,
  calculateMonthlyCost,
} from "@/lib/calculations";
import { coverageOptionsFromSettings } from "@/lib/funding/visibility";
import { filterEmployeesForPlanning } from "@/lib/employees/roster";
import { PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, Tooltip } from "recharts";
import { ChartResponsive } from "@/components/charts/ChartResponsive";
import { formatCurrency, formatMonthDisplay } from "@/lib/utils/parse";
import { GapsAlertsPanel } from "@/components/timeline/GapsAlertsPanel";

const COVERAGE_CHART_HEIGHT = 144;
const COST_TREND_CHART_HEIGHT = 112;

export function AnalyticsPanel() {
  const { snapshot, allocations, settings, updateSettings } = useApp();

  const data = useMemo(() => {
    if (!snapshot) return null;
    const current = snapshot.actualMonths.sort().pop() ?? getAllMonths(snapshot).pop() ?? "";
    let fully = 0, under = 0, over = 0;
    const planningEmployees = filterEmployeesForPlanning(snapshot.employees, settings);
    for (const emp of planningEmployees) {
      const opts = coverageOptionsFromSettings(emp, settings);
      const c = calculateEmployeeCoverage(emp, current, allocations, opts);
      if (c.status === "fullyCovered") fully++;
      else if (c.status === "underallocated") under++;
      else if (c.status === "overallocated") over++;
    }
    const coverage = [
      { name: "Fully covered", value: fully, color: "#059669" },
      { name: "Underallocated", value: under, color: "#d97706" },
      { name: "Overallocated", value: over, color: "#dc2626" },
    ].filter((x) => x.value > 0);

    const months = getAllMonths(snapshot);
    const cliffs = planningEmployees
      .flatMap((e) =>
        detectFundingCliffs(e, allocations, months, undefined, coverageOptionsFromSettings(e, settings))
      )
      .sort((a, b) => b.dropPercent - a.dropPercent)
      .slice(0, 5);

    const costTrend = months.map((m) => ({
      month: formatMonthDisplay(m),
      total: planningEmployees.reduce(
        (s, e) => s + calculateMonthlyCost(e.id, m, snapshot.monthlyCosts).total,
        0
      ),
    }));

    return { coverage, cliffs, costTrend, current };
  }, [snapshot, allocations, settings]);

  if (!snapshot || !data || settings.analyticsPanelHidden) return null;

  return (
    <aside className="sticky top-0 z-10 w-72 shrink-0 self-start border-l border-rule bg-inset/50 p-4">
      <div className="space-y-4">
      <div className="-mt-1 mb-1 flex items-center justify-between">
        <h2 className="text-[10px] font-semibold uppercase tracking-wider text-muted">
          Insights
        </h2>
        <button
          type="button"
          className="rounded-md p-1 text-muted hover:bg-surface hover:text-ink"
          aria-label="Hide insights"
          title="Hide insights panel"
          onClick={() => updateSettings({ analyticsPanelHidden: true })}
        >
          <PanelRightClose className="h-4 w-4" />
        </button>
      </div>
      <GapsAlertsPanel />
      <div className="rounded-xl border bg-surface p-3 shadow-sm">
        <h3 className="text-sm font-semibold text-ink">Coverage summary</h3>
        <p className="text-[10px] text-muted">Current month · planning estimate</p>
        <div className="mt-2">
          <ChartResponsive height={COVERAGE_CHART_HEIGHT}>
            <PieChart>
              <Pie data={data.coverage} dataKey="value" innerRadius={35} outerRadius={55} paddingAngle={2}>
                {data.coverage.map((e, i) => (
                  <Cell key={i} fill={e.color} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ChartResponsive>
        </div>
        <ul className="mt-2 space-y-1 text-xs">
          {data.coverage.map((c) => (
            <li key={c.name} className="flex justify-between">
              <span>{c.name}</span>
              <span className="font-medium">{c.value}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-xl border bg-surface p-3 shadow-sm">
        <h3 className="text-sm font-semibold text-ink">Top upcoming funding cliffs</h3>
        <ul className="mt-2 space-y-2 text-xs">
          {data.cliffs.length === 0 && <li className="text-muted">None detected at default threshold.</li>}
          {data.cliffs.map((c) => (
            <li key={c.id} className="border-b border-rule pb-2 last:border-0">
              <span className="font-medium">{c.employeeName}</span>
              <p className="text-ink-2">{c.dropPercent.toFixed(0)}% drop after {formatMonthDisplay(c.fromMonth)}</p>
            </li>
          ))}
        </ul>
      </div>

      <div className="rounded-xl border bg-surface p-3 shadow-sm">
        <h3 className="text-sm font-semibold text-ink">Monthly cost</h3>
        <p className="text-[10px] text-muted">Salary + benefits</p>
        <div className="mt-2">
          <ChartResponsive height={COST_TREND_CHART_HEIGHT}>
            <LineChart data={data.costTrend}>
              <XAxis dataKey="month" tick={{ fontSize: 9 }} />
              <YAxis tick={{ fontSize: 9 }} tickFormatter={(v) => `$${(Number(v) / 1000).toFixed(0)}k`} />
              <Tooltip formatter={(v) => formatCurrency(Number(v))} />
              <Line type="monotone" dataKey="total" stroke="#00778b" strokeWidth={2} dot={false} />
            </LineChart>
          </ChartResponsive>
        </div>
      </div>

      <p className="text-[10px] text-muted">
        Planning estimates only. Confirm allowability with your finance/post-award analyst.
      </p>
      </div>
    </aside>
  );
}
