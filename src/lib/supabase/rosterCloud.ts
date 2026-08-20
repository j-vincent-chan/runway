import type {
  AppSettings,
  Employee,
  EmployeeOfferLetterMeta,
  EmployeeProfile,
  PersonnelType,
} from "@/types";
import { employeePersonKey } from "@/lib/employees/stableKey";

/** PersonnelType is now an open string (catalog group id); accept any non-empty value. */
export function isPersonnelType(value: string | null | undefined): value is PersonnelType {
  return Boolean(value && value.trim());
}

export type RemoteRosterRecord = {
  personKey: string;
  displayName: string | null;
  photoUrl: string | null;
  photoPath: string | null;
  startDate: string | null;
  endDate: string | null;
  personnelType: PersonnelType | null;
  planningScope: number | null;
  hidden: boolean | null;
  alumni: boolean | null;
  offerLetter: EmployeeOfferLetterMeta | null;
};

export type RemoteRosterRow = {
  person_key: string;
  display_name: string | null;
  photo_url: string | null;
  photo_path?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  personnel_type?: string | null;
  planning_scope?: number | string | null;
  hidden?: boolean | null;
  alumni?: boolean | null;
  offer_letter_url?: string | null;
  offer_letter_path?: string | null;
  offer_letter_file_name?: string | null;
  offer_letter_mime_type?: string | null;
  offer_letter_uploaded_at?: string | null;
  offer_letter_extracted_start?: string | null;
  offer_letter_extracted_end?: string | null;
};

function dateOnly(value: string | null | undefined): string | null {
  const v = value?.trim();
  if (!v) return null;
  return v.slice(0, 10);
}

export function remoteRosterRowToRecord(row: RemoteRosterRow): RemoteRosterRecord | null {
  if (!row.person_key) return null;
  const scopeRaw = row.planning_scope;
  const scope =
    scopeRaw === null || scopeRaw === undefined || scopeRaw === ""
      ? null
      : Number(scopeRaw);
  const fileUrl = row.offer_letter_url?.trim() || undefined;
  const fileName = row.offer_letter_file_name?.trim();
  const photoPath = row.photo_path?.trim() || null;
  const photoUrlRaw = row.photo_url?.trim() || null;
  const offerLetter: EmployeeOfferLetterMeta | null =
    fileUrl || fileName || row.offer_letter_path
      ? {
          fileName: fileName || "offer-letter",
          mimeType: row.offer_letter_mime_type?.trim() || "application/octet-stream",
          uploadedAt: row.offer_letter_uploaded_at || new Date().toISOString(),
          extractedStartDate: dateOnly(row.offer_letter_extracted_start) ?? undefined,
          extractedEndDate: dateOnly(row.offer_letter_extracted_end) ?? undefined,
          fileUrl,
          storagePath: row.offer_letter_path?.trim() || undefined,
        }
      : null;

  return {
    personKey: row.person_key,
    displayName: row.display_name,
    photoUrl: photoUrlRaw,
    photoPath,
    startDate: dateOnly(row.start_date),
    endDate: dateOnly(row.end_date),
    personnelType: isPersonnelType(row.personnel_type) ? row.personnel_type : null,
    planningScope: scope !== null && Number.isFinite(scope) ? scope : null,
    hidden: typeof row.hidden === "boolean" ? row.hidden : null,
    alumni: typeof row.alumni === "boolean" ? row.alumni : null,
    offerLetter,
  };
}

function mergeProfile(
  local: EmployeeProfile | undefined,
  remote: RemoteRosterRecord
): EmployeeProfile {
  const next: EmployeeProfile = { ...local };
  // Prefer private storage ref / path encoding over stale public URLs
  if (remote.photoPath) {
    next.photoUrl = `sb://employee-photos/${remote.photoPath}`;
  } else if (remote.photoUrl) {
    next.photoUrl = remote.photoUrl;
  }
  if (remote.startDate) next.startDate = remote.startDate;
  if (remote.endDate) next.endDate = remote.endDate;
  if (remote.offerLetter) next.offerLetter = remote.offerLetter;
  return next;
}

/** Apply cloud roster rows onto local settings. Filled remote fields win; empty remote keeps local. */
export function applyRemoteRosterToSettings(
  local: AppSettings,
  records: RemoteRosterRecord[],
  employees: Employee[]
): AppSettings {
  const profiles: Record<string, EmployeeProfile> = { ...(local.employeeProfiles ?? {}) };
  const personnelTypes: Record<string, PersonnelType> = { ...(local.employeePersonnelTypes ?? {}) };
  const planningScope: Record<string, number> = { ...(local.employeePlanningScope ?? {}) };
  const hidden = new Set(local.hiddenEmployeeIds ?? []);
  const alumni = new Set(local.alumniEmployeeIds ?? []);

  const byPersonKey = new Map(employees.map((emp) => [employeePersonKey(emp), emp]));

  for (const rec of records) {
    const localProfile = profiles[rec.personKey];
    const merged = mergeProfile(localProfile, rec);
    if (merged.photoUrl || merged.startDate || merged.endDate || merged.offerLetter) {
      profiles[rec.personKey] = merged;
    }

    const emp = byPersonKey.get(rec.personKey);
    if (!emp) continue;

    if (merged.photoUrl || merged.startDate || merged.endDate || merged.offerLetter) {
      profiles[emp.id] = { ...(profiles[emp.id] ?? {}), ...merged };
    }
    if (rec.personnelType) personnelTypes[emp.id] = rec.personnelType;
    if (rec.planningScope !== null) planningScope[emp.id] = rec.planningScope;
    if (rec.hidden === true) hidden.add(emp.id);
    else if (rec.hidden === false) hidden.delete(emp.id);
    if (rec.alumni === true) alumni.add(emp.id);
    else if (rec.alumni === false) alumni.delete(emp.id);
  }

  return {
    ...local,
    employeeProfiles: profiles,
    employeePersonnelTypes: personnelTypes,
    employeePlanningScope: planningScope,
    hiddenEmployeeIds: [...hidden],
    alumniEmployeeIds: [...alumni],
  };
}
