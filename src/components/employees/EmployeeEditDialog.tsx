"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Employee } from "@/types";
import { X } from "lucide-react";

export function EmployeeEditDialog({
  employee,
  photoUrl,
  open,
  onClose,
  onSave,
  onUploadFile,
}: {
  employee: Employee;
  photoUrl?: string;
  open: boolean;
  onClose: () => void;
  onSave: (photoUrl: string | null) => void;
  /** When set, allows uploading an image file (e.g. to Supabase Storage). */
  onUploadFile?: (file: File) => Promise<void>;
}) {
  const [draft, setDraft] = useState(photoUrl ?? "");
  const [mounted, setMounted] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const wasOpen = useRef(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (open && !wasOpen.current) {
      setDraft(photoUrl ?? "");
      setUploadError(null);
    }
    wasOpen.current = open;
  }, [open, photoUrl]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open || !mounted) return null;

  const handleSave = () => {
    const trimmed = draft.trim();
    onSave(trimmed || null);
    onClose();
  };

  const handleFile = async (file: File | undefined) => {
    if (!file || !onUploadFile) return;
    if (!file.type.startsWith("image/")) {
      setUploadError("Please choose an image file.");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      setUploadError("Photo must be under 5 MB.");
      return;
    }
    setUploading(true);
    setUploadError(null);
    try {
      await onUploadFile(file);
      onClose();
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="employee-edit-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-5 shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-2">
          <div>
            <h2 id="employee-edit-title" className="text-lg font-semibold text-[#0c2340]">
              Edit employee
            </h2>
            <p className="text-sm text-slate-500">{employee.name}</p>
          </div>
          <button
            type="button"
            className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            aria-label="Close"
            onClick={onClose}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {onUploadFile && (
          <div className="mb-4">
            <p className="mb-2 text-sm font-medium text-slate-700">Upload photo</p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => void handleFile(e.target.files?.[0])}
            />
            <button
              type="button"
              disabled={uploading}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              onClick={() => fileInputRef.current?.click()}
            >
              {uploading ? "Uploading…" : "Choose image"}
            </button>
            <p className="mt-1 text-xs text-slate-500">Saved to Supabase Storage (max 5 MB).</p>
          </div>
        )}

        <label htmlFor="employee-photo-url" className="block text-sm font-medium text-slate-700">
          Photo URL
        </label>
        <p className="mb-2 text-xs text-slate-500">
          Paste a link to a square image (optional). Shown as a circle next to the name.
          {onUploadFile ? " Saved to Supabase when you click Save." : ""}
        </p>
        <input
          id="employee-photo-url"
          type="text"
          autoComplete="off"
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          placeholder="https://…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleSave();
            }
          }}
        />

        {uploadError && <p className="mt-2 text-xs text-red-600">{uploadError}</p>}

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={uploading}
            className="rounded-lg bg-[#0c2340] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#0c2340]/90 disabled:opacity-50"
            onClick={handleSave}
          >
            Save
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
