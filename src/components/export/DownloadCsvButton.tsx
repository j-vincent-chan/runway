"use client";

import { Download } from "lucide-react";
import { cn } from "@/lib/utils/cn";

/**
 * The one CSV control, shared by Distributions, Projections, Runway and
 * Account Balances so the four pages offer the same action in the same
 * clothes. Sized to sit beside FreezeHeaderToggle and the other toolbar
 * controls; disabled rather than hidden when the current filters leave
 * nothing to export, so the control stays where the reader learned it is.
 */
export function DownloadCsvButton({
  onClick,
  rowCount,
  className,
}: {
  onClick: () => void;
  /** Rows the download would contain; 0 disables the control. */
  rowCount: number;
  className?: string;
}) {
  const empty = rowCount === 0;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={empty}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors",
        "bg-surface text-ink-2 ring-1 ring-rule hover:bg-inset",
        "disabled:cursor-not-allowed disabled:text-muted disabled:hover:bg-surface",
        className
      )}
      title={
        empty
          ? "Nothing to download — no chartstrings match the current filters"
          : "Download the chartstrings on this page as a CSV — Fund, Dept ID, Project Number and Activity Code in separate columns"
      }
    >
      <Download className="h-3.5 w-3.5" aria-hidden />
      Download CSV
    </button>
  );
}
