"use client";

import Link from "next/link";
import { CheckCircle2, FileSpreadsheet } from "lucide-react";
import type { PayrollReportSnapshot } from "@/types";
import { formatMonthRange } from "@/lib/data-sources/helpers";
import { StatusBadge } from "@/components/data-sources/StatusBadge";

export function ActiveDatasetBanner({
  snapshot,
}: {
  snapshot: PayrollReportSnapshot;
}) {
  return (
    <div className="rounded-xl border border-teal-200 bg-teal-50 px-5 py-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-1 gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white shadow-sm">
            <CheckCircle2 className="h-5 w-5 text-emerald-600" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <FileSpreadsheet className="h-4 w-4 shrink-0 text-teal-800" />
              <p className="truncate font-semibold text-[#0c2340]">
                Merged payroll dataset · {snapshot.sourceFileName}
              </p>
            </div>
            <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
              <div>
                <dt className="sr-only">Imported</dt>
                <dd>Updated {new Date(snapshot.uploadedAt).toLocaleString()}</dd>
              </div>
              <div>
                <dt className="sr-only">Employees</dt>
                <dd>
                  <span className="font-medium text-slate-800">{snapshot.employees.length}</span>{" "}
                  employees
                </dd>
              </div>
              <div>
                <dt className="sr-only">Funding sources</dt>
                <dd>
                  <span className="font-medium text-slate-800">{snapshot.fundingSources.length}</span>{" "}
                  funding sources
                </dd>
              </div>
              <div>
                <dt className="sr-only">Month range</dt>
                <dd>{formatMonthRange(snapshot)}</dd>
              </div>
              <div className="flex items-center gap-1.5">
                <dt className="text-slate-500">Parse</dt>
                <dd>
                  <StatusBadge status={snapshot.parseStatus} />
                </dd>
              </div>
            </dl>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Link
            href="/timeline"
            className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800"
          >
            View Distributions
          </Link>
        </div>
      </div>
    </div>
  );
}
