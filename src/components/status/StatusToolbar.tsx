"use client";

import { Search } from "lucide-react";
import { STATUS_LABEL } from "@/components/status/StatusChip";
import {
  CHANGE_REQUEST_STATUSES,
  type ChangeRequestStatus,
} from "@/lib/supabase/changeRequests";
import { cn } from "@/lib/utils/cn";

export type StatusFilterId = "all" | ChangeRequestStatus;

/**
 * Status filter tabs and search. The tab counts are a navigation aid, never
 * the answer to "what needs attention" — the rows below always name the
 * person, and the summary above names the one waiting longest.
 */
export function StatusToolbar({
  filter,
  onFilterChange,
  query,
  onQueryChange,
  counts,
  total,
}: {
  filter: StatusFilterId;
  onFilterChange: (next: StatusFilterId) => void;
  query: string;
  onQueryChange: (next: string) => void;
  counts: Record<ChangeRequestStatus, number>;
  total: number;
}) {
  const tabs: { id: StatusFilterId; label: string; count: number }[] = [
    { id: "all", label: "All", count: total },
    ...CHANGE_REQUEST_STATUSES.filter((s) => s !== "withdrawn" || counts[s] > 0).map((s) => ({
      id: s as StatusFilterId,
      label: STATUS_LABEL[s],
      count: counts[s],
    })),
  ];

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-rule pb-3">
      {/* The app's one segmented-control idiom (Employees, Projections,
          Settings) rather than a page-local tab style. */}
      <nav
        className="inline-flex flex-wrap gap-0.5 rounded-lg border border-rule bg-surface p-0.5"
        aria-label="Filter requests by status"
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            aria-pressed={filter === tab.id}
            onClick={() => onFilterChange(tab.id)}
            className={cn(
              "type-row inline-flex min-h-10 items-center gap-1.5 rounded-md px-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent",
              filter === tab.id
                ? "bg-[#0c2340] font-medium text-white"
                : "text-muted hover:bg-inset hover:text-ink"
            )}
          >
            {tab.label}
            <span
              className={cn(
                "type-mono tabular",
                filter === tab.id ? "text-white/70" : "text-muted"
              )}
            >
              {tab.count}
            </span>
          </button>
        ))}
      </nav>
      <label className="relative flex items-center">
        <Search
          className="pointer-events-none absolute left-2.5 h-3.5 w-3.5 text-muted"
          aria-hidden
        />
        <span className="sr-only">Search requests by person or account</span>
        <input
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Search people or accounts"
          className="type-row min-h-11 w-64 rounded-md border border-rule bg-surface pl-8 pr-3 text-ink placeholder:text-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        />
      </label>
    </div>
  );
}
