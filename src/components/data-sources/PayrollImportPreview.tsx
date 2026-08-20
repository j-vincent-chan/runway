"use client";

import { useRouter } from "next/navigation";
import { formatMonthDisplay } from "@/lib/utils/parse";
import type { ParsePreview, PayrollReportSnapshot } from "@/types";
import { StatusBadge } from "@/components/data-sources/StatusBadge";

export function PayrollImportPreview({
  preview,
  snapshot,
  mergeInfo,
  onCancel,
  onConfirm,
}: {
  preview: ParsePreview;
  snapshot: PayrollReportSnapshot;
  mergeInfo?: {
    isMerge: boolean;
    overwrittenMonths: string[];
    preservedMonths: string[];
  } | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const router = useRouter();

  return (
    <div className="mt-4 rounded-lg border border-teal-200 bg-teal-50/40 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h4 className="text-sm font-semibold text-[#0c2340]">Parsed data preview</h4>
          <p className="text-xs text-slate-500">{snapshot.sourceFileName}</p>
        </div>
        <StatusBadge status={preview.parseStatus} />
      </div>

      {mergeInfo?.isMerge && (
        <div className="mt-3 rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
          <p className="font-semibold">Merge with existing data</p>
          <p className="mt-1">
            <span className="font-medium">Overwrite</span> months in this file:{" "}
            {mergeInfo.overwrittenMonths.map(formatMonthDisplay).join(", ") || "—"}
          </p>
          {mergeInfo.preservedMonths.length > 0 && (
            <p className="mt-1">
              <span className="font-medium">Keep</span> prior data for:{" "}
              {mergeInfo.preservedMonths.map(formatMonthDisplay).join(", ")}
            </p>
          )}
        </div>
      )}

      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-slate-500">Employees</dt>
          <dd className="font-medium">{preview.employees}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Funding sources</dt>
          <dd className="font-medium">{preview.fundingSources}</dd>
        </div>
        <div>
          <dt className="text-slate-500">Month range</dt>
          <dd>
            {preview.monthRange.start
              ? `${formatMonthDisplay(preview.monthRange.start)} – ${formatMonthDisplay(preview.monthRange.end)}`
              : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-slate-500">Sheet</dt>
          <dd>{preview.selectedSheet}</dd>
        </div>
      </dl>

      {preview.warnings.length > 0 && (
        <div className="mt-3 rounded-lg bg-amber-50 p-3">
          <h5 className="text-xs font-semibold text-amber-900">Parse warnings ({preview.warnings.length})</h5>
          <ul className="mt-1 max-h-28 space-y-0.5 overflow-y-auto text-xs text-amber-800">
            {preview.warnings.map((w) => (
              <li key={w.id}>{w.message}</li>
            ))}
          </ul>
        </div>
      )}

      {preview.parseStatus === "failed" && (
        <p className="mt-3 text-sm text-red-700">
          Parse failed — verify Employee and Compensation Type header rows exist.
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm hover:bg-slate-50"
        >
          Cancel
        </button>
        <button
          type="button"
          disabled={preview.parseStatus === "failed"}
          onClick={() => {
            onConfirm();
            router.push("/timeline");
          }}
          className="rounded-lg bg-teal-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-50"
        >
          Confirm import
        </button>
      </div>
    </div>
  );
}
