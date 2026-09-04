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

  const hasFyRate = (employee.annualSalary ?? 0) > 0;

  if (yearlyTotal <= 0 && yearlySalary <= 0 && !hasFyRate) {
    return <span className="text-muted">—</span>;
  }

  return (
    <div
      className="flex flex-col gap-0.5 tabular-nums"
      title={`12 × ${formatMonthDisplay(month)} payroll${
        employee.compensationType ? ` · ${employee.compensationType}` : ""
      }`}
    >
      <span className="font-semibold text-ink">
        {yearlySalary > 0 ? formatCurrency(yearlySalary) : "—"}
      </span>
      {yearlyTotal > 0 && (
        <span className="text-[11px] text-muted">
          {formatCurrency(yearlyTotal)} S+B
        </span>
      )}
      {hourlyRate != null && hourlyRate > 0 && (
        <span className="text-[10px] text-muted">{formatHourlyRate(hourlyRate)}</span>
      )}
      {employee.annualSalary != null && employee.annualSalary > 0 && (
        <span
          className="text-[10px] text-muted"
          title="Official rate from Employee and Position Salary Report"
        >
          FY rate {formatCurrency(employee.annualSalary)}
        </span>
      )}
    </div>
  );
}
