"use client";

import { useMemo, useState } from "react";
import type { AppSettings, Employee, PayrollReportSnapshot } from "@/types";
import { getEmployeeCompTrend, getYearlyCompBreakdown } from "@/lib/calculations";
import { CompSparkline } from "@/components/employees/CompSparkline";
import { EmployeeCompTrendDialog } from "@/components/employees/EmployeeCompTrendDialog";
import { resolveEmployeeProfile } from "@/lib/employees/stableKey";

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
  settings,
}: {
  employee: Employee;
  snapshot: PayrollReportSnapshot;
  settings: AppSettings;
}) {
  const [open, setOpen] = useState(false);
  const profile = resolveEmployeeProfile(settings, employee);
  const offer = profile?.offerLetter;
  const trend = useMemo(
    () =>
      getEmployeeCompTrend(employee.id, snapshot, {
        offerStartDate: offer?.extractedStartDate ?? profile?.startDate,
        startingSalaryAnnual: offer?.extractedStartingSalary,
      }),
    [employee.id, snapshot, offer?.extractedStartDate, offer?.extractedStartingSalary, profile?.startDate]
  );
  const values = useMemo(() => {
    const series = trend.monthly.map((p) => p.yearlyTotal);
    if (series.length > 0) return series;
    const { yearlyTotal } = getYearlyCompBreakdown(employee.id, snapshot);
    return yearlyTotal > 0 ? [yearlyTotal] : [];
  }, [trend.monthly, employee.id, snapshot]);
  const { pct, rising } = changeFromFirstToLast(values);

  if (values.length === 0) {
    return <span className="text-muted">—</span>;
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
        className="group flex min-w-[8.5rem] flex-col items-start gap-0.5 rounded-md px-0.5 py-0.5 text-left hover:bg-inset focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
        title="Open yearly compensation trend"
      >
        <CompSparkline values={values} rising={rising} />
        <span
          className={
            rising === true
              ? "text-[10px] font-medium text-accent"
              : rising === false
                ? "text-[10px] font-medium text-critical"
                : "text-[10px] text-muted"
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
