"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { PersonnelType } from "@/types";
import { useApp } from "@/context/AppContext";
import {
  getPersonnelGroups,
  getPersonnelTypeDisplayLabel,
  getPersonnelTypeMeta,
} from "@/lib/employees/personnelType";
import { cn } from "@/lib/utils/cn";

function PersonnelTypePill({
  type,
  className,
}: {
  type: PersonnelType;
  className?: string;
}) {
  const { settings } = useApp();
  const meta = getPersonnelTypeMeta(type, settings);
  return (
    <span
      className={cn(
        "inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-left text-xs font-medium leading-snug",
        meta.pillClass,
        className
      )}
      title={meta.label}
    >
      <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full ring-1 ring-black/10", meta.dotClass)} aria-hidden />
      {getPersonnelTypeDisplayLabel(type, settings)}
    </span>
  );
}

export function PersonnelTypeLegend() {
  const { settings } = useApp();
  const groups = getPersonnelGroups(settings);
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
      <span className="font-medium text-slate-700">Personnel groups</span>
      {groups.map((t) => (
        <span key={t.id} className="inline-flex items-center gap-1.5">
          <span className={cn("h-3 w-3 rounded-full ring-1 ring-black/10", t.dotClass)} aria-hidden />
          {t.label}
        </span>
      ))}
    </div>
  );
}

export function PersonnelTypeSelect({
  value,
  onChange,
}: {
  value?: PersonnelType;
  onChange: (type: PersonnelType | null) => void;
}) {
  const { settings } = useApp();
  const groups = getPersonnelGroups(settings);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("click", close, true);
    return () => document.removeEventListener("click", close, true);
  }, [open]);

  return (
    <div ref={ref} className="relative w-[12.5rem] max-w-full">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex w-full items-center justify-between gap-1 rounded-lg border px-2 py-1 text-left",
          value
            ? "border-transparent bg-transparent"
            : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
        )}
        aria-expanded={open}
        aria-haspopup="listbox"
      >
        <span className="min-w-0 flex-1 truncate">
          {value ? (
            <PersonnelTypePill type={value} />
          ) : (
            <span className="text-xs text-slate-500">Select group</span>
          )}
        </span>
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
      </button>
      {open && (
        <div
          className="absolute left-0 z-30 mt-1 w-[12.5rem] rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
          role="listbox"
        >
          {groups.map((t) => (
            <button
              key={t.id}
              type="button"
              role="option"
              aria-selected={value === t.id}
              className="flex w-full justify-start px-2 py-1.5 text-left hover:bg-slate-50"
              onClick={() => {
                onChange(t.id);
                setOpen(false);
              }}
            >
              <PersonnelTypePill type={t.id} />
            </button>
          ))}
          {value && (
            <button
              type="button"
              className="w-full border-t px-2 py-1.5 text-left text-[10px] text-slate-500 hover:bg-slate-50"
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
            >
              Clear
            </button>
          )}
        </div>
      )}
    </div>
  );
}
