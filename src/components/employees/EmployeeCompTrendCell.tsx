"use client";

import { useMemo, useState } from "react";
import type { Employee, PayrollReportSnapshot } from "@/types";
import { getEmployeeCompTrend, getYearlyCompBreakdown } from "@/lib/calculations";
import { CompSparkline } from "@/components/employees/CompSparkline";
import { EmployeeCompTrendDialog } from "@/components/employees/EmployeeCompTrendDialog";

function changeFromFirstToLast(values: number[]): { pct: number; rising: boolean | null } {
  const first = values[0];
  const last = values[values.length - 1];
  if (first == null || last == null || Math.abs(first) < 0.5) {
    return { pct: 0, rising: null };
  }
  const pct = ((last - first) / first) * 100;
  if (Math.abs(last - first) < 0.5) return { pct: 0, rising: null };
  return { pct, rising: last > first };
}

export function EmployeeCompTrendCell({
  employee,
  snapshot,
}: {
  employee: Employee;
  snapshot: PayrollReportSnapshot;
}) {
  const [open, setOpen] = useState(false);
  const trend = useMemo(
    () => getEmployeeCompTrend(employee.id, snapshot),
    [employee.id, snapshot]
  );
  const values = useMemo(() => {
    const series = trend.monthly.map((p) => p.yearlyTotal);
    if (series.length > 0) return series;
    const { yearlyTotal } = getYearlyCompBreakdown(employee.id, snapshot);
    return yearlyTotal > 0 ? [yearlyTotal] : [];
  }, [trend.monthly, employee.id, snapshot]);
  const { pct, rising } = changeFromFirstToLast(values);

  if (values.length === 0) {
    return <span className="text-slate-400">—</span>;
  }

  const deltaLabel =
    values.length < 2 || rising === null
      ? "No change"
      : `${rising ? "+" : ""}${pct.toFixed(1)}%`;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group flex min-w-[8.5rem] flex-col items-start gap-0.5 rounded-md px-0.5 py-0.5 text-left hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500/50"
        title="Open yearly compensation trend"
      >
        <CompSparkline values={values} rising={rising} />
        <span
          className={
            rising === true
              ? "text-[10px] font-medium text-teal-800"
              : rising === false
                ? "text-[10px] font-medium text-red-700"
                : "text-[10px] text-slate-500"
          }
        >
          {deltaLabel}
          {values.length >= 2 ? " vs first month" : ""}
        </span>
      </button>
      <EmployeeCompTrendDialog
        employee={employee}
        snapshot={snapshot}
        trend={trend}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
