"use client";

import { useState } from "react";
import { Trash2 } from "lucide-react";

export function DangerZone({ onClearAll }: { onClearAll: () => void }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <section
      className="rounded-xl border border-red-100 bg-red-50/20 transition-colors hover:border-red-200 hover:bg-red-50/40"
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
    >
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        <span className="text-xs font-semibold uppercase tracking-wide text-red-800/80">
          Danger zone
        </span>
        <span className="text-[10px] text-red-700/60">{expanded ? "Hide" : "Show"}</span>
      </button>
      {expanded && (
        <div className="border-t border-red-100 px-4 pb-4 pt-2">
          <p className="text-xs leading-relaxed text-red-900/75">
            Clear all imported payroll and MyPortfolio data from this browser. Timeline edits,
            scenarios, hidden funds, and planning scope are reset. Account aliases and types are kept.
          </p>
          <button
            type="button"
            onClick={onClearAll}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-3 py-1.5 text-xs font-medium text-red-700 hover:bg-red-50"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Clear all data
          </button>
        </div>
      )}
    </section>
  );
}
