"use client";

import { Eye, EyeOff, RotateCcw, Save, PanelRightClose, PanelRightOpen } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { TimelineRangeControls } from "@/components/timeline/TimelineRangeControls";
import { FreezeHeaderToggle } from "@/components/grid/FreezeHeaderToggle";
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
      <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
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
        "inline-flex rounded-lg bg-slate-100/90 p-0.5 ring-1 ring-slate-200/80",
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
          ? "bg-[#0c2340] text-white shadow-sm"
          : "text-slate-600 hover:bg-white hover:text-slate-900"
      )}
    >
      {children}
    </button>
  );
}

function LayerToggle({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
        active
          ? "bg-teal-700 text-white shadow-sm"
          : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
      )}
    >
      {label}
    </button>
  );
}

export function TimelineToolbar({
  display,
  onDisplayChange,
  showActuals,
  onShowActualsChange,
  showFuture,
  onShowFutureChange,
  futureMonthCount,
  viewRange,
  availableMonths,
  onRangeChange,
  totalHiddenFunds,
  showHiddenFunds,
  onToggleHiddenFunds,
  onResetToImported,
  onSaveScenario,
  analyticsPanelHidden,
  onToggleAnalyticsPanel,
  freezeHeader,
  onFreezeHeaderChange,
}: {
  display: "percent" | "dollars" | "both";
  onDisplayChange: (d: "percent" | "dollars" | "both") => void;
  showActuals: boolean;
  onShowActualsChange: (v: boolean) => void;
  showFuture: boolean;
  onShowFutureChange: (v: boolean) => void;
  futureMonthCount: number;
  viewRange: MonthRange;
  availableMonths: string[];
  onRangeChange: (range: MonthRange) => void;
  totalHiddenFunds: number;
  showHiddenFunds: boolean;
  onToggleHiddenFunds: () => void;
  onResetToImported: () => void;
  onSaveScenario: () => void;
  analyticsPanelHidden: boolean;
  onToggleAnalyticsPanel: () => void;
  freezeHeader: boolean;
  onFreezeHeaderChange: (v: boolean) => void;
}) {
  return (
    <div className="shrink-0 border-b border-slate-200 bg-gradient-to-b from-slate-50 to-white px-4 py-3">
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

          <ToolbarSection label="Layers">
            <div className="flex flex-wrap gap-1.5">
              <LayerToggle
                active={showActuals}
                onClick={() => onShowActualsChange(!showActuals)}
                label="Actual payroll"
              />
              <LayerToggle
                active={showFuture}
                onClick={() => onShowFutureChange(!showFuture)}
                label={
                  futureMonthCount > 0
                    ? `Imported future (through this month)`
                    : "Imported future"
                }
              />
            </div>
          </ToolbarSection>

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
          <button
            type="button"
            onClick={onToggleAnalyticsPanel}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
            title={analyticsPanelHidden ? "Show insights panel" : "Hide insights panel"}
          >
            {analyticsPanelHidden ? (
              <PanelRightOpen className="h-3.5 w-3.5" />
            ) : (
              <PanelRightClose className="h-3.5 w-3.5" />
            )}
            {analyticsPanelHidden ? "Show insights" : "Hide insights"}
          </button>
          <button
            type="button"
            onClick={onResetToImported}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow-sm hover:bg-slate-50"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset to imported
          </button>
          <button
            type="button"
            onClick={onSaveScenario}
            className="inline-flex items-center gap-1.5 rounded-lg bg-teal-700 px-3 py-1.5 text-xs font-medium text-white shadow-sm hover:bg-teal-800"
          >
            <Save className="h-3.5 w-3.5" />
            Save scenario
          </button>
        </div>
      </div>

      {(totalHiddenFunds > 0 || showHiddenFunds) && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Funds
          </span>
          <button
            type="button"
            onClick={onToggleHiddenFunds}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-colors",
              showHiddenFunds
                ? "bg-teal-50 text-teal-900 ring-1 ring-teal-200"
                : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
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
          <span className="text-[11px] text-slate-500">
            Use the eye icon on a fund row to exclude accounts you do not manage.
          </span>
        </div>
      )}
    </div>
  );
}
