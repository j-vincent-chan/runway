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
    <div className="rounded-xl border border-accent bg-accent-soft px-5 py-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-1 gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-surface shadow-sm">
            <CheckCircle2 className="h-5 w-5 text-healthy" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <FileSpreadsheet className="h-4 w-4 shrink-0 text-accent" />
              <p className="truncate font-semibold text-ink">
                Merged payroll dataset · {snapshot.sourceFileName}
              </p>
            </div>
            <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
              <div>
                <dt className="sr-only">Imported</dt>
                <dd>Updated {new Date(snapshot.uploadedAt).toLocaleString()}</dd>
              </div>
              <div>
                <dt className="sr-only">Employees</dt>
                <dd>
                  {/* "on the report" names the scope: planning pages count a
                      smaller active roster (hidden and alumni removed), so the
                      raw report total needs to say which set it is. */}
                  <span className="font-medium text-ink">{snapshot.employees.length}</span>{" "}
                  employees on the report
                </dd>
              </div>
              <div>
                <dt className="sr-only">Funding sources</dt>
                <dd>
                  <span className="font-medium text-ink">{snapshot.fundingSources.length}</span>{" "}
                  funding sources
                </dd>
              </div>
              <div>
                <dt className="sr-only">Month range</dt>
                <dd>{formatMonthRange(snapshot)}</dd>
              </div>
              <div className="flex items-center gap-1.5">
                <dt className="text-muted">Parse</dt>
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
            className="rounded-lg bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:bg-accent-hover"
          >
            View Distributions
          </Link>
        </div>
      </div>
    </div>
  );
}
