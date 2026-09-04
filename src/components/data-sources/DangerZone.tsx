"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";

export function DangerZone({ onClearAll }: { onClearAll: () => void }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <section
      className="rounded-xl border border-critical bg-critical-soft/20 transition-colors hover:border-critical hover:bg-critical-soft/40"
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
    >
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        <span className="text-xs font-semibold uppercase tracking-wide text-critical/80">
          Danger zone
        </span>
        <span className="text-[10px] text-critical/60">{expanded ? "Hide" : "Show"}</span>
      </button>
      {expanded && (
        <div className="border-t border-critical px-4 pb-4 pt-2">
          <p className="text-xs leading-relaxed text-critical/75">
            Clear all imported payroll data from this browser. Timeline edits,
            scenarios, hidden funds, and planning scope are reset. Account aliases and types are kept.
          </p>
          <button
            type="button"
            onClick={onClearAll}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-critical bg-surface px-3 py-1.5 text-xs font-medium text-critical hover:bg-critical-soft"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Clear all data
          </button>
        </div>
      )}
    </section>
  );
}
