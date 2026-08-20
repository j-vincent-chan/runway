"use client";

import { useRef, useState } from "react";
import { FileText, Loader2, Upload } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { formatEmploymentDate } from "@/lib/employees/profile";
import type { EmployeeOfferLetterMeta } from "@/types";
import { OFFER_LETTER_ACCEPT } from "@/lib/employees/offerLetterParse";

export function EmployeeStartDateCell({
  startDate,
  offerLetter,
  onStartDateChange,
  onUploadOfferLetter,
  onViewOfferLetter,
  onRemoveOfferLetter,
}: {
  startDate?: string;
  offerLetter?: EmployeeOfferLetterMeta;
  onStartDateChange: (iso: string | null) => void;
  onUploadOfferLetter: (file: File) => Promise<{ startDate?: string; endDate?: string }>;
  onViewOfferLetter: () => void;
  onRemoveOfferLetter: () => void | Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadHint, setUploadHint] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    setUploading(true);
    setUploadHint(null);
    try {
      const extracted = await onUploadOfferLetter(file);
      if (extracted.startDate) {
        setUploadHint(`Start set from letter (${formatEmploymentDate(extracted.startDate)})`);
      } else {
        setUploadHint("Letter saved — enter start date if needed");
      }
    } catch (e) {
      setUploadHint(e instanceof Error ? e.message : "Could not read offer letter");
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <div className="min-w-[8.5rem] space-y-1">
      <input
        type="date"
        value={startDate ?? ""}
        onChange={(e) => onStartDateChange(e.target.value || null)}
        className="w-full rounded border border-slate-200 px-1.5 py-0.5 text-xs text-slate-800"
        title="Employment start date"
      />
      <div className="flex flex-wrap items-center gap-1">
        <input
          ref={inputRef}
          type="file"
          accept={OFFER_LETTER_ACCEPT}
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void handleFile(file);
          }}
        />
        <button
          type="button"
          disabled={uploading}
          onClick={() => inputRef.current?.click()}
          className={cn(
            "inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[10px] font-medium",
            offerLetter
              ? "border-teal-200 bg-teal-50 text-teal-800 hover:bg-teal-100"
              : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
          )}
          title="Upload offer letter (PDF, .docx, or .txt)"
        >
          {uploading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : offerLetter ? (
            <FileText className="h-3 w-3" />
          ) : (
            <Upload className="h-3 w-3" />
          )}
          {offerLetter ? "Replace" : "Offer letter"}
        </button>
        {offerLetter && (
          <>
            <button
              type="button"
              onClick={onViewOfferLetter}
              className="max-w-[5rem] truncate text-[10px] text-teal-700 hover:underline"
              title={offerLetter.fileName}
            >
              View
            </button>
            <button
              type="button"
              onClick={() => void onRemoveOfferLetter()}
              className="text-[10px] text-slate-400 hover:text-red-600"
            >
              ×
            </button>
          </>
        )}
      </div>
      {uploadHint && <p className="text-[10px] leading-snug text-slate-500">{uploadHint}</p>}
      {!uploadHint && offerLetter && (
        <p className="truncate text-[10px] text-slate-400" title={offerLetter.fileName}>
          {offerLetter.fileName}
        </p>
      )}
    </div>
  );
}
