"use client";

import { Check } from "lucide-react";

type PowerItem = {
  label: string;
  requiresPayroll?: boolean;
  requiresNetPosition?: boolean;
  requiresPositionSalary?: boolean;
};

/**
 * Split into pages and capabilities because one flat list mixed the two —
 * "Distributions" and "Account Balances" are places you can go, "Gaps &
 * alerts" and "Runway context" are things the data makes possible. Reading
 * them as one list implied four pages that don't exist. Page entries use the
 * nav's exact names, so nothing here is a fifth name for a known surface.
 */
const PAGES: PowerItem[] = [
  { label: "Distributions", requiresPayroll: true },
  { label: "Projections", requiresPayroll: true },
  { label: "Runway", requiresNetPosition: true },
  { label: "Account Balances", requiresNetPosition: true },
  { label: "Employees", requiresPayroll: true },
];

const CAPABILITIES: PowerItem[] = [
  { label: "Coverage gaps and alerts", requiresPayroll: true },
  { label: "Salary + benefits calculations", requiresPayroll: true },
  { label: "FY salary rates on the roster", requiresPositionSalary: true },
];

export function WhatThisPowersCard({
  hasPayroll,
  hasNetPosition = false,
  hasPositionSalary = false,
}: {
  hasPayroll: boolean;
  hasNetPosition?: boolean;
  hasPositionSalary?: boolean;
}) {
  return (
    <section className="rounded-xl border border-rule bg-surface p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-ink">What This Powers</h3>
      {(
        [
          { caption: "Pages", items: PAGES },
          { caption: "Calculations", items: CAPABILITIES },
        ] as const
      ).map((group) => (
        <div key={group.caption} className="mt-3">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted">
            {group.caption}
          </p>
          <ul className="mt-1.5 space-y-2">
            {group.items.map((item) => {
              const active = item.requiresNetPosition
                ? hasNetPosition
                : item.requiresPositionSalary
                  ? hasPositionSalary
                  : Boolean(item.requiresPayroll && hasPayroll);
              return (
                <li key={item.label} className="flex items-center gap-2 text-sm">
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                      active ? "bg-accent-soft text-accent" : "bg-inset text-muted"
                    }`}
                  >
                    <Check className="h-3 w-3" />
                  </span>
                  <span className={active ? "text-ink" : "text-muted"}>
                    {item.label}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </section>
  );
}
