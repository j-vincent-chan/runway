"use client";

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { getPersonnelGroups } from "@/lib/employees/personnelType";
import { cn } from "@/lib/utils/cn";

const UNASSIGNED = "unassigned";

export function PersonnelGroupFilter({
  value,
  onChange,
}: {
  /** Empty array = show all personnel */
  value: string[];
  onChange: (ids: string[]) => void;
}) {
  const { settings } = useApp();
  const groups = getPersonnelGroups(settings);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = new Set(value);
  const allSelected = value.length === 0;

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("click", close, true);
    return () => document.removeEventListener("click", close, true);
  }, [open]);

  const toggle = (id: string) => {
    if (allSelected) {
      onChange([id]);
      return;
    }
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange([...next]);
  };

  const label = (() => {
    if (allSelected) return "All teams";
    if (value.length === 1) {
      if (value[0] === UNASSIGNED) return "Unassigned";
      return groups.find((g) => g.id === value[0])?.label ?? "1 team";
    }
    return `${value.length} teams`;
  })();

  return (
    <div ref={ref} className="relative flex flex-col gap-1.5">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted">
        Teams
      </span>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className={cn(
            "inline-flex min-w-[9.5rem] items-center justify-between gap-2 rounded-lg border bg-surface px-2.5 py-1 text-xs font-medium shadow-sm transition-colors",
            allSelected
              ? "border-rule text-ink-2 hover:bg-inset"
              : "border-accent bg-accent-soft/80 text-accent hover:bg-accent-soft"
          )}
          aria-expanded={open}
          aria-haspopup="listbox"
        >
          <span className="truncate">{label}</span>
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted" />
        </button>
        {!allSelected && (
          <button
            type="button"
            onClick={() => onChange([])}
            className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] font-medium text-muted hover:bg-inset hover:text-ink"
            title="Clear filter — show everyone"
          >
            <X className="h-3 w-3" />
            Clear
          </button>
        )}
      </div>
      {open && (
        <div
          className="absolute left-0 top-full z-40 mt-1 min-w-[14rem] rounded-lg border border-rule bg-surface py-1 shadow-lg"
          role="listbox"
          aria-multiselectable
        >
          <button
            type="button"
            role="option"
            aria-selected={allSelected}
            className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-inset"
            onClick={() => {
              onChange([]);
              setOpen(false);
            }}
          >
            <Check
              className={cn("h-3.5 w-3.5 shrink-0", allSelected ? "text-accent" : "text-transparent")}
            />
            All teams
          </button>
          <div className="my-1 border-t border-rule" />
          {groups.map((g) => {
            const active = !allSelected && selected.has(g.id);
            return (
              <button
                key={g.id}
                type="button"
                role="option"
                aria-selected={active}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-inset"
                onClick={() => toggle(g.id)}
              >
                <Check
                  className={cn("h-3.5 w-3.5 shrink-0", active ? "text-accent" : "text-transparent")}
                />
                <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", g.dotClass)} aria-hidden />
                {g.label}
              </button>
            );
          })}
          <button
            type="button"
            role="option"
            aria-selected={!allSelected && selected.has(UNASSIGNED)}
            className="flex w-full items-center gap-2 border-t border-rule px-3 py-1.5 text-left text-xs hover:bg-inset"
            onClick={() => toggle(UNASSIGNED)}
          >
            <Check
              className={cn(
                "h-3.5 w-3.5 shrink-0",
                !allSelected && selected.has(UNASSIGNED) ? "text-accent" : "text-transparent"
              )}
            />
            <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-muted" aria-hidden />
            Unassigned
          </button>
        </div>
      )}
    </div>
  );
}
