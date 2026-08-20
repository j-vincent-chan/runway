"use client";

import { Check } from "lucide-react";

const ITEMS: { label: string; requiresPayroll?: boolean; requiresPortfolio?: boolean }[] = [
  { label: "Timeline", requiresPayroll: true },
  { label: "Employees", requiresPayroll: true },
  { label: "Accounts", requiresPayroll: true },
  { label: "Gaps & Alerts", requiresPayroll: true },
  { label: "Salary + benefits calculations", requiresPayroll: true },
  { label: "Runway context", requiresPortfolio: true },
];

export function WhatThisPowersCard({
  hasPayroll,
  hasPortfolio,
}: {
  hasPayroll: boolean;
  hasPortfolio: boolean;
}) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-[#0c2340]">What This Powers</h3>
      <ul className="mt-3 space-y-2">
        {ITEMS.map((item) => {
          const active = item.requiresPortfolio
            ? hasPortfolio
            : Boolean(item.requiresPayroll && hasPayroll);
          return (
            <li key={item.label} className="flex items-center gap-2 text-sm">
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                  active ? "bg-teal-100 text-teal-700" : "bg-slate-100 text-slate-300"
                }`}
              >
                <Check className="h-3 w-3" />
              </span>
              <span className={active ? "text-slate-800" : "text-slate-400"}>{item.label}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
