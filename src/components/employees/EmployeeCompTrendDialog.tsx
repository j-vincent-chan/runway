"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { CartesianGrid, Line, LineChart, Tooltip, XAxis, YAxis } from "recharts";
import { X } from "lucide-react";
import type { Employee, PayrollReportSnapshot } from "@/types";
import type { EmployeeCompTrendPoint, EmployeeYearlyRatePoint } from "@/lib/calculations";
import { ChartResponsive } from "@/components/charts/ChartResponsive";
import { formatCurrency, formatMonthDisplay } from "@/lib/utils/parse";

export function EmployeeCompTrendDialog({
  employee,
  snapshot,
  trend,
  open,
  onClose,
}: {
  employee: Employee;
  snapshot: PayrollReportSnapshot;
  trend: { monthly: EmployeeCompTrendPoint[]; yearly: EmployeeYearlyRatePoint[] };
  open: boolean;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  const chartRows = useMemo(
    () =>
      trend.monthly.map((p) => ({
        label: formatMonthDisplay(p.month),
        salary: p.yearlySalary,
        total: p.yearlyTotal,
      })),
    [trend.monthly]
  );

  const first = trend.monthly[0];
  const last = trend.monthly[trend.monthly.length - 1];
  const salaryDelta =
    first && last && first.yearlySalary > 0
      ? ((last.yearlySalary - first.yearlySalary) / first.yearlySalary) * 100
      : null;
  const totalDelta =
    first && last && first.yearlyTotal > 0
      ? ((last.yearlyTotal - first.yearlyTotal) / first.yearlyTotal) * 100
      : null;

  if (!open || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/30 sm:items-center">
      <button type="button" className="absolute inset-0" aria-label="Close" onClick={onClose} />
      <div className="relative z-10 max-h-[90vh] w-full max-w-2xl overflow-auto rounded-t-xl bg-white p-5 shadow-xl sm:rounded-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-[#0c2340]">Yearly compensation</h2>
            <p className="mt-0.5 text-sm text-slate-600">
              {employee.name}
              {snapshot.actualMonths.length > 0
                ? ` · ${formatMonthDisplay(snapshot.actualMonths[0]!)}–${formatMonthDisplay(
                    snapshot.actualMonths[snapshot.actualMonths.length - 1]!
                  )}`
                : null}
            </p>
          </div>
          <button
            type="button"
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            onClick={onClose}
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {last && (
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat label="Current yearly salary" value={formatCurrency(last.yearlySalary)} />
            <Stat label="Current yearly S+B" value={formatCurrency(last.yearlyTotal)} />
            <Stat
              label="Change vs first month"
              value={
                totalDelta == null
                  ? "—"
                  : `${totalDelta >= 0 ? "+" : ""}${totalDelta.toFixed(1)}% S+B`
              }
              hint={
                salaryDelta == null
                  ? undefined
                  : `${salaryDelta >= 0 ? "+" : ""}${salaryDelta.toFixed(1)}% salary`
              }
            />
          </div>
        )}

        <p className="mt-5 text-xs font-medium uppercase tracking-wide text-slate-500">
          Annualized from each month’s payroll
        </p>
        {chartRows.length > 0 ? (
          <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50/50 p-2">
            <ChartResponsive height={220}>
              <LineChart data={chartRows} margin={{ top: 8, right: 12, left: 8, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="label" tick={{ fontSize: 10, fill: "#64748b" }} interval="preserveStartEnd" />
                <YAxis
                  tick={{ fontSize: 10, fill: "#64748b" }}
                  tickFormatter={(v: number) =>
                    new Intl.NumberFormat("en-US", {
                      style: "currency",
                      currency: "USD",
                      notation: "compact",
                      maximumFractionDigits: 1,
                    }).format(v)
                  }
                  width={52}
                />
                <Tooltip
                  formatter={(value, name) => [
                    formatCurrency(Number(value)),
                    name === "salary" ? "Yearly salary" : "Yearly S+B",
                  ]}
                />
                <Line
                  type="monotone"
                  dataKey="total"
                  name="total"
                  stroke="#00778b"
                  strokeWidth={2}
                  dot={{ r: 2.5, fill: "#00778b" }}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="salary"
                  name="salary"
                  stroke="#0c2340"
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ChartResponsive>
            <p className="px-2 pb-1 text-[10px] text-slate-500">
              Solid = yearly S+B · dashed = yearly salary (12 × that month’s payroll)
            </p>
          </div>
        ) : (
          <p className="mt-2 text-sm text-slate-500">No payroll months on file.</p>
        )}

        {trend.yearly.length > 0 && (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="py-1.5 pr-3">Year</th>
                  <th className="py-1.5 pr-3 text-right">Months</th>
                  <th className="py-1.5 pr-3 text-right">Avg yearly salary</th>
                  <th className="py-1.5 pr-3 text-right">Avg yearly S+B</th>
                  <th className="py-1.5 text-right">Paid S+B in file</th>
                </tr>
              </thead>
              <tbody>
                {trend.yearly.map((y) => (
                  <tr key={y.year} className="border-t border-slate-100">
                    <td className="py-1.5 pr-3 font-medium text-[#0c2340]">{y.year}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums text-slate-600">{y.months}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{formatCurrency(y.avgYearlySalary)}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums">{formatCurrency(y.avgYearlyTotal)}</td>
                    <td className="py-1.5 text-right tabular-nums text-slate-600">
                      {formatCurrency(y.paidTotal)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/80 px-3 py-2">
      <p className="text-[10px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-0.5 text-sm font-semibold tabular-nums text-[#0c2340]">{value}</p>
      {hint && <p className="text-[10px] text-slate-500">{hint}</p>}
    </div>
  );
}
