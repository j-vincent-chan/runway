"use client";

import { useApp } from "@/context/AppContext";
import { computeKpis } from "@/lib/calculations";
import { formatCurrency } from "@/lib/utils/parse";
import { PageStatRow } from "@/components/layout/PageStatRow";

export function KpiRow() {
  const { snapshot, allocations, settings } = useApp();
  if (!snapshot) return null;
  const k = computeKpis(snapshot, allocations, settings);

  return (
    <PageStatRow
      stats={[
        {
          label: "Monthly payroll burn",
          value: formatCurrency(k.totalMonthly),
          // computeKpis walks snapshot.employees, so this covers everyone on
          // the report — the Dashboard's same-named figure is scoped to the
          // planning roster and can legitimately differ. Naming the scope is
          // what stops the two reading as a contradiction.
          basis: `Everyone on the report · ${k.currentMonth}`,
        },
        {
          label: "FY projected personnel cost",
          value: formatCurrency(k.fyCost),
          basis: "Planning estimate · assumes pay stays flat",
        },
      ]}
    />
  );
}
