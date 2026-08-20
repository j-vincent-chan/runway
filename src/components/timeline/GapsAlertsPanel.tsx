"use client";

import { useMemo } from "react";
import { useApp } from "@/context/AppContext";
import { generateAlerts } from "@/lib/calculations";
import { AlertsList } from "@/components/alerts/AlertsList";

export function GapsAlertsPanel() {
  const { snapshot, allocations, settings } = useApp();

  const alerts = useMemo(
    () => (snapshot ? generateAlerts(snapshot, allocations, settings) : []),
    [snapshot, allocations, settings]
  );

  if (!snapshot) return null;

  return (
    <div className="rounded-xl border bg-white p-3 shadow-sm">
      <h3 className="text-sm font-semibold text-[#0c2340]">Gaps &amp; alerts</h3>
      <p className="text-[10px] text-slate-500">Coverage gaps, cliffs, and data issues</p>
      <AlertsList alerts={alerts} className="mt-2 max-h-64 overflow-y-auto" />
    </div>
  );
}
