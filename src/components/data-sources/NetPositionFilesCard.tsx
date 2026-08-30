"use client";

import { useCallback, useState } from "react";
import { FileSpreadsheet, Info, Trash2 } from "lucide-react";
import { useApp } from "@/context/AppContext";
import {
  DATA_SOURCE_DROPZONE_MIN_H,
  UploadDropzone,
} from "@/components/upload/UploadDropzone";
import { getLatestNetPositionImportId } from "@/lib/data-sources/helpers";
import type { ParseWarning } from "@/types";

export function NetPositionFilesCard() {
  const { netPositionImports, importNetPositionFiles, removeNetPositionImport } = useApp();
  const [uploading, setUploading] = useState(false);
  const [warnings, setWarnings] = useState<ParseWarning[]>([]);
  const latestId = getLatestNetPositionImportId(netPositionImports);

  const onFiles = useCallback(
    async (files: FileList | null) => {
      if (!files?.length) return;
      setUploading(true);
      const { warnings: w } = await importNetPositionFiles(Array.from(files));
      setWarnings(w);
      setUploading(false);
    },
    [importNetPositionFiles]
  );

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-100 px-5 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-[#0c2340]">
            2. Net Position Reports
          </span>
          <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-sky-800">
            Optional
          </span>
        </div>
        <p className="mt-2 text-sm text-slate-600">
          Supplies every account balance Runway spends against — run it against your payroll accounts. Powers Runway, projections, and Account Balances trends.
        </p>
      </div>

      <div className="grid gap-5 p-5 lg:grid-cols-2 lg:items-stretch">
        <UploadDropzone
          multiple
          size="dataSource"
          className="w-full"
          disabled={uploading}
          label="Drop Net Position reports here"
          hint="or click to browse · .xlsx, .xls"
          accept=".xlsx,.xls"
          onFiles={(files) => void onFiles(files)}
        />

        <div className={DATA_SOURCE_DROPZONE_MIN_H}>
          {netPositionImports.length === 0 ? (
            <div
              className={`flex h-full ${DATA_SOURCE_DROPZONE_MIN_H} items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50/30 p-4 text-center text-sm text-slate-500`}
            >
              No Net Position reports uploaded yet.
            </div>
          ) : (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Uploaded files ({netPositionImports.length})
              </p>
              <ul className="mt-2 space-y-2">
                {netPositionImports.map((imp) => {
                  const isLatest = imp.id === latestId;
                  const period =
                    imp.periodStart && imp.periodEnd
                      ? `${imp.periodStart} → ${imp.periodEnd}`
                      : imp.periodEnd ?? imp.reportRunDate;
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
                            Period {period} · Run {imp.reportRunDate} · {imp.rows.length} accounts
                          </p>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        {isLatest && (
                          <span className="rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-semibold text-teal-800">
                            Latest
                          </span>
                        )}
                        <button
                          type="button"
                          className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                          title="Remove this import"
                          onClick={() => removeNetPositionImport(imp.id)}
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

      <div className="flex gap-2 border-t border-slate-100 px-5 py-3 text-xs text-slate-600">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
        <p>
          Accounts are keyed by fund–dept–project. Re-uploading the same period replaces that
          period&apos;s balances; earlier periods are kept for trends.
        </p>
      </div>

      {warnings.length > 0 && (
        <ul className="border-t border-amber-100 bg-amber-50/50 px-5 py-2 text-xs text-amber-800">
          {warnings.map((w) => (
            <li key={w.id}>{w.message}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
