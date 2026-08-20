"use client";

import type { Employee, PayrollReportSnapshot } from "@/types";
import { getYearlyCompBreakdown } from "@/lib/calculations";
import {
  detectPayFrequency,
  formatCurrency,
  formatHourlyRate,
  formatMonthDisplay,
} from "@/lib/utils/parse";

export function EmployeeYearlyCompCell({
  employee,
  snapshot,
}: {
  employee: Employee;
  snapshot: PayrollReportSnapshot;
}) {
  const payFrequency =
    employee.payFrequency ??
    (employee.compensationType ? detectPayFrequency(employee.compensationType) : undefined);

  const { month, yearlySalary, yearlyTotal, hourlyRate } = getYearlyCompBreakdown(
    employee.id,
    snapshot,
    payFrequency
  );

  if (yearlyTotal <= 0 && yearlySalary <= 0) {
    return <span className="text-slate-400">—</span>;
  }

  return (
    <div
      className="flex flex-col gap-0.5 tabular-nums"
      title={`12 × ${formatMonthDisplay(month)} payroll${
        employee.compensationType ? ` · ${employee.compensationType}` : ""
      }`}
    >
      <span className="font-semibold text-[#0c2340]">
        {yearlySalary > 0 ? formatCurrency(yearlySalary) : "—"}
      </span>
      {yearlyTotal > 0 && (
        <span className="text-[11px] text-slate-500">
          {formatCurrency(yearlyTotal)} S+B
        </span>
      )}
      {hourlyRate != null && hourlyRate > 0 && (
        <span className="text-[10px] text-slate-400">{formatHourlyRate(hourlyRate)}</span>
      )}
    </div>
  );
}
