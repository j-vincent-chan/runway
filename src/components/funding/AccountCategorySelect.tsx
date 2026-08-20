"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import type { AccountCategory } from "@/types";
import { useApp } from "@/context/AppContext";
import {
  getAccountCategoryMeta,
  getFundingSourceTypes,
} from "@/lib/funding/accountCategory";
import { cn } from "@/lib/utils/cn";

function CategoryPill({
  category,
  className,
}: {
  category: AccountCategory;
  className?: string;
}) {
  const { settings } = useApp();
  const meta = getAccountCategoryMeta(category, settings);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[10px] font-medium leading-tight",
        meta.pillClass,
        className
      )}
    >
      <span className={cn("h-2 w-2 shrink-0 rounded-full ring-1 ring-black/10", meta.dotClass)} aria-hidden />
      {meta.label}
    </span>
  );
}

export function AccountCategoryLegend() {
  const { settings } = useApp();
  const types = getFundingSourceTypes(settings);
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
      <span className="font-medium text-slate-700">Funding source</span>
      {types.map((c) => (
        <span key={c.id} className="inline-flex items-center gap-1.5">
          <span className={cn("h-2.5 w-2.5 rounded-full ring-1 ring-black/10", c.dotClass)} aria-hidden />
          {c.label}
        </span>
      ))}
    </div>
  );
}

export function AccountCategorySelect({
  value,
  onChange,
}: {
  value?: AccountCategory;
  onChange: (category: AccountCategory | null) => void;
}) {
  const { settings } = useApp();
  const types = getFundingSourceTypes(settings);
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
    <div ref={ref} className="relative min-w-[11.5rem]">
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
        {value ? (
          <CategoryPill category={value} />
        ) : (
          <span className="text-xs text-slate-500">Select funding source</span>
        )}
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
      </button>
      {open && (
        <div
          className="absolute left-0 z-30 mt-1 min-w-[11rem] rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
          role="listbox"
        >
          {types.map((c) => (
            <button
              key={c.id}
              type="button"
              role="option"
              aria-selected={value === c.id}
              className="flex w-full px-2 py-1.5 hover:bg-slate-50"
              onClick={() => {
                onChange(c.id);
                setOpen(false);
              }}
            >
              <CategoryPill category={c.id} />
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
