"use client";

import { Fragment, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  ImageIcon,
  MailWarning,
  Send,
} from "lucide-react";
import {
  changeEffectiveRange,
  changeSummaryCompactLines,
  changeSummarySentences,
  formatEffectiveRange,
} from "@/lib/projections/changeSummary";
import { type ChangeRequestRecord, type ChangeRequestStatus } from "@/lib/supabase/changeRequests";
import { createSignedStorageUrl } from "@/lib/supabase/signedUrl";
import { WORKSPACE_STORAGE_BUCKET } from "@/lib/supabase/workspace";
import { formatIsoDateDisplay } from "@/lib/utils/parse";
import { EmployeeAvatar } from "@/components/employees/EmployeeAvatar";
import { StatusChip, StatusSelect } from "@/components/status/StatusChip";
import { cn } from "@/lib/utils/cn";

export type StatusSortKey = "person" | "status" | "effective" | "submitted" | "updated";

/**
 * Priority order for status: In Progress (actively being worked on) comes first,
 * then Pending (awaiting work), then Completed (done). Within each status,
 * oldest first so the item waiting longest gets attention.
 */
const STATUS_ORDER: Record<ChangeRequestStatus, number> = {
  in_progress: 0,
  pending: 1,
  completed: 2,
};

/**
 * Requested change is the only flexible column and the one that must stay
 * readable — account names truncated to "Golden,J…" defeat the point. Every
 * other column is sized to its content so the slack lands there.
 */
const COLUMNS: { key: StatusSortKey | null; label: string; width: number | null }[] = [
  { key: null, label: "", width: 34 },
  { key: "person", label: "Person", width: 168 },
  { key: null, label: "Requested change", width: null },
  { key: "status", label: "Status", width: 156 },
  { key: "effective", label: "Takes effect", width: 156 },
  { key: "submitted", label: "Submitted", width: 140 },
  { key: "updated", label: "Last update", width: 140 },
];

const FIXED_WIDTH = COLUMNS.reduce((sum, c) => sum + (c.width ?? 0), 0);
/** Leaves the flexible column a floor of ~330px before the table scrolls. */
const TABLE_MIN_WIDTH = FIXED_WIDTH + 330;

function sortValue(request: ChangeRequestRecord, key: StatusSortKey): string | number {
  switch (key) {
    case "person":
      return request.personName.toLowerCase();
    case "status":
      return STATUS_ORDER[request.status];
    case "effective":
      return changeEffectiveRange(request.details)?.from ?? "";
    case "submitted":
      return request.createdAt;
    case "updated":
      return request.statusChangedAt;
  }
}

function DetailPanel({
  request,
  onResendEmail,
}: {
  request: ChangeRequestRecord;
  onResendEmail: (id: string) => Promise<void>;
}) {
  const [imageBusy, setImageBusy] = useState(false);
  const [emailBusy, setEmailBusy] = useState(false);
  const sentences = changeSummarySentences(request.details);

  async function openImage(path: string) {
    if (imageBusy) return;
    setImageBusy(true);
    const url = await createSignedStorageUrl(WORKSPACE_STORAGE_BUCKET, path);
    setImageBusy(false);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
    else window.alert("The distribution image could not be opened. Try again in a moment.");
  }

  return (
    <div className="bg-inset px-4 py-3">
      <p className="type-caption text-muted">Requested change in full</p>
      {sentences.length > 0 ? (
        <ul className="mt-1.5 space-y-0.5">
          {sentences.map((sentence) => (
            <li key={sentence} className="type-row text-ink-2">
              {sentence}
            </li>
          ))}
        </ul>
      ) : (
        <p className="type-row mt-1.5 text-muted">
          The captured plan matched the current distribution when it was submitted.
        </p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-x-5">
        {request.imagePaths.length > 0 && (
          <button
            type="button"
            disabled={imageBusy}
            onClick={() => void openImage(request.imagePaths[0]!)}
            className="type-row inline-flex min-h-11 items-center gap-1.5 font-medium text-accent hover:underline disabled:opacity-50"
          >
            <ImageIcon className="h-3.5 w-3.5" aria-hidden />
            {imageBusy ? "Opening…" : "View distribution image"}
          </button>
        )}
        {request.emailSentAt === null ? (
          <button
            type="button"
            disabled={emailBusy}
            onClick={() => {
              setEmailBusy(true);
              void onResendEmail(request.id).finally(() => setEmailBusy(false));
            }}
            className="type-row inline-flex min-h-11 items-center gap-1.5 font-medium text-accent hover:underline disabled:opacity-50"
          >
            <Send className="h-3.5 w-3.5" aria-hidden />
            {emailBusy ? "Sending…" : "Send the analyst email now"}
          </button>
        ) : (
          <span className="type-mono inline-flex min-h-11 items-center text-muted">
            Analyst emailed {formatIsoDateDisplay(request.emailSentAt) ?? request.emailSentAt}
          </span>
        )}
      </div>
    </div>
  );
}

function RequestRow({
  request,
  expanded,
  onToggle,
  canUpdateStatus,
  onSetStatus,
  photoUrl,
}: {
  request: ChangeRequestRecord;
  expanded: boolean;
  onToggle: () => void;
  canUpdateStatus: boolean;
  onSetStatus: (id: string, status: ChangeRequestStatus) => void;
  photoUrl?: string;
}) {
  const lines = changeSummaryCompactLines(request.details);
  const effective = formatEffectiveRange(changeEffectiveRange(request.details));

  return (
    <tr
      className={cn(
        "cursor-pointer border-b border-rule align-top hover:bg-inset",
        expanded && "bg-inset"
      )}
      onClick={onToggle}
    >
      <td className="py-3 pl-3 pr-1">
        <button
          type="button"
          aria-expanded={expanded}
          aria-label={`${expanded ? "Hide" : "Show"} the full change for ${request.personName}`}
          className="rounded p-0.5 text-muted hover:bg-rule hover:text-ink"
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
        >
          {expanded ? (
            <ChevronDown className="h-4 w-4" aria-hidden />
          ) : (
            <ChevronRight className="h-4 w-4" aria-hidden />
          )}
        </button>
      </td>
      <td className="py-3 pr-3">
        <span className="flex items-center gap-2">
          <EmployeeAvatar name={request.personName} photoUrl={photoUrl} size="xs" />
          <span className="type-row truncate font-medium text-ink" title={request.personName}>
            {request.personName}
          </span>
        </span>
      </td>
      <td className="py-3 pr-3">
        {lines.length > 0 ? (
          <div className="space-y-0.5">
            {lines.map((line) => (
              <div key={line.chartstringKey} className="flex items-baseline gap-2">
                <span
                  className="type-row min-w-0 flex-1 truncate text-ink-2"
                  title={line.accountLabel}
                >
                  {line.accountLabel}
                </span>
                <span className="type-row tabular shrink-0 text-muted">{line.fromLabel}</span>
                <span className="type-row shrink-0 text-muted" aria-label="changes to">
                  →
                </span>
                <span className="type-row tabular shrink-0 font-medium text-accent">
                  {line.toLabel}
                </span>
                {line.stepped && (
                  <span className="type-mono shrink-0 text-muted" title="Changes in stages — open the row for each step">
                    in steps
                  </span>
                )}
              </div>
            ))}
          </div>
        ) : (
          <span className="type-row text-muted">No change from the current distribution</span>
        )}
      </td>
      <td className="py-3 pr-3">
        <span className="flex flex-wrap items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
          {canUpdateStatus ? (
            <StatusSelect
              status={request.status}
              personName={request.personName}
              onChange={(next) => onSetStatus(request.id, next)}
            />
          ) : (
            <StatusChip status={request.status} />
          )}
          {request.emailSentAt === null && (
            <span
              className="type-caption inline-flex items-center gap-1 rounded-sm bg-caution-soft px-1.5 py-0.5 text-caution"
              title="The handoff email has not gone out — open the row to send it"
            >
              <MailWarning className="h-3 w-3" aria-hidden />
              No email
            </span>
          )}
        </span>
      </td>
      <td className="type-mono whitespace-nowrap py-3 pr-3 text-ink-2">{effective}</td>
      <td className="py-3 pr-3">
        <span className="type-mono block text-ink-2">
          {formatIsoDateDisplay(request.createdAt) ?? request.createdAt}
        </span>
        <span className="type-mono block truncate text-muted" title={request.createdByEmail}>
          {request.createdByEmail}
        </span>
      </td>
      <td className="py-3 pr-3">
        <span className="type-mono block text-ink-2">
          {formatIsoDateDisplay(request.statusChangedAt) ?? request.statusChangedAt}
        </span>
        <span className="type-mono block truncate text-muted" title={request.statusChangedByEmail}>
          {request.statusChangedByEmail}
        </span>
      </td>
    </tr>
  );
}

export function ChangeRequestList({
  requests,
  canUpdateStatus,
  onSetStatus,
  onResendEmail,
  photoUrlFor,
}: {
  requests: ChangeRequestRecord[];
  canUpdateStatus: boolean;
  onSetStatus: (id: string, status: ChangeRequestStatus) => void;
  onResendEmail: (id: string) => Promise<void>;
  /** Resolves the subject's roster photo, so a row reads as a person. */
  photoUrlFor?: (personKey: string) => string | undefined;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [sort, setSort] = useState<{ key: StatusSortKey; dir: "asc" | "desc" }>({
    key: "status",
    dir: "asc",
  });

  const sorted = useMemo(() => {
    const rows = [...requests];
    rows.sort((a, b) => {
      const av = sortValue(a, sort.key);
      const bv = sortValue(b, sort.key);
      if (av === bv) return a.createdAt < b.createdAt ? -1 : 1;
      const cmp = av < bv ? -1 : 1;
      return sort.dir === "asc" ? cmp : -cmp;
    });
    return rows;
  }, [requests, sort]);

  function toggleSort(key: StatusSortKey) {
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "asc" ? "desc" : "asc" }
        : // Status defaults to priority order (asc). Dates read oldest-first when
          // sorting by status (urgency), but newest-first for other date columns.
          // Names read A–Z.
          { key, dir: key === "person" || key === "status" ? "asc" : "desc" }
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border border-rule bg-surface">
      <table className="w-full table-fixed border-collapse" style={{ minWidth: TABLE_MIN_WIDTH }}>
        <colgroup>
          {COLUMNS.map((col, i) => (
            <col key={i} style={col.width ? { width: col.width } : undefined} />
          ))}
        </colgroup>
        <thead>
          <tr className="border-b border-rule-strong bg-inset">
            {COLUMNS.map((col, i) => {
              const sortKey = col.key;
              return (
                <th key={i} scope="col" className="py-2 pr-3 text-left">
                  {sortKey ? (
                    <button
                      type="button"
                      className="type-caption inline-flex items-center gap-1 text-muted hover:text-ink"
                      onClick={() => toggleSort(sortKey)}
                    >
                      {col.label}
                      {sort.key === sortKey &&
                        (sort.dir === "asc" ? (
                          <ChevronUp className="h-3 w-3" aria-hidden />
                        ) : (
                          <ChevronDown className="h-3 w-3" aria-hidden />
                        ))}
                    </button>
                  ) : (
                    <span className="type-caption text-muted">{col.label}</span>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((request) => {
            const isExpanded = expanded.has(request.id);
            return (
              <Fragment key={request.id}>
                <RequestRow
                  request={request}
                  expanded={isExpanded}
                  canUpdateStatus={canUpdateStatus}
                  onSetStatus={onSetStatus}
                  photoUrl={photoUrlFor?.(request.personKey)}
                  onToggle={() =>
                    setExpanded((prev) => {
                      const next = new Set(prev);
                      if (next.has(request.id)) next.delete(request.id);
                      else next.add(request.id);
                      return next;
                    })
                  }
                />
                {isExpanded && (
                  <tr className="border-b border-rule">
                    <td colSpan={COLUMNS.length} className="p-0">
                      <DetailPanel request={request} onResendEmail={onResendEmail} />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
