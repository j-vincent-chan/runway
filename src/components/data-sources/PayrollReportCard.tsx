"use client";

import { useCallback, useState } from "react";
import { FileSpreadsheet, Info, Trash2 } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { useReconciliationDialogs } from "@/context/ReconciliationDialogs";
import { DATA_SOURCE_DROPZONE_MIN_H } from "@/components/upload/UploadDropzone";
import { StagedUploader } from "@/components/upload/StagedUploader";
import { StatusBadge } from "@/components/data-sources/StatusBadge";
import { formatMonthRange } from "@/lib/data-sources/helpers";
import { formatMonthLabel } from "@/lib/projections/horizon";
import { actorLabel, formatEventDay } from "@/lib/reconciliation/events";
import type { PlannedHireRow } from "@/lib/reconciliation/view";
import { cn } from "@/lib/utils/cn";
import type { ParseWarning } from "@/types";

export function PayrollReportCard() {
  const { payrollImports, importPayrollFiles, removePayrollImport, reconciliation, dismissMatch } =
    useApp();
  const { openLinkDialog } = useReconciliationDialogs();
  // Plans this report speaks to: a suggested match, a hire it was expected to
  // show, or a link already confirmed. A plan starting after the report's
  // last month has nothing to say here yet.
  const plannedItems = reconciliation.rows.filter((r) => r.status !== "planned");
  const [uploadWarnings, setUploadWarnings] = useState<ParseWarning[]>([]);

  const onUpload = useCallback(
    async (files: File[]) => {
      const result = await importPayrollFiles(files);
      setUploadWarnings(result.warnings);
      return result;
    },
    [importPayrollFiles]
  );

  const latestId =
    payrollImports.length > 0
      ? [...payrollImports].sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))[0]?.id
      : null;

  return (
    <section className="rounded-xl border border-rule bg-surface shadow-sm">
      <div className="border-b border-rule px-5 py-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold uppercase tracking-wide text-ink">
            1. Payroll Funding Report
          </span>
          <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-semibold uppercase text-accent">
            Required
          </span>
        </div>
        <p className="mt-2 min-h-10 text-sm text-ink-2">
          Powers the personnel funding timeline, coverage gaps, account views, and salary + benefits
          calculations. Upload multiple reports.
        </p>
      </div>

      <div className="grid gap-5 p-5 lg:grid-cols-2 lg:items-stretch">
        <StagedUploader
          label="Drop Payroll Funding Reports here"
          hint="or click to browse · .xlsx, .xls · multiple files OK"
          onUpload={onUpload}
        />

        <div className={DATA_SOURCE_DROPZONE_MIN_H}>
          {payrollImports.length === 0 ? (
            <div
              className={`flex h-full ${DATA_SOURCE_DROPZONE_MIN_H} items-center justify-center rounded-lg border border-dashed border-rule bg-inset/30 p-4 text-center text-sm text-muted`}
            >
              No payroll reports uploaded yet.
            </div>
          ) : (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted">
                Uploaded files ({payrollImports.length})
              </p>
              <ul className="mt-2 space-y-2">
                {payrollImports.map((imp) => {
                  const isLatest = imp.id === latestId;
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
                            {formatMonthRange(imp.snapshot)} · {imp.employeeCount} employees ·{" "}
                            {imp.fundingSourceCount} funding sources
                          </p>
                          <p className="text-xs text-muted">
                            Imported {new Date(imp.uploadedAt).toLocaleString()}
                          </p>
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        {isLatest && (
                          <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-semibold text-accent">
                            Latest
                          </span>
                        )}
                        <StatusBadge status={imp.parseStatus} />
                        <button
                          type="button"
                          className="rounded p-1 text-muted hover:bg-critical-soft hover:text-critical"
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
            </div>
          )}
        </div>
      </div>

      <div className="flex gap-2 border-t border-rule px-5 py-3 text-xs text-ink-2">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted" />
        <p>
          Overlapping months are replaced by the newer report. Removing a file re-builds the merged
          dataset from the remaining uploads.
        </p>
      </div>

      {plannedItems.length > 0 && (
        <div className="border-t border-rule px-5 py-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink">
            Planned hires in this report
          </p>
          <ul className="mt-2 space-y-2">
            {plannedItems.map((row) => (
              <PlannedHireItem
                key={row.plan.id}
                row={row}
                reportMonth={reconciliation.reportMonth}
                onNotAMatch={
                  row.suggestion
                    ? () => dismissMatch(row.plan.id, row.suggestion!.employeePersonKey)
                    : undefined
                }
                onReview={
                  row.suggestion
                    ? () =>
                        openLinkDialog({
                          plannedHireId: row.plan.id,
                          employeePersonKey: row.suggestion!.employeePersonKey,
                          mode: "suggested",
                        })
                    : undefined
                }
                onLinkManually={() => openLinkDialog({ plannedHireId: row.plan.id, mode: "manual" })}
              />
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">
            A match is suggested only when someone is new in the report, first charged within a
            month of the planned start, and shares an account, title or name with the plan.
            Confirming a match never edits imported payroll; Not a match is remembered on
            re-upload.
          </p>
        </div>
      )}

      {uploadWarnings.length > 0 && (
        <ul className="border-t border-caution bg-caution-soft/50 px-5 py-2 text-xs text-caution">
          {uploadWarnings.map((w) => (
            <li key={w.id}>{w.message}</li>
          ))}
        </ul>
      )}

    </section>
  );
}

function personLabel(emp: { name: string; employeeId?: string } | undefined, fallback: string) {
  if (!emp) return fallback;
  return emp.employeeId ? `${emp.name} (${emp.employeeId})` : emp.name;
}

/**
 * One plan as this report sees it. Caution for a suggestion or an expected
 * hire the report lacks; healthy only for a confirmed link. Review match and
 * Link to existing employee… open the link dialog; Not a match is remembered.
 */
function PlannedHireItem({
  row,
  reportMonth,
  onNotAMatch,
  onReview,
  onLinkManually,
}: {
  row: PlannedHireRow;
  reportMonth: string | null;
  onNotAMatch?: () => void;
  onReview?: () => void;
  onLinkManually?: () => void;
}) {
  const reportLabel = reportMonth ? formatMonthLabel(reportMonth) : "latest";
  if (row.status === "linked") {
    return (
      <li className="rounded-lg border border-healthy bg-healthy-soft px-3 py-2 text-xs text-healthy">
        <p className="font-medium">
          {row.plan.displayName} → {personLabel(row.linkedEmployee, row.link?.employeePersonKey ?? "")}{" "}
          · linked {formatEventDay(row.link?.linkedAt) ?? "—"} {actorLabel(row.link?.linkedBy)}
        </p>
      </li>
    );
  }
  const passing = row.suggestion?.signals.filter((s) => s.status === "pass").map((s) => s.label) ?? [];
  return (
    <li
      className={cn(
        "rounded-lg border border-caution bg-caution-soft/50 px-3 py-2 text-xs text-caution"
      )}
    >
      {row.status === "suggested" ? (
        <>
          <p className="font-medium">
            {personLabel(row.suggestedEmployee, "A new employee")} may be your planned{" "}
            {row.plan.displayName}
          </p>
          {passing.length > 0 && <p className="mt-0.5 text-ink-2">{passing.join(" · ")}</p>}
        </>
      ) : (
        <>
          <p className="font-medium">
            {row.plan.displayName} was planned to start {formatMonthLabel(row.plan.startMonth)}, but
            no new employee in the {reportLabel} report matches.
          </p>
          <p className="mt-0.5 text-ink-2">The forecast keeps the plan.</p>
        </>
      )}
      {(onReview || onNotAMatch || onLinkManually) && (
        <div className="mt-2 flex flex-wrap gap-2">
          {row.status === "suggested" && onReview && (
            <button
              type="button"
              className="rounded bg-accent px-2.5 py-1 text-xs font-medium text-on-accent hover:bg-accent-hover"
              onClick={onReview}
            >
              Review match
            </button>
          )}
          {row.status === "suggested" && onNotAMatch && (
            <button
              type="button"
              className="rounded border border-caution px-2.5 py-1 text-xs font-medium text-caution hover:bg-caution/10"
              onClick={onNotAMatch}
            >
              Not a match
            </button>
          )}
          {row.status === "expected" && onLinkManually && (
            <button
              type="button"
              className="rounded border border-caution px-2.5 py-1 text-xs font-medium text-caution hover:bg-caution/10"
              onClick={onLinkManually}
            >
              Link to existing employee…
            </button>
          )}
        </div>
      )}
    </li>
  );
}
