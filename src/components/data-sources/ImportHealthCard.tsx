"use client";

import { Circle } from "lucide-react";
import type { PayrollReportSnapshot, PortfolioReportImport } from "@/types";
import {
  countParseWarnings,
  dataFreshnessLabel,
} from "@/lib/data-sources/helpers";

export function ImportHealthCard({
  snapshot,
  portfolioImports,
  payrollImportCount = 0,
  pendingWarningCount = 0,
}: {
  snapshot: PayrollReportSnapshot | null;
  portfolioImports: PortfolioReportImport[];
  payrollImportCount?: number;
  pendingWarningCount?: number;
}) {
  const warnings = snapshot
    ? countParseWarnings(snapshot) + pendingWarningCount
    : pendingWarningCount;
  const freshness = snapshot
    ? dataFreshnessLabel(snapshot.uploadedAt)
    : { label: "No payroll data", tone: "neutral" as const };

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
          <span className="text-slate-600">MyPortfolio files</span>
          <span className="font-medium text-[#0c2340]">
            {portfolioImports.length === 0
              ? "None"
              : `${portfolioImports.length} file${portfolioImports.length === 1 ? "" : "s"}`}
          </span>
        </li>
        <li className="flex items-center justify-between gap-2">
          <span className="text-slate-600">Parse warnings</span>
          <span className={warnings > 0 ? "font-medium text-amber-700" : "font-medium text-[#0c2340]"}>
            {warnings}
          </span>
        </li>
        <li className="flex items-center justify-between gap-2">
          <span className="text-slate-600">Last import</span>
          <span className="text-right text-xs font-medium text-slate-700">
            {snapshot
              ? new Date(snapshot.uploadedAt).toLocaleString()
              : portfolioImports.length > 0
                ? new Date(
                    [...portfolioImports].sort((a, b) =>
                      b.uploadedAt.localeCompare(a.uploadedAt)
                    )[0]!.uploadedAt
                  ).toLocaleString()
                : "—"}
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
