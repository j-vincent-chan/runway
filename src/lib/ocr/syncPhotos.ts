import type { AppSettings, Employee, EmployeeProfile } from "@/types";
import {
  employeeNameKey,
  employeePersonKeys,
  namesLooselyMatch,
  normalizePersonName,
  rematchEmployeeProfiles,
} from "@/lib/employees/stableKey";
import { OCR_PEOPLE_PHOTOS } from "@/lib/ocr/peoplePhotos";
import { upsertEmployeePhoto } from "@/lib/supabase/sync";

export type OcrPhotoSyncResult = {
  matched: number;
  savedRemote: number;
  unmatchedOcrNames: string[];
};

function findOcrPhoto(employeeName: string) {
  const exact = OCR_PEOPLE_PHOTOS.find(
    (p) => normalizePersonName(p.name) === normalizePersonName(employeeName)
  );
  if (exact) return exact;
  return OCR_PEOPLE_PHOTOS.find((p) => namesLooselyMatch(p.name, employeeName));
}

/** Apply OCR website photos onto local settings + optional Supabase. */
export async function syncOcrPeoplePhotos(input: {
  settings: AppSettings;
  employees: Employee[];
}): Promise<{ settings: AppSettings; result: OcrPhotoSyncResult }> {
  const profiles: Record<string, EmployeeProfile> = {
    ...(input.settings.employeeProfiles ?? {}),
  };
  const matchedEmployeeIds = new Set<string>();
  const matchedOcrNames = new Set<string>();
  let savedRemote = 0;

  for (const emp of input.employees) {
    const ocr = findOcrPhoto(emp.name);
    if (!ocr) continue;
    matchedEmployeeIds.add(emp.id);
    matchedOcrNames.add(ocr.name);
    const nameKey = employeeNameKey(emp);
    const ocrKey = `name:${normalizePersonName(ocr.name)}`;
    const next: EmployeeProfile = {
      ...(profiles[ocrKey] ?? {}),
      ...(profiles[nameKey] ?? {}),
      ...(profiles[emp.id] ?? {}),
      photoUrl: ocr.photoUrl,
    };
    profiles[emp.id] = next;
    profiles[nameKey] = { photoUrl: ocr.photoUrl };
    profiles[ocrKey] = { photoUrl: ocr.photoUrl };
    for (const key of employeePersonKeys(emp)) {
      if (key.startsWith("hr:")) {
        profiles[key] = {
          ...(profiles[key] ?? {}),
          photoUrl: ocr.photoUrl,
        };
      }
    }
    try {
      await upsertEmployeePhoto({
        personKey: ocrKey,
        displayName: ocr.name,
        photoUrl: ocr.photoUrl,
      });
      // Also store under the payroll-normalized name key when it differs
      if (nameKey !== ocrKey) {
        await upsertEmployeePhoto({
          personKey: nameKey,
          displayName: emp.name,
          photoUrl: ocr.photoUrl,
        });
      }
      savedRemote += 1;
    } catch {
      // Local merge still applies if remote is unavailable
    }
  }

  const rematched = rematchEmployeeProfiles(profiles, input.employees);
  const unmatchedOcrNames = OCR_PEOPLE_PHOTOS.filter(
    (p) => !matchedOcrNames.has(p.name)
  ).map((p) => p.name);

  return {
    settings: { ...input.settings, employeeProfiles: rematched },
    result: {
      matched: matchedEmployeeIds.size,
      savedRemote,
      unmatchedOcrNames,
    },
  };
}
