"use client";

import { formatMonthShort } from "@/lib/utils/parse";
import { cn } from "@/lib/utils/cn";
import {
  groupMonthsByYear,
  isProjectedMonth,
  PROJECTION_LABEL_COL,
  PROJECTION_SCOPE_COL,
} from "@/lib/projections/grid";
import { freezeTheadClass } from "@/components/grid/FreezeableGrid";

export function ProjectionGridHeader({
  months,
  label,
  scopeLabel,
  frozen = true,
  originMonth,
}: {
  months: string[];
  label: string;
  scopeLabel: string;
  frozen?: boolean;
  originMonth?: string;
}) {
  const monthsByYear = groupMonthsByYear(months);
  return (
    <thead className={freezeTheadClass(frozen)}>
      <tr>
        <th
          rowSpan={2}
          className="timeline-th-sticky sticky left-0 z-40 border-r border-white px-3 py-2 text-left align-middle"
        >
          <span className="block text-[11px] font-semibold leading-tight tracking-wide text-white">
            {label}
          </span>
        </th>
        <th
          rowSpan={2}
          className="timeline-th-sticky sticky z-40 border-r border-white px-1 text-center align-middle"
          style={{
            left: PROJECTION_LABEL_COL,
            width: PROJECTION_SCOPE_COL,
            minWidth: PROJECTION_SCOPE_COL,
            maxWidth: PROJECTION_SCOPE_COL,
          }}
        >
          <span className="inline-block text-[9px] font-semibold uppercase leading-none tracking-wide text-teal-100/90">
            {scopeLabel}
          </span>
        </th>
        {monthsByYear.map((group) => (
          <th
            key={group.year}
            colSpan={group.months.length}
            className="timeline-th-year px-1 py-1.5 text-center text-[10px] font-semibold tracking-wide text-teal-200/95"
          >
            {group.year}
          </th>
        ))}
      </tr>
      <tr>
        {months.map((m) => {
          const projected = originMonth ? isProjectedMonth(m, originMonth) : false;
          return (
            <th
              key={m}
              className={cn(
                "timeline-th-month px-1 py-2 text-center text-[10px] font-medium uppercase",
                projected ? "text-slate-400/90" : "text-slate-200/95"
              )}
              title={projected ? `${m} · Projected` : m}
            >
              {formatMonthShort(m).toUpperCase()}
            </th>
          );
        })}
      </tr>
    </thead>
  );
}
