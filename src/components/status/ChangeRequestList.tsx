"use client";

import { useState } from "react";
import { ImageIcon, Send } from "lucide-react";
import { changeSummarySentences } from "@/lib/projections/changeSummary";
import {
  CHANGE_REQUEST_STATUSES,
  type ChangeRequestRecord,
  type ChangeRequestStatus,
} from "@/lib/supabase/changeRequests";
import { createSignedStorageUrl } from "@/lib/supabase/signedUrl";
import { WORKSPACE_STORAGE_BUCKET } from "@/lib/supabase/workspace";
import { formatIsoDateDisplay } from "@/lib/utils/parse";
import { StatusChip, STATUS_LABEL } from "@/components/status/StatusChip";

function RequestRow({
  request,
  canUpdateStatus,
  onSetStatus,
  onResendEmail,
}: {
  request: ChangeRequestRecord;
  canUpdateStatus: boolean;
  onSetStatus: (id: string, status: ChangeRequestStatus) => void;
  onResendEmail: (id: string) => Promise<void>;
}) {
  const [imageBusy, setImageBusy] = useState(false);
  const [emailBusy, setEmailBusy] = useState(false);
  const sentences = changeSummarySentences(request.details);
  const submitted = formatIsoDateDisplay(request.createdAt) ?? request.createdAt;
  const statusChanged = formatIsoDateDisplay(request.statusChangedAt) ?? request.statusChangedAt;

  async function openImage(path: string) {
    if (imageBusy) return;
    setImageBusy(true);
    const url = await createSignedStorageUrl(WORKSPACE_STORAGE_BUCKET, path);
    setImageBusy(false);
    if (url) window.open(url, "_blank", "noopener,noreferrer");
    else window.alert("The distribution image could not be opened. Try again in a moment.");
  }

  return (
    <li className="border-b border-rule px-4 py-3 last:border-b-0">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className="flex min-w-0 items-center gap-2.5">
          <StatusChip status={request.status} />
          <span className="type-row min-w-0 font-medium text-ink">{request.personName}</span>
        </span>
        {canUpdateStatus && (
          <label className="type-row inline-flex items-center gap-1.5 text-ink-2">
            Set status
            <select
              className="rounded-md border border-rule bg-surface px-2 py-1.5 text-ink"
              value={request.status}
              onChange={(e) => onSetStatus(request.id, e.target.value as ChangeRequestStatus)}
            >
              {CHANGE_REQUEST_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
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
      <p className="type-mono mt-1.5 text-muted">
        Submitted {submitted} by {request.createdByEmail}
        {" · "}
        {request.status === "pending" && request.statusChangedAt === request.createdAt
          ? "awaiting review"
          : `${STATUS_LABEL[request.status]} since ${statusChanged} (${request.statusChangedByEmail})`}
      </p>
      <div className="flex flex-wrap items-center gap-x-4">
        {request.imagePaths.length > 0 && (
          <button
            type="button"
            disabled={imageBusy}
            onClick={() => void openImage(request.imagePaths[0]!)}
            className="type-row mt-1.5 inline-flex min-h-11 items-center gap-1 font-medium text-accent hover:underline disabled:opacity-50"
          >
            <ImageIcon className="h-3.5 w-3.5" aria-hidden />
            {imageBusy ? "Opening…" : "View distribution image"}
          </button>
        )}
        {request.emailSentAt === null && (
          <button
            type="button"
            disabled={emailBusy}
            onClick={() => {
              setEmailBusy(true);
              void onResendEmail(request.id).finally(() => setEmailBusy(false));
            }}
            className="type-row mt-1.5 inline-flex min-h-11 items-center gap-1 font-medium text-accent hover:underline disabled:opacity-50"
          >
            <Send className="h-3.5 w-3.5" aria-hidden />
            {emailBusy ? "Sending…" : "Email not sent — send it now"}
          </button>
        )}
      </div>
    </li>
  );
}

export function ChangeRequestList({
  requests,
  canUpdateStatus,
  onSetStatus,
  onResendEmail,
}: {
  requests: ChangeRequestRecord[];
  canUpdateStatus: boolean;
  onSetStatus: (id: string, status: ChangeRequestStatus) => void;
  onResendEmail: (id: string) => Promise<void>;
}) {
  return (
    <div className="overflow-hidden rounded-md border border-rule bg-surface">
      <ul>
        {requests.map((request) => (
          <RequestRow
            key={request.id}
            request={request}
            canUpdateStatus={canUpdateStatus}
            onSetStatus={onSetStatus}
            onResendEmail={onResendEmail}
          />
        ))}
      </ul>
    </div>
  );
}
