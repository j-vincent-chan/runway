"use client";

import { useState } from "react";
import { cn } from "@/lib/utils/cn";

export function EmployeeScopeEditor({
  appointmentPercent,
  planningScope,
  onSave,
  className,
}: {
  appointmentPercent: number;
  planningScope?: number;
  onSave: (percent: number | null) => void;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState(String(planningScope ?? ""));

  const hasCustomScope = planningScope !== undefined;

  if (editing) {
    return (
      <input
        autoFocus
        type="number"
        min={0}
        max={100}
        step={0.5}
        className={cn(
          "w-14 rounded border border-teal-500 bg-white px-1 py-0.5 text-center text-[10px] text-slate-800",
          className
        )}
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={() => {
          const n = parseFloat(val);
          if (val.trim() === "" || Number.isNaN(n)) onSave(null);
          else onSave(n);
          setEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            const n = parseFloat(val);
            if (val.trim() === "" || Number.isNaN(n)) onSave(null);
            else onSave(n);
            setEditing(false);
          }
          if (e.key === "Escape") setEditing(false);
        }}
        title="Your planning scope %"
      />
    );
  }

  return (
    <button
      type="button"
      className={cn(
        "px-1 py-0.5 text-[11px] font-medium underline-offset-2 hover:underline",
        hasCustomScope ? "text-teal-700" : "text-muted",
        className
      )}
      title={
        hasCustomScope
          ? `Planning scope ${planningScope}% (double-click to edit)`
          : `Double-click to set scope (defaults to ${appointmentPercent}% appointment)`
      }
      onDoubleClick={(e) => {
        e.stopPropagation();
        setVal(hasCustomScope ? String(planningScope) : String(appointmentPercent));
        setEditing(true);
      }}
    >
      {hasCustomScope ? `${planningScope}%` : "Set scope"}
    </button>
  );
}
