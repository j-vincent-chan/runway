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

export type LabPhotoPerson = {
  name: string;
  photoUrl: string;
};

export type LabPhotoSyncResult = {
  matched: number;
  savedRemote: number;
  unmatchedOcrNames: string[];
};

function findPhoto(employeeName: string, photos: LabPhotoPerson[]) {
  const exact = photos.find(
    (p) => normalizePersonName(p.name) === normalizePersonName(employeeName)
  );
  if (exact) return exact;
  return photos.find((p) => namesLooselyMatch(p.name, employeeName));
}

/** Apply lab website photos onto local settings + optional Supabase. */
export async function syncLabPeoplePhotos(input: {
  settings: AppSettings;
  employees: Employee[];
  photos: LabPhotoPerson[];
}): Promise<{ settings: AppSettings; result: LabPhotoSyncResult }> {
  const profiles: Record<string, EmployeeProfile> = {
    ...(input.settings.employeeProfiles ?? {}),
  };
  const matchedEmployeeIds = new Set<string>();
  const matchedNames = new Set<string>();
  let savedRemote = 0;

  for (const emp of input.employees) {
    const photo = findPhoto(emp.name, input.photos);
    if (!photo) continue;
    matchedEmployeeIds.add(emp.id);
    matchedNames.add(photo.name);
    const nameKey = employeeNameKey(emp);
    const photoKey = `name:${normalizePersonName(photo.name)}`;
    const next: EmployeeProfile = {
      ...(profiles[photoKey] ?? {}),
      ...(profiles[nameKey] ?? {}),
      ...(profiles[emp.id] ?? {}),
      photoUrl: photo.photoUrl,
    };
    profiles[emp.id] = next;
    profiles[nameKey] = { photoUrl: photo.photoUrl };
    profiles[photoKey] = { photoUrl: photo.photoUrl };
    for (const key of employeePersonKeys(emp)) {
      if (key.startsWith("hr:")) {
        profiles[key] = {
          ...(profiles[key] ?? {}),
          photoUrl: photo.photoUrl,
        };
      }
    }
    try {
      await upsertEmployeePhoto({
        personKey: photoKey,
        displayName: photo.name,
        photoUrl: photo.photoUrl,
      });
      if (nameKey !== photoKey) {
        await upsertEmployeePhoto({
          personKey: nameKey,
          displayName: emp.name,
          photoUrl: photo.photoUrl,
        });
      }
      savedRemote += 1;
    } catch {
      // Local merge still applies if remote is unavailable
    }
  }

  const rematched = rematchEmployeeProfiles(profiles, input.employees);
  const unmatchedOcrNames = input.photos
    .filter((p) => !matchedNames.has(p.name))
    .map((p) => p.name);

  return {
    settings: { ...input.settings, employeeProfiles: rematched },
    result: {
      matched: matchedEmployeeIds.size,
      savedRemote,
      unmatchedOcrNames,
    },
  };
}

/** @deprecated Prefer syncLabPeoplePhotos with curated or scraped photos */
export async function syncOcrPeoplePhotos(input: {
  settings: AppSettings;
  employees: Employee[];
}): Promise<{ settings: AppSettings; result: LabPhotoSyncResult }> {
  return syncLabPeoplePhotos({
    ...input,
    photos: OCR_PEOPLE_PHOTOS.map((p) => ({ name: p.name, photoUrl: p.photoUrl })),
  });
}
