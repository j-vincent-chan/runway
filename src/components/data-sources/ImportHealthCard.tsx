"use client";

import { Circle } from "lucide-react";
import type {
  NetPositionReportImport,
  PayrollReportSnapshot,
  PositionSalaryReportImport,
} from "@/types";
import {
  countParseWarnings,
  dataFreshnessLabel,
} from "@/lib/data-sources/helpers";

export function ImportHealthCard({
  snapshot,
  netPositionImports = [],
  positionSalaryImports = [],
  payrollImportCount = 0,
  pendingWarningCount = 0,
}: {
  snapshot: PayrollReportSnapshot | null;
  netPositionImports?: NetPositionReportImport[];
  positionSalaryImports?: PositionSalaryReportImport[];
  payrollImportCount?: number;
  pendingWarningCount?: number;
}) {
  const warnings = snapshot
    ? countParseWarnings(snapshot) + pendingWarningCount
    : pendingWarningCount;
  const freshness = snapshot
    ? dataFreshnessLabel(snapshot.uploadedAt)
    : { label: "No payroll data", tone: "neutral" as const };

  const lastImportAt = (() => {
    const times: string[] = [];
    if (snapshot) times.push(snapshot.uploadedAt);
    for (const imp of netPositionImports) times.push(imp.uploadedAt);
    for (const imp of positionSalaryImports) times.push(imp.uploadedAt);
    if (times.length === 0) return null;
    return times.sort((a, b) => b.localeCompare(a))[0]!;
  })();

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-[#0c2340]">Import Health</h3>
      <ul className="mt-3 space-y-2.5 text-sm">
        <li className="flex items-center justify-between gap-2">
          <span className="text-slate-600">Payroll reports</span>
          <span className="font-medium text-[#0c2340]">
            {payrollImportCount === 0 && !snapshot
              ? "None"
              : `${Math.max(payrollImportCount, snapshot ? 1 : 0)} file${
                  Math.max(payrollImportCount, snapshot ? 1 : 0) === 1 ? "" : "s"
                }`}
          </span>
        </li>
        <li className="flex items-center justify-between gap-2">
          <span className="text-slate-600">Net Position reports</span>
          <span className="font-medium text-[#0c2340]">
            {netPositionImports.length === 0
              ? "None"
              : `${netPositionImports.length} file${
                  netPositionImports.length === 1 ? "" : "s"
                }`}
          </span>
        </li>
        <li className="flex items-center justify-between gap-2">
          <span className="text-slate-600">FY salary reports</span>
          <span className="font-medium text-[#0c2340]">
            {positionSalaryImports.length === 0
              ? "None"
              : `${positionSalaryImports.length} file${
                  positionSalaryImports.length === 1 ? "" : "s"
                }`}
          </span>
        </li>
        <li className="flex items-center justify-between gap-2">
          <span className="text-slate-600">Parse warnings</span>
          <span className={warnings > 0 ? "font-medium text-amber-700" : "font-medium text-[#0c2340]"}>
            {warnings}
          </span>
        </li>
        <li className="flex items-center justify-between gap-2">
          {/* "any file" is load-bearing: the provenance line elsewhere dates
              the payroll report specifically, so this newer timestamp (often a
              Net Position upload) looked like a contradiction unlabelled. */}
          <span className="text-slate-600">Last import (any file)</span>
          <span className="text-right text-xs font-medium text-slate-700">
            {lastImportAt ? new Date(lastImportAt).toLocaleString() : "—"}
          </span>
        </li>
        <li className="flex items-center justify-between gap-2 border-t border-slate-100 pt-2">
          <span className="text-slate-600">Data freshness</span>
          <span className="inline-flex items-center gap-1.5 text-sm font-medium">
            <Circle
              className={`h-2 w-2 fill-current ${
                freshness.tone === "good" ? "text-emerald-500" : "text-slate-400"
              }`}
            />
            {freshness.label}
          </span>
        </li>
      </ul>
    </section>
  );
}
