"use client";

import { Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { TimelineRangeControls } from "@/components/timeline/TimelineRangeControls";
import { FreezeHeaderToggle } from "@/components/grid/FreezeHeaderToggle";
import { PersonnelGroupFilter } from "@/components/employees/PersonnelGroupFilter";
import type { MonthRange } from "@/lib/timeline/range";

function ToolbarSection({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">
        {label}
      </span>
      {children}
    </div>
  );
}

function SegmentedGroup({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "inline-flex rounded-lg bg-inset/90 p-0.5 ring-1 ring-rule/80",
        className
      )}
    >
      {children}
    </div>
  );
}

function SegmentedOption({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
        active
          ? "bg-brand-ground text-white shadow-sm"
          : "text-ink-2 hover:bg-surface hover:text-ink"
      )}
    >
      {children}
    </button>
  );
}

export function TimelineToolbar({
  display,
  onDisplayChange,
  viewRange,
  availableMonths,
  onRangeChange,
  totalHiddenFunds,
  showHiddenFunds,
  onToggleHiddenFunds,
  freezeHeader,
  onFreezeHeaderChange,
  groupFilter,
  onGroupFilterChange,
}: {
  display: "percent" | "dollars" | "both";
  onDisplayChange: (d: "percent" | "dollars" | "both") => void;
  viewRange: MonthRange;
  availableMonths: string[];
  onRangeChange: (range: MonthRange) => void;
  totalHiddenFunds: number;
  showHiddenFunds: boolean;
  onToggleHiddenFunds: () => void;
  freezeHeader: boolean;
  onFreezeHeaderChange: (v: boolean) => void;
  groupFilter: string[];
  onGroupFilterChange: (ids: string[]) => void;
}) {
  // Flat --inset, matching .timeline-thead directly beneath it. Was a
  // slate-50 → white gradient: it did not follow the theme, and the design
  // system allows no gradients.
  return (
    <div className="shrink-0 border-b border-rule bg-inset px-4 py-3">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-wrap items-end gap-5">
          <ToolbarSection label="Display">
            <SegmentedGroup>
              {(["percent", "dollars", "both"] as const).map((d) => (
                <SegmentedOption
                  key={d}
                  active={display === d}
                  onClick={() => onDisplayChange(d)}
                >
                  {d === "percent" ? "%" : d === "dollars" ? "$" : "Both"}
                </SegmentedOption>
              ))}
            </SegmentedGroup>
          </ToolbarSection>

          <PersonnelGroupFilter value={groupFilter} onChange={onGroupFilterChange} />

          <ToolbarSection label="Month range">
            <TimelineRangeControls
              range={viewRange}
              availableMonths={availableMonths}
              onChange={onRangeChange}
            />
          </ToolbarSection>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <FreezeHeaderToggle frozen={freezeHeader} onChange={onFreezeHeaderChange} />
        </div>
      </div>

      {(totalHiddenFunds > 0 || showHiddenFunds) && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-rule pt-3">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">
            Funds
          </span>
          <button
            type="button"
            onClick={onToggleHiddenFunds}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors",
              showHiddenFunds
                ? "bg-accent-soft text-accent ring-1 ring-accent"
                : "bg-surface text-ink-2 ring-1 ring-rule hover:bg-inset"
            )}
            title={
              showHiddenFunds
                ? "Hide fund rows you marked with the eye icon"
                : "Show hidden fund rows so you can restore them with the eye icon on each row"
            }
          >
            {showHiddenFunds ? (
              <EyeOff className="h-3.5 w-3.5" />
            ) : (
              <Eye className="h-3.5 w-3.5" />
            )}
            {showHiddenFunds
              ? "Hiding excluded funds"
              : `Show ${totalHiddenFunds} hidden fund${totalHiddenFunds === 1 ? "" : "s"}`}
          </button>
          <span className="text-[11px] text-muted">
            Use the eye icon on a fund row to mark an account as not my account.
          </span>
        </div>
      )}
    </div>
  );
}
