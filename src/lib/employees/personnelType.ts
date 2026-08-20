import type { AppSettings, PersonnelType } from "@/types";

export const PERSONNEL_TYPES: {
  value: PersonnelType;
  label: string;
  /** Shorter text in table pills and dropdown */
  shortLabel?: string;
  pillClass: string;
  dotClass: string;
}[] = [
  {
    value: "researchDevelopment",
    label: "Research development",
    pillClass: "bg-[#99f6e4] text-[#134e4a] ring-1 ring-[#99f6e4]/50",
    dotClass: "bg-[#0f766e]",
  },
  {
    value: "projectManagementClinical",
    label: "Project management & clinical coordination",
    shortLabel: "PM & clinical coord.",
    pillClass: "bg-[#ddd6fe] text-[#4c1d95] ring-1 ring-[#ddd6fe]/50",
    dotClass: "bg-[#5b21b6]",
  },
  {
    value: "dataManagement",
    label: "Data management",
    pillClass: "bg-[#bfdbfe] text-[#1e3a8a] ring-1 ring-[#bfdbfe]/50",
    dotClass: "bg-[#1d4ed8]",
  },
  {
    value: "communityManagement",
    label: "Community management",
    pillClass: "bg-[#fed7aa] text-[#7c2d12] ring-1 ring-[#fed7aa]/50",
    dotClass: "bg-[#c2410c]",
  },
];

export function getPersonnelTypeDisplayLabel(value: PersonnelType): string {
  const meta = getPersonnelTypeMeta(value);
  return meta.shortLabel ?? meta.label;
}

export function getPersonnelTypeMeta(value: PersonnelType) {
  return PERSONNEL_TYPES.find((t) => t.value === value)!;
}

export function getEmployeePersonnelType(
  settings: AppSettings,
  employeeId: string
): PersonnelType | undefined {
  return settings.employeePersonnelTypes?.[employeeId];
}
