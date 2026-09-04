"use client";

import { ArrowDownAZ } from "lucide-react";
import {
  RUNWAY_EMPLOYEE_SORT_OPTIONS,
  type RunwayEmployeeSortKey,
} from "@/lib/runway/sortEmployees";

export function RunwayEmployeeSort({
  value,
  onChange,
}: {
  value: RunwayEmployeeSortKey;
  onChange: (key: RunwayEmployeeSortKey) => void;
}) {
  return (
    <label className="inline-flex items-center gap-2 text-xs text-ink-2">
      <ArrowDownAZ className="h-3.5 w-3.5 shrink-0 text-muted" aria-hidden />
      <span className="font-medium text-ink-2">Sort employees</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as RunwayEmployeeSortKey)}
        title={
          value === "runway"
            ? "Deficits and shortest runway first"
            : "Sort by employee name A–Z"
        }
        className="rounded-lg border border-rule bg-surface py-1.5 pl-2 pr-7 text-xs font-medium text-ink shadow-sm hover:border-control focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20"
      >
        {RUNWAY_EMPLOYEE_SORT_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
