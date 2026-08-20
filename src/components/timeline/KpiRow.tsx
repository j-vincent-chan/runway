"use client";

import { useApp } from "@/context/AppContext";
import { computeKpis } from "@/lib/calculations";
import { formatCurrency } from "@/lib/utils/parse";
import { DollarSign, CheckCircle, AlertCircle, Calendar, UserX, TrendingUp } from "lucide-react";

const KPI_CARD_CLASS =
  "min-w-[12.5rem] flex-none rounded-xl border border-slate-200 bg-white p-3 shadow-sm";

export function KpiRow() {
  const { snapshot, allocations, settings } = useApp();
  if (!snapshot) return null;
  const k = computeKpis(snapshot, allocations, settings);

  const cards = [
    {
      label: "Employees Fully Covered",
      value: `${k.fullyCovered} of ${k.employeeCount}`,
      icon: CheckCircle,
      color: "text-emerald-600",
    },
    {
      label: "Employees With Gaps",
      value: `${k.withGaps} of ${k.employeeCount}`,
      icon: AlertCircle,
      color: "text-amber-600",
    },
    {
      label: "Support Ending in 90 Days",
      value: `${k.supportEnding} employees`,
      icon: Calendar,
      color: "text-violet-600",
    },
    {
      label: "Overallocated This Month",
      value: `${k.overallocated} employees`,
      icon: UserX,
      color: "text-red-600",
    },
    {
      label: "Total Monthly Salary + Benefits",
      value: formatCurrency(k.totalMonthly),
      sub: `Planning estimate · ${k.currentMonth}`,
      icon: DollarSign,
    },
    {
      label: "FY Projected Personnel Cost",
      value: formatCurrency(k.fyCost),
      sub: "Planning estimate",
      icon: TrendingUp,
    },
  ];

  return (
    <div className="flex flex-wrap gap-3">
      {cards.map((c) => (
        <div key={c.label} className={KPI_CARD_CLASS}>
          <div className="flex items-start justify-between gap-2">
            <p className="text-[10px] font-medium uppercase leading-snug tracking-wide text-slate-500">
              {c.label}
            </p>
            <c.icon className={`h-4 w-4 shrink-0 ${c.color ?? "text-teal-600"}`} />
          </div>
          <p className="mt-1 text-lg font-semibold tabular-nums text-[#0c2340]">{c.value}</p>
          {c.sub && <p className="text-[10px] text-slate-400">{c.sub}</p>}
        </div>
      ))}
    </div>
  );
}
