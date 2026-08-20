"use client";

import { cn } from "@/lib/utils/cn";
import type { EmployeeGroupSort } from "@/types";

export function EmployeeGroupSortControl({
  value,
  onChange,
}: {
  value: EmployeeGroupSort;
  onChange: (v: EmployeeGroupSort) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
        Group by
      </span>
      <div className="inline-flex rounded-lg bg-slate-100/90 p-0.5 ring-1 ring-slate-200/80">
        {(
          [
            { value: "lastName" as const, label: "Last name" },
            { value: "personnelGroup" as const, label: "Personnel groups" },
          ] as const
        ).map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
              value === opt.value
                ? "bg-[#0c2340] text-white shadow-sm"
                : "text-slate-600 hover:bg-white hover:text-slate-900"
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
