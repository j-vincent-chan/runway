"use client";

import type { Employee } from "@/types";
import { EmployeeAvatar } from "@/components/employees/EmployeeAvatar";
import { setDragEmployee } from "@/lib/org/dnd";
import { cn } from "@/lib/utils/cn";

export function StructureEmployeeCard({
  employee,
  photoUrl,
  variant = "default",
  onDragStart,
  onDragEnd,
  isDragging,
}: {
  employee: Employee;
  photoUrl?: string;
  variant?: "default" | "lead";
  onDragStart?: () => void;
  onDragEnd?: () => void;
  isDragging?: boolean;
}) {
  const subtitle = (employee.role?.trim() || "Team member").toUpperCase();
  const isLead = variant === "lead";

  return (
    <div
      draggable
      onDragStart={(e) => {
        setDragEmployee(e.dataTransfer, employee.id);
        e.dataTransfer.setData("text/plain", employee.id);
        onDragStart?.();
      }}
      onDragEnd={onDragEnd}
      className={cn(
        "group relative flex cursor-grab items-stretch active:cursor-grabbing",
        isLead ? "min-h-[4rem] max-w-md" : "min-h-[3.25rem] w-full max-w-[15rem]",
        isDragging && "opacity-40"
      )}
    >
      <div
        className={cn(
          "relative z-10 flex shrink-0 items-center",
          isLead ? "-mr-6 pl-0.5" : "-mr-5 pl-0.5"
        )}
      >
        <EmployeeAvatar
          name={employee.name}
          photoUrl={photoUrl}
          size={isLead ? "lg" : "lg"}
          className={cn("ring-2 ring-white", isLead && "h-14 w-14 text-sm")}
        />
      </div>
      <div
        className={cn(
          "flex min-w-0 flex-1 flex-col justify-center rounded-full bg-[#0c2340] text-white shadow-md",
          isLead ? "py-2.5 pl-8 pr-5" : "py-2 pl-7 pr-4 shadow-sm"
        )}
      >
        <p
          className={cn(
            "truncate font-semibold leading-tight",
            isLead ? "text-base" : "text-sm"
          )}
        >
          {employee.name}
        </p>
        <p
          className={cn(
            "truncate leading-tight text-slate-300",
            isLead ? "text-[11px]" : "text-[10px]"
          )}
        >
          {subtitle}
        </p>
      </div>
    </div>
  );
}
