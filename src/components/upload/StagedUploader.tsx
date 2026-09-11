"use client";

import { useCallback, useState } from "react";
import { CheckCircle2, FileSpreadsheet, X, XCircle } from "lucide-react";
import { UploadDropzone } from "@/components/upload/UploadDropzone";
import { formatFileNameList } from "@/lib/data-sources/helpers";
import { cn } from "@/lib/utils/cn";
import type { ImportFilesResult } from "@/types";

/**
 * Two-step uploader for the Data Sources cards: drop or pick files to stage
 * them, then press Upload to apply. Nothing reaches the app until the button
 * is pressed, and afterwards the outcome is spelled out by file name — what
 * landed, and what could not be read — rather than left to a row quietly
 * appearing in the card's Uploaded list.
 */
export function StagedUploader({
  label,
  hint,
  accept = ".xlsx,.xls",
  onUpload,
}: {
  label: string;
  hint: string;
  accept?: string;
  onUpload: (files: File[]) => Promise<ImportFilesResult>;
}) {
  const [staged, setStaged] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [outcome, setOutcome] = useState<{ uploaded: string[]; failed: string[] } | null>(null);

  const stage = useCallback((incoming: FileList) => {
    // Copy now: a FileList is live, and the dropzone resets its input right
    // after this returns, which would empty it before the updater runs.
    const files = Array.from(incoming);
    setOutcome(null);
    setStaged((prev) => {
      const next = [...prev];
      for (const file of files) {
        if (!next.some((f) => sameFile(f, file))) next.push(file);
      }
      return next;
    });
  }, []);

  const unstage = (file: File) => setStaged((prev) => prev.filter((f) => f !== file));

  const upload = async () => {
    if (staged.length === 0 || uploading) return;
    setUploading(true);
    try {
      const { files } = await onUpload(staged);
      setOutcome({
        uploaded: files.filter((f) => f.status !== "failed").map((f) => f.fileName),
        failed: files.filter((f) => f.status === "failed").map((f) => f.fileName),
      });
      setStaged([]);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="flex h-full flex-col gap-3">
      <UploadDropzone
        multiple
        size="dataSource"
        className="w-full flex-1"
        disabled={uploading}
        label={label}
        hint={hint}
        accept={accept}
        onFiles={stage}
      />

      {staged.length > 0 && (
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted">
            Ready to upload ({staged.length})
          </p>
          <ul className="mt-2 space-y-2">
            {staged.map((file) => (
              <li
                key={`${file.name}|${file.size}|${file.lastModified}`}
                className="flex items-center gap-2 rounded-lg border border-rule bg-inset/50 py-1.5 pl-3 pr-1.5"
              >
                <FileSpreadsheet className="h-4 w-4 shrink-0 text-accent" />
                <p className="min-w-0 flex-1 truncate text-sm font-medium text-ink">{file.name}</p>
                <span className="shrink-0 font-mono text-xs text-muted">
                  {formatFileSize(file.size)}
                </span>
                <button
                  type="button"
                  className="rounded p-1.5 text-muted hover:bg-critical-soft hover:text-critical focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                  title={`Remove ${file.name}`}
                  aria-label={`Remove ${file.name}`}
                  disabled={uploading}
                  onClick={() => unstage(file)}
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => void upload()}
              disabled={uploading}
              className="min-h-11 rounded-lg bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:bg-accent-hover disabled:opacity-60"
            >
              {uploading
                ? "Uploading…"
                : `Upload ${staged.length} ${staged.length === 1 ? "file" : "files"}`}
            </button>
            <button
              type="button"
              onClick={() => setStaged([])}
              disabled={uploading}
              className="min-h-11 rounded-lg border border-control bg-surface px-4 py-2 text-sm font-medium text-ink-2 hover:bg-inset disabled:opacity-60"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {outcome && (
        <div
          role="status"
          className={cn(
            "flex items-start gap-2 rounded-lg border px-3 py-2 text-sm",
            outcome.uploaded.length > 0
              ? "border-healthy bg-healthy-soft"
              : "border-critical bg-critical-soft"
          )}
        >
          <div className="min-w-0 flex-1 space-y-1">
            {outcome.uploaded.length > 0 && (
              <p className="flex gap-2 text-healthy">
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                <span className="min-w-0 break-words">
                  Uploaded {formatFileNameList(outcome.uploaded)}.
                </span>
              </p>
            )}
            {outcome.failed.length > 0 && (
              <p className="flex gap-2 text-critical">
                <XCircle className="mt-0.5 h-4 w-4 shrink-0" />
                <span className="min-w-0 break-words">
                  Could not upload {formatFileNameList(outcome.failed)} — see the warning below.
                </span>
              </p>
            )}
          </div>
          <button
            type="button"
            className="-mr-1 -mt-0.5 rounded p-1 text-muted hover:text-ink-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            title="Dismiss"
            aria-label="Dismiss"
            onClick={() => setOutcome(null)}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

function sameFile(a: File, b: File): boolean {
  return a.name === b.name && a.size === b.size && a.lastModified === b.lastModified;
}

function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
