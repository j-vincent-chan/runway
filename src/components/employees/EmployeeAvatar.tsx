"use client";

import { useState } from "react";
import { employeeInitials } from "@/lib/employees/roster";
import { cn } from "@/lib/utils/cn";

export function EmployeeAvatar({
  name,
  photoUrl,
  size = "md",
  className,
}: {
  name: string;
  photoUrl?: string;
  size?: "xs" | "sm" | "md" | "lg";
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const dim =
    size === "xs"
      ? "h-6 w-6 text-[9px]"
      : size === "sm"
      ? "h-7 w-7 text-[10px]"
      : size === "lg"
        ? "h-12 w-12 text-sm"
        : "h-9 w-9 text-xs";
  const showPhoto = photoUrl && !failed;

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-slate-200 font-semibold text-slate-600 ring-1 ring-slate-200",
        dim,
        className
      )}
      title={name}
    >
      {showPhoto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photoUrl}
          alt=""
          className="h-full w-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        employeeInitials(name)
      )}
    </span>
  );
}
