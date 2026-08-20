"use client";

import { useState } from "react";
import { Upload } from "lucide-react";
import { cn } from "@/lib/utils/cn";

/** Shared min height for Data Sources page drop zones. */
export const DATA_SOURCE_DROPZONE_MIN_H = "min-h-[11.5rem]";

export function UploadDropzone({
  onFile,
  onFiles,
  multiple = false,
  size = "default",
  label = "Drop Payroll Funding Report here",
  hint = "or click to browse · .xlsx, .xls",
  accept = ".xlsx,.xls",
  className,
  disabled,
}: {
  onFile?: (f: File) => void;
  onFiles?: (files: FileList) => void;
  multiple?: boolean;
  size?: "default" | "large" | "compact" | "dataSource";
  label?: string;
  hint?: string;
  accept?: string;
  className?: string;
  disabled?: boolean;
}) {
  const [drag, setDrag] = useState(false);

  const handleFiles = (files: FileList | null) => {
    if (!files?.length) return;
    if (multiple && onFiles) {
      onFiles(files);
    } else if (onFile) {
      onFile(files[0]!);
    }
  };

  const sizeClasses = {
    large: cn("px-8 py-14", DATA_SOURCE_DROPZONE_MIN_H, "h-full justify-center"),
    dataSource: cn("px-8 py-10", DATA_SOURCE_DROPZONE_MIN_H, "h-full justify-center"),
    default: "px-8 py-12",
    compact: "px-5 py-8",
  };

  const iconClasses = {
    large: "h-10 w-10",
    dataSource: "h-10 w-10",
    default: "h-10 w-10",
    compact: "h-7 w-7",
  };

  const isDataSourceSize = size === "large" || size === "dataSource";

  return (
    <label
      onDragOver={(e) => {
        e.preventDefault();
        if (!disabled) setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        if (!disabled) handleFiles(e.dataTransfer.files);
      }}
      className={cn(
        "flex cursor-pointer flex-col items-center rounded-xl border-2 border-dashed transition-colors",
        sizeClasses[size],
        drag ? "border-teal-500 bg-teal-50" : "border-slate-200 bg-slate-50/80 hover:border-teal-400 hover:bg-teal-50/30",
        disabled && "pointer-events-none opacity-60",
        className
      )}
    >
      <Upload className={cn("text-teal-600", iconClasses[size])} />
      <p
        className={cn(
          "mt-2 text-center font-medium text-slate-800",
          !isDataSourceSize && size === "compact" && "text-sm"
        )}
      >
        {label}
      </p>
      <p
        className={cn(
          "mt-1 text-center text-slate-500",
          isDataSourceSize ? "text-sm" : size === "compact" ? "text-xs" : "text-sm"
        )}
      >
        {hint}
      </p>
      <input
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        className="hidden"
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = "";
        }}
      />
    </label>
  );
}
