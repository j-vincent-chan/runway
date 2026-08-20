"use client";

import { useRef } from "react";
import Link from "next/link";
import { FileSpreadsheet } from "lucide-react";
import type { ParsePreview, PayrollReportSnapshot } from "@/types";
import { UploadDropzone } from "@/components/upload/UploadDropzone";
import { PayrollImportPreview } from "@/components/data-sources/PayrollImportPreview";
import { StatusBadge } from "@/components/data-sources/StatusBadge";
import { formatMonthRange } from "@/lib/data-sources/helpers";

export function PayrollReportCard({
  snapshot,
  pendingPreview,
  pendingSnapshot,
  pendingMergeInfo,
  onFile,
  onCancel,
  onConfirm,
  showParsedPreview,
  onToggleParsedPreview,
}: {
  snapshot: PayrollReportSnapshot | null;
  pendingPreview: ParsePreview | null;
  pendingSnapshot: PayrollReportSnapshot | null;
  pendingMergeInfo?: {
    isMerge: boolean;
    overwrittenMonths: string[];
    preservedMonths: string[];
  } | null;
  onFile: (f: File) => void;
  onCancel: () => void;
  onConfirm: () => void;
  showParsedPreview: boolean;
  onToggleParsedPreview: () => void;
}) {
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const loaded = !!snapshot && !pendingPreview;

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-[#0c2340]">
            1. Payroll Funding Report
          </span>
          <span className="rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-teal-800">
            Required
          </span>
        </div>
        <p className="mt-2 text-sm text-slate-600">
          Powers the personnel funding timeline, coverage gaps, account views, and salary + benefits
          calculations.
        </p>
      </div>

      <div className="grid gap-5 p-5 lg:grid-cols-2 lg:items-stretch">
        <UploadDropzone
          onFile={onFile}
          size="dataSource"
          className="w-full"
          label="Drop Payroll Funding Report here"
          hint="or click to browse · .xlsx, .xls"
        />

        {loaded ? (
          <div className="flex flex-col rounded-lg border border-slate-200 bg-slate-50/50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Current report
            </p>
            <div className="mt-3 flex gap-3">
              <FileSpreadsheet className="h-8 w-8 shrink-0 text-teal-700" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-[#0c2340]">{snapshot.sourceFileName}</p>
                <dl className="mt-3 space-y-1.5 text-sm">
                  <div className="flex justify-between gap-2">
                    <dt className="text-slate-500">Imported</dt>
                    <dd className="text-right font-medium">
                      {new Date(snapshot.uploadedAt).toLocaleString()}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-slate-500">Employees</dt>
                    <dd className="font-medium">{snapshot.employees.length}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-slate-500">Funding sources</dt>
                    <dd className="font-medium">{snapshot.fundingSources.length}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-slate-500">Month range</dt>
                    <dd className="text-right font-medium">{formatMonthRange(snapshot)}</dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-slate-500">Parse status</dt>
                    <dd>
                      <StatusBadge status={snapshot.parseStatus} />
                    </dd>
                  </div>
                </dl>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-200 pt-4">
              <button
                type="button"
                onClick={() => replaceInputRef.current?.click()}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Replace Report
              </button>
              <button
                type="button"
                onClick={onToggleParsedPreview}
                className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                {showParsedPreview ? "Hide parsed data" : "View Parsed Data"}
              </button>
              <Link
                href="/timeline"
                className="rounded-lg bg-teal-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-800"
              >
                View Timeline
              </Link>
            </div>
            <input
              ref={replaceInputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onFile(f);
                e.target.value = "";
              }}
            />
            {showParsedPreview && (
              <div className="mt-4 rounded-lg border border-slate-200 bg-white p-3 text-sm">
                <p className="font-medium text-[#0c2340]">Imported dataset</p>
                <p className="mt-1 text-slate-600">
                  {snapshot.monthlyAllocations.length} allocations · {snapshot.monthlyCosts.length}{" "}
                  cost rows · sheet {snapshot.sheetName}
                </p>
                {snapshot.parseWarnings.length > 0 && (
                  <p className="mt-2 text-xs text-amber-800">
                    {snapshot.parseWarnings.length} parse warning
                    {snapshot.parseWarnings.length === 1 ? "" : "s"} on file
                  </p>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="flex min-h-[11.5rem] items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50/30 p-6 text-center text-sm text-slate-500">
            {pendingPreview
              ? "Confirm the preview below to load this report into Runway."
              : "No payroll report loaded yet."}
          </div>
        )}
      </div>

      {pendingPreview && pendingSnapshot && (
        <div className="border-t border-slate-100 px-5 pb-5">
          <PayrollImportPreview
            preview={pendingPreview}
            snapshot={pendingSnapshot}
            mergeInfo={pendingMergeInfo}
            onCancel={onCancel}
            onConfirm={onConfirm}
          />
        </div>
      )}
    </section>
  );
}
