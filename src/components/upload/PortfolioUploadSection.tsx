"use client";

import { useCallback, useRef, useState } from "react";
import { useApp } from "@/context/AppContext";
import { cn } from "@/lib/utils/cn";
import { FileSpreadsheet, Trash2, Upload } from "lucide-react";
import type { ParseWarning } from "@/types";

export function PortfolioUploadSection() {
  const { portfolioImports, importPortfolioFiles, removePortfolioImport } = useApp();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [warnings, setWarnings] = useState<ParseWarning[]>([]);

  const onPortfolioFiles = useCallback(
    async (files: FileList | null) => {
      if (!files?.length) return;
      setUploading(true);
      const { warnings: w } = await importPortfolioFiles(Array.from(files));
      setWarnings(w);
      setUploading(false);
    },
    [importPortfolioFiles]
  );

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h2 className="text-sm font-semibold text-[#0c2340]">MyPortfolio balances</h2>
      <p className="mt-1 text-sm text-slate-600">
        Upload one or more <span className="font-medium">MyPortfolio Report</span> Excel or CSV files
        (e.g. one per PI). All accounts are combined. Balances use{" "}
        <span className="font-medium">Net Balance</span> (Current Net Position with Liens from MyPortfolio).
        Duplicate chartstrings use
        the latest <span className="font-medium">Report Run Date</span>; if tied, the most recently
        uploaded file wins.
      </p>

      <div
        className={cn(
          "mt-4 flex cursor-pointer flex-col items-center rounded-xl border-2 border-dashed px-6 py-8 transition-colors",
          uploading
            ? "border-teal-400 bg-teal-50/30"
            : "border-slate-200 hover:border-teal-500 hover:bg-slate-50"
        )}
        onDragOver={(e) => {
          e.preventDefault();
        }}
        onDrop={(e) => {
          e.preventDefault();
          void onPortfolioFiles(e.dataTransfer.files);
        }}
        onClick={() => inputRef.current?.click()}
      >
        <Upload className="h-8 w-8 text-slate-400" />
        <p className="mt-2 text-sm font-medium text-slate-700">
          Drop MyPortfolio reports here or click to browse
        </p>
        <p className="mt-1 text-xs text-slate-500">.xlsx, .xls, .csv</p>
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          multiple
          className="hidden"
          onChange={(e) => void onPortfolioFiles(e.target.files)}
        />
      </div>

      {warnings.length > 0 && (
        <ul className="mt-3 space-y-1 text-xs text-amber-800">
          {warnings.map((w) => (
            <li key={w.id}>
              {w.severity}: {w.message}
            </li>
          ))}
        </ul>
      )}

      {portfolioImports.length > 0 && (
        <ul className="mt-4 divide-y rounded-lg border text-sm">
          {portfolioImports.map((imp) => (
            <li key={imp.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <div className="flex min-w-0 items-center gap-2">
                <FileSpreadsheet className="h-4 w-4 shrink-0 text-teal-700" />
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-800">{imp.sourceFileName}</p>
                  <p className="text-xs text-slate-500">
                    Run date {imp.reportRunDate} · {imp.rows.length} accounts
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="shrink-0 rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                title="Remove this import"
                onClick={() => removePortfolioImport(imp.id)}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
