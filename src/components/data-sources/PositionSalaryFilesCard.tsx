"use client";

import { useCallback, useState } from "react";
import { FileSpreadsheet, Info, Trash2 } from "lucide-react";
import { useApp } from "@/context/AppContext";
import {
  DATA_SOURCE_DROPZONE_MIN_H,
  UploadDropzone,
} from "@/components/upload/UploadDropzone";
import { getLatestPositionSalaryImportId } from "@/lib/data-sources/helpers";
import { formatCurrency } from "@/lib/utils/parse";
import type { ParseWarning } from "@/types";

export function PositionSalaryFilesCard() {
  const { positionSalaryImports, importPositionSalaryFiles, removePositionSalaryImport } =
    useApp();
  const [uploading, setUploading] = useState(false);
  const [warnings, setWarnings] = useState<ParseWarning[]>([]);
  const latestId = getLatestPositionSalaryImportId(positionSalaryImports);

  const onFiles = useCallback(
    async (files: FileList | null) => {
      if (!files?.length) return;
      setUploading(true);
      const { warnings: w } = await importPositionSalaryFiles(Array.from(files));
      setWarnings(w);
      setUploading(false);
    },
    [importPositionSalaryFiles]
  );

  return (
    <section className="rounded-xl border border-rule bg-surface shadow-sm">
      <div className="border-b border-rule px-5 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-ink">
            3. Employee and Position Salary Report
          </span>
          <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-sky-800">
            Optional
          </span>
        </div>
        <p className="mt-2 text-sm text-ink-2">
          Official fiscal-year salary rates (X / Y / Z) and FTE. Overlays the roster so you can
          compare HR rate to payroll actuals. Does not replace monthly charges.
        </p>
      </div>

      <div className="grid gap-5 p-5 lg:grid-cols-2 lg:items-stretch">
        <UploadDropzone
          multiple
          size="dataSource"
          className="w-full"
          disabled={uploading}
          label="Drop Employee and Position Salary Reports here"
          hint="or click to browse · .xlsx, .xls"
          accept=".xlsx,.xls"
          onFiles={(files) => void onFiles(files)}
        />

        <div className={DATA_SOURCE_DROPZONE_MIN_H}>
          {positionSalaryImports.length === 0 ? (
            <div
              className={`flex h-full ${DATA_SOURCE_DROPZONE_MIN_H} items-center justify-center rounded-lg border border-dashed border-rule bg-inset/30 p-4 text-center text-sm text-muted`}
            >
              No salary reports uploaded yet.
            </div>
          ) : (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                Uploaded files ({positionSalaryImports.length})
              </p>
              <ul className="mt-2 space-y-2">
                {positionSalaryImports.map((imp) => {
                  const isLatest = imp.id === latestId;
                  const fyTotal = imp.people.reduce((s, p) => s + p.totalSalary, 0);
                  return (
                    <li
                      key={imp.id}
                      className="flex items-start justify-between gap-2 rounded-lg border border-rule bg-inset/50 px-3 py-2"
                    >
                      <div className="flex min-w-0 gap-2">
                        <FileSpreadsheet className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-ink">
                            {imp.sourceFileName}
                          </p>
                          <p className="mt-0.5 text-xs text-muted">
                            FY {imp.fiscalYear ?? "—"}
                            {imp.reportRunDate ? ` · Run ${imp.reportRunDate}` : ""} ·{" "}
                            {imp.people.length} people · {formatCurrency(fyTotal)} total
                          </p>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        {isLatest && (
                          <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-semibold text-accent">
                            Latest
                          </span>
                        )}
                        <button
                          type="button"
                          className="rounded p-1 text-muted hover:bg-critical-soft hover:text-critical"
                          title="Remove this import"
                          onClick={() => removePositionSalaryImport(imp.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-2 border-t border-rule px-5 py-3 text-xs text-ink-2">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" />
        <p>
          Re-uploading the same fiscal year replaces that year&apos;s rates. Payroll Funding Report
          stays the source of truth for monthly salary and benefits charges.
        </p>
      </div>

      {warnings.length > 0 && (
        <ul className="border-t border-caution bg-caution-soft/50 px-5 py-2 text-xs text-caution">
          {warnings.map((w) => (
            <li key={w.id}>{w.message}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
