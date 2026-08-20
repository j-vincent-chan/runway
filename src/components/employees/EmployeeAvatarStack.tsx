"use client";

import Link from "next/link";
import type { AppSettings, Employee } from "@/types";
import { getEmployeePhotoUrlFor } from "@/lib/employees/roster";
import { EmployeeAvatar } from "@/components/employees/EmployeeAvatar";
import { cn } from "@/lib/utils/cn";

const MAX_VISIBLE = 8;

export function EmployeeAvatarStack({
  employees,
  settings,
  className,
}: {
  employees: Employee[];
  settings: AppSettings;
  className?: string;
}) {
  if (employees.length === 0) {
    return <span className="text-slate-400">—</span>;
  }

  const visible = employees.slice(0, MAX_VISIBLE);
  const overflow = employees.length - visible.length;
  const label =
    employees.length === 1
      ? employees[0]!.name
      : `${employees.length} employees: ${employees.map((e) => e.name).join(", ")}`;

  return (
    <div
      className={cn("flex items-center justify-center", className)}
      role="group"
      aria-label={label}
      title={label}
    >
      <div className="flex items-center">
        {visible.map((emp, index) => (
          <Link
            key={emp.id}
            href="/employees"
            className={cn(
              "relative inline-block rounded-full transition-transform hover:z-10 hover:scale-110",
              index > 0 && "-ml-2.5"
            )}
            title={emp.name}
          >
            <EmployeeAvatar
              name={emp.name}
              photoUrl={getEmployeePhotoUrlFor(settings, emp)}
              size="sm"
              className="ring-2 ring-white"
            />
          </Link>
        ))}
        {overflow > 0 && (
          <span
            className="-ml-2.5 inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-semibold text-slate-600 ring-2 ring-white"
            title={employees
              .slice(MAX_VISIBLE)
              .map((e) => e.name)
              .join(", ")}
          >
            +{overflow}
          </span>
        )}
      </div>
    </div>
  );
}
