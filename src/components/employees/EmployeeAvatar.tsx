"use client";

import { useEffect, useState } from "react";
import { employeeInitials } from "@/lib/employees/roster";
import { resolveAccessibleUrl } from "@/lib/supabase/signedUrl";
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
  const [resolvedUrl, setResolvedUrl] = useState<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    setResolvedUrl(undefined);
    if (!photoUrl?.trim()) return;
    void resolveAccessibleUrl(photoUrl).then((url) => {
      if (cancelled) return;
      setResolvedUrl(url ?? undefined);
    });
    return () => {
      cancelled = true;
    };
  }, [photoUrl]);

  const dim =
    size === "xs"
      ? "h-6 w-6 text-[9px]"
      : size === "sm"
        ? "h-7 w-7 text-[10px]"
        : size === "lg"
          ? "h-12 w-12 text-sm"
          : "h-9 w-9 text-xs";
  const showPhoto = resolvedUrl && !failed;

  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-rule font-semibold text-ink-2 ring-1 ring-rule",
        dim,
        className
      )}
      title={name}
    >
      {showPhoto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={resolvedUrl}
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
