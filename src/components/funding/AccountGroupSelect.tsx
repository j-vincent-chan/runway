"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";
import { useApp } from "@/context/AppContext";
import {
  getAccountGroupMeta,
  getAccountGroups,
} from "@/lib/net-position/accountGroup";
import { cn } from "@/lib/utils/cn";

function AccountGroupPill({
  groupId,
  className,
}: {
  groupId: string;
  className?: string;
}) {
  const { settings } = useApp();
  const meta = getAccountGroupMeta(groupId, settings);
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium leading-tight text-slate-700 ring-1 ring-slate-200",
        className
      )}
    >
      {meta.label}
    </span>
  );
}

export function AccountGroupLegend() {
  const { settings } = useApp();
  const groups = getAccountGroups(settings);
  if (groups.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
      <span className="font-medium text-slate-700">Account groups</span>
      {groups.map((g) => (
        <span key={g.id} className="inline-flex items-center gap-1.5">
          <span className={cn("h-3 w-3 rounded-full ring-1 ring-black/10", g.dotClass)} aria-hidden />
          {g.label}
        </span>
      ))}
    </div>
  );
}

export function AccountGroupSelect({
  value,
  onChange,
}: {
  value?: string;
  onChange: (groupId: string | null) => void;
}) {
  const { settings } = useApp();
  const groups = getAccountGroups(settings);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number; width: number } | null>(
    null
  );

  useLayoutEffect(() => {
    if (!open) {
      setMenuPos(null);
      return;
    }
    const place = () => {
      const trigger = buttonRef.current;
      const menu = menuRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const gap = 4;
      const menuH = menu?.offsetHeight ?? 0;
      const spaceBelow = window.innerHeight - rect.bottom - gap;
      const top =
        menuH > 0 && spaceBelow < menuH && rect.top > menuH + gap
          ? rect.top - menuH - gap
          : rect.bottom + gap;
      const width = Math.max(rect.width, 176);
      let left = rect.left;
      if (left + width > window.innerWidth - 8) {
        left = Math.max(8, window.innerWidth - width - 8);
      }
      setMenuPos({ top, left, width });
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, groups.length, value]);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      const target = e.target as Node;
      if (wrapRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("click", close, true);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("click", close, true);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (groups.length === 0) {
    return <span className="text-xs text-slate-400">Create groups in Settings</span>;
  }

  const menu = open
    ? createPortal(
        <div
          ref={menuRef}
          className="fixed z-50 max-h-[min(16rem,calc(100vh-1rem))] min-w-[11rem] overflow-y-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg"
          role="listbox"
          style={{
            top: menuPos?.top ?? 0,
            left: menuPos?.left ?? 0,
            width: menuPos?.width,
            visibility: menuPos ? "visible" : "hidden",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {groups.map((g) => (
            <button
              key={g.id}
              type="button"
              role="option"
              aria-selected={value === g.id}
              className="flex w-full px-2 py-1.5 hover:bg-slate-50"
              onClick={() => {
                onChange(g.id);
                setOpen(false);
              }}
            >
              <AccountGroupPill groupId={g.id} />
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
        </div>,
        document.body
      )
    : null;

  return (
    <div ref={wrapRef} className="relative min-w-[13.5rem]">
      <button
        ref={buttonRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
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
          <AccountGroupPill groupId={value} />
        ) : (
          <span className="text-xs text-slate-500">Select account group</span>
        )}
        <ChevronDown className="h-3.5 w-3.5 shrink-0 text-slate-400" />
      </button>
      {menu}
    </div>
  );
}
