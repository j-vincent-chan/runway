"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { FileSpreadsheet, Info, Trash2 } from "lucide-react";
import { useApp } from "@/context/AppContext";
import {
  DATA_SOURCE_DROPZONE_MIN_H,
  UploadDropzone,
} from "@/components/upload/UploadDropzone";
import { PayrollImportPreview } from "@/components/data-sources/PayrollImportPreview";
import { StatusBadge } from "@/components/data-sources/StatusBadge";
import { formatMonthRange } from "@/lib/data-sources/helpers";
import type { ParseWarning } from "@/types";

export function PayrollReportCard() {
  const {
    snapshot,
    payrollImports,
    pendingPreview,
    pendingSnapshot,
    pendingMergeInfo,
    parsePayrollFiles,
    confirmImport,
    cancelImport,
    removePayrollImport,
  } = useApp();
  const [uploading, setUploading] = useState(false);
  const [uploadWarnings, setUploadWarnings] = useState<ParseWarning[]>([]);
  const [showParsedPreview, setShowParsedPreview] = useState(false);

  const onFiles = useCallback(
    async (files: FileList | null) => {
      if (!files?.length) return;
      setUploading(true);
      try {
        const { warnings } = await parsePayrollFiles(Array.from(files));
        setUploadWarnings(warnings);
      } finally {
        setUploading(false);
      }
    },
    [parsePayrollFiles]
  );

  const loaded = !!snapshot && !pendingPreview;
  const latestId =
    payrollImports.length > 0
      ? [...payrollImports].sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))[0]?.id
      : null;

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
          calculations. Upload multiple reports — overlapping months are replaced by newer files.
        </p>
      </div>

      <div className="grid gap-5 p-5 lg:grid-cols-2 lg:items-stretch">
        <UploadDropzone
          multiple
          size="dataSource"
          className="w-full"
          disabled={uploading}
          label="Drop Payroll Funding Reports here"
          hint="or click to browse · .xlsx, .xls · multiple files OK"
          onFiles={(files) => void onFiles(files)}
        />

        <div className={DATA_SOURCE_DROPZONE_MIN_H}>
          {payrollImports.length === 0 && !pendingPreview ? (
            <div
              className={`flex h-full ${DATA_SOURCE_DROPZONE_MIN_H} items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50/30 p-4 text-center text-sm text-slate-500`}
            >
              {pendingPreview
                ? "Confirm the preview below to load this report into Runway."
                : "No payroll reports uploaded yet."}
            </div>
          ) : (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Uploaded files ({payrollImports.length})
              </p>
              <ul className="mt-2 space-y-2">
                {payrollImports.map((imp) => {
                  const isLatest = imp.id === latestId;
                  return (
                    <li
                      key={imp.id}
                      className="flex items-start justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50/50 px-3 py-2"
                    >
                      <div className="flex min-w-0 gap-2">
                        <FileSpreadsheet className="mt-0.5 h-4 w-4 shrink-0 text-teal-700" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-800">
                            {imp.sourceFileName}
                          </p>
                          <p className="mt-0.5 text-xs text-slate-500">
                            {formatMonthRange(imp.snapshot)} · {imp.employeeCount} employees ·{" "}
                            {imp.fundingSourceCount} funding sources
                          </p>
                          <p className="text-xs text-slate-500">
                            Imported {new Date(imp.uploadedAt).toLocaleString()}
                          </p>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        {isLatest && (
                          <span className="rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-semibold text-teal-800">
                            Latest
                          </span>
                        )}
                        <StatusBadge status={imp.parseStatus} />
                        <button
                          type="button"
                          className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                          title="Remove this import"
                          onClick={() => removePayrollImport(imp.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
              {loaded && (
                <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-200 pt-3">
                  <button
                    type="button"
                    onClick={() => setShowParsedPreview((v) => !v)}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                  >
                    {showParsedPreview ? "Hide parsed data" : "View Parsed Data"}
                  </button>
                  <Link
                    href="/timeline"
                    className="rounded-lg bg-teal-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-800"
                  >
                    View Distributions
                  </Link>
                </div>
              )}
              {showParsedPreview && snapshot && (
                <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3 text-sm">
                  <p className="font-medium text-[#0c2340]">Merged dataset</p>
                  <p className="mt-1 text-slate-600">
                    {snapshot.monthlyAllocations.length} allocations · {snapshot.monthlyCosts.length}{" "}
                    cost rows · {formatMonthRange(snapshot)}
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-2 border-t border-slate-100 px-5 py-3 text-xs text-slate-600">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
        <p>
          Overlapping months are replaced by the newer report. Removing a file re-builds the merged
          dataset from the remaining uploads.
        </p>
      </div>

      {uploadWarnings.length > 0 && (
        <ul className="border-t border-amber-100 bg-amber-50/50 px-5 py-2 text-xs text-amber-800">
          {uploadWarnings.map((w) => (
            <li key={w.id}>{w.message}</li>
          ))}
        </ul>
      )}

      {pendingPreview && pendingSnapshot && (
        <div className="border-t border-slate-100 px-5 pb-5">
          <PayrollImportPreview
            preview={pendingPreview}
            snapshot={pendingSnapshot}
            mergeInfo={pendingMergeInfo}
            onCancel={cancelImport}
            onConfirm={confirmImport}
          />
        </div>
      )}
    </section>
  );
}
