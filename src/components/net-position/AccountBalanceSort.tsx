"use client";

import { ArrowDownAZ } from "lucide-react";
import type { AccountBalanceSortKey } from "@/types";
import { ACCOUNT_BALANCE_SORT_OPTIONS } from "@/lib/net-position/accountBalancesView";

export function AccountBalanceSort({
  value,
  onChange,
}: {
  value: AccountBalanceSortKey;
  onChange: (key: AccountBalanceSortKey) => void;
}) {
  return (
    <label className="inline-flex items-center gap-2 text-xs text-slate-600">
      <ArrowDownAZ className="h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden />
      <span className="font-medium text-slate-700">Sort</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as AccountBalanceSortKey)}
        className="rounded-lg border border-slate-200 bg-white py-1.5 pl-2 pr-7 text-xs font-medium text-slate-800 shadow-sm hover:border-slate-300 focus:border-teal-600 focus:outline-none focus:ring-2 focus:ring-teal-600/20"
      >
        {ACCOUNT_BALANCE_SORT_OPTIONS.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
