import type { AppSettings, Employee, EmployeeOfferLetterMeta } from "@/types";
import { getOfferLetterFile } from "@/lib/storage/offerLetterStore";
import { employeePersonKey, resolveEmployeeProfile } from "@/lib/employees/stableKey";
import { getCurrentUserId } from "@/lib/supabase/authUser";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase/client";
import {
  applyRemoteRosterToSettings,
  remoteRosterRowToRecord,
  type RemoteRosterRecord,
  type RemoteRosterRow,
} from "@/lib/supabase/rosterCloud";
import {
  createSignedStorageUrl,
  encodeStorageRef,
  OFFER_LETTER_BUCKET,
  PHOTO_BUCKET,
  resolveAccessibleUrl,
} from "@/lib/supabase/signedUrl";

export type { RemoteRosterRecord, RemoteRosterRow };
export type RemoteAliasRow = {
  chartstring_key: string;
  alias: string;
  notes: string | null;
  color: string | null;
};

function userScopedPath(userId: string, ...parts: string[]): string {
  return [userId, ...parts.map((p) => p.replace(/^\/+|\/+$/g, ""))].join("/");
}

export async function fetchRemoteAliases(): Promise<
  AppSettings["fundingSourceAliases"]
> {
  const supabase = getSupabase();
  if (!supabase) return {};

  const { data, error } = await supabase
    .from("funding_source_aliases")
    .select("chartstring_key, alias, notes, color");

  if (error) {
    console.warn("[supabase] fetch aliases failed:", error.message);
    return {};
  }

  const out: AppSettings["fundingSourceAliases"] = {};
  for (const row of (data ?? []) as RemoteAliasRow[]) {
    if (!row.chartstring_key || !row.alias?.trim()) continue;
    out[row.chartstring_key] = {
      alias: row.alias.trim(),
      notes: row.notes ?? undefined,
      color: row.color ?? undefined,
    };
  }
  return out;
}

export async function fetchRemoteRosterMeta(): Promise<RemoteRosterRecord[]> {
  const supabase = getSupabase();
  if (!supabase) return [];

  const { data, error } = await supabase.from("employee_roster_meta").select(
    [
      "person_key",
      "display_name",
      "photo_url",
      "photo_path",
      "start_date",
      "end_date",
      "personnel_type",
      "planning_scope",
      "hidden",
      "alumni",
      "offer_letter_url",
      "offer_letter_path",
      "offer_letter_file_name",
      "offer_letter_mime_type",
      "offer_letter_uploaded_at",
      "offer_letter_extracted_start",
      "offer_letter_extracted_end",
    ].join(", ")
  );

  if (error) {
    console.warn("[supabase] fetch roster meta failed:", error.message);
    return [];
  }

  const out: RemoteRosterRecord[] = [];
  for (const row of (data ?? []) as unknown as RemoteRosterRow[]) {
    const rec = remoteRosterRowToRecord(row);
    if (rec) out.push(rec);
  }
  return out;
}

/** Merge remote cloud data over local settings (filled remote fields win). */
export function mergeRemoteSettings(
  local: AppSettings,
  remoteAliases: AppSettings["fundingSourceAliases"],
  remoteRoster: RemoteRosterRecord[],
  employees: Employee[]
): AppSettings {
  const withAliases: AppSettings = {
    ...local,
    fundingSourceAliases: {
      ...local.fundingSourceAliases,
      ...remoteAliases,
    },
  };
  return applyRemoteRosterToSettings(withAliases, remoteRoster, employees);
}

export async function upsertFundingSourceAlias(input: {
  chartstringKey: string;
  alias: string;
  notes?: string;
  color?: string;
}): Promise<void> {
  const supabase = getSupabase();
  const userId = await getCurrentUserId();
  if (!supabase || !userId) return;

  const { error } = await supabase.from("funding_source_aliases").upsert(
    {
      user_id: userId,
      chartstring_key: input.chartstringKey,
      alias: input.alias,
      notes: input.notes ?? null,
      color: input.color ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,chartstring_key" }
  );

  if (error) console.warn("[supabase] upsert alias failed:", error.message);
}

export async function upsertEmployeePhoto(input: {
  personKey: string;
  displayName?: string;
  photoUrl: string | null;
  photoPath?: string | null;
}): Promise<void> {
  const supabase = getSupabase();
  const userId = await getCurrentUserId();
  if (!supabase || !userId) return;

  if (!input.photoUrl && !input.photoPath) {
    const { error } = await supabase
      .from("employee_roster_meta")
      .upsert(
        {
          user_id: userId,
          person_key: input.personKey,
          display_name: input.displayName ?? null,
          photo_url: null,
          photo_path: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,person_key" }
      );
    if (error) console.warn("[supabase] clear photo failed:", error.message);
    return;
  }

  const { error } = await supabase.from("employee_roster_meta").upsert(
    {
      user_id: userId,
      person_key: input.personKey,
      display_name: input.displayName ?? null,
      photo_url: input.photoUrl,
      photo_path: input.photoPath ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,person_key" }
  );

  if (error) console.warn("[supabase] upsert photo failed:", error.message);
}

/** Upload an image to private Storage; returns a stable sb:// ref (use signed URLs to display). */
export async function uploadEmployeePhotoFile(
  emp: Pick<Employee, "employeeId" | "name">,
  file: File
): Promise<{ storageRef: string; storagePath: string; signedUrl: string }> {
  const supabase = getSupabase();
  const userId = await getCurrentUserId();
  if (!supabase || !userId) {
    throw new Error(
      "Sign in to upload photos to private cloud storage."
    );
  }

  const personKey = employeePersonKey(emp);
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = userScopedPath(
    userId,
    personKey.replace(/[/\\]/g, "_"),
    `${Date.now()}-${safeName}`
  );

  const { error: uploadError } = await supabase.storage
    .from(PHOTO_BUCKET)
    .upload(path, file, {
      cacheControl: "3600",
      upsert: true,
      contentType: file.type || "image/jpeg",
    });

  if (uploadError) {
    throw new Error(uploadError.message || "Photo upload failed.");
  }

  const signedUrl = await createSignedStorageUrl(PHOTO_BUCKET, path);
  if (!signedUrl) {
    throw new Error("Could not create signed URL for uploaded photo.");
  }
  return {
    storagePath: path,
    storageRef: encodeStorageRef(PHOTO_BUCKET, path),
    signedUrl,
  };
}

export type RosterCloudPatch = {
  personKey: string;
  displayName?: string | null;
  photoUrl?: string | null;
  photoPath?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  personnelType?: string | null;
  planningScope?: number | null;
  hidden?: boolean;
  alumni?: boolean;
  offerLetter?: EmployeeOfferLetterMeta | null;
};

export async function upsertEmployeeRosterMeta(patch: RosterCloudPatch): Promise<void> {
  const supabase = getSupabase();
  const userId = await getCurrentUserId();
  if (!supabase || !userId) return;

  const row: Record<string, unknown> = {
    user_id: userId,
    person_key: patch.personKey,
    updated_at: new Date().toISOString(),
  };
  if (patch.displayName !== undefined) row.display_name = patch.displayName;
  if (patch.photoUrl !== undefined) row.photo_url = patch.photoUrl;
  if (patch.photoPath !== undefined) row.photo_path = patch.photoPath;
  if (patch.startDate !== undefined) row.start_date = patch.startDate;
  if (patch.endDate !== undefined) row.end_date = patch.endDate;
  if (patch.personnelType !== undefined) row.personnel_type = patch.personnelType;
  if (patch.planningScope !== undefined) row.planning_scope = patch.planningScope;
  if (patch.hidden !== undefined) row.hidden = patch.hidden;
  if (patch.alumni !== undefined) row.alumni = patch.alumni;
  if (patch.offerLetter !== undefined) {
    const letter = patch.offerLetter;
    row.offer_letter_url = letter?.fileUrl ?? null;
    row.offer_letter_path = letter?.storagePath ?? null;
    row.offer_letter_file_name = letter?.fileName ?? null;
    row.offer_letter_mime_type = letter?.mimeType ?? null;
    row.offer_letter_uploaded_at = letter?.uploadedAt ?? null;
    row.offer_letter_extracted_start = letter?.extractedStartDate ?? null;
    row.offer_letter_extracted_end = letter?.extractedEndDate ?? null;
  }

  const { error } = await supabase
    .from("employee_roster_meta")
    .upsert(row, { onConflict: "user_id,person_key" });
  if (error) console.warn("[supabase] upsert roster meta failed:", error.message);
}

export async function uploadEmployeeOfferLetterFile(
  emp: Pick<Employee, "employeeId" | "name">,
  file: File
): Promise<{ storageRef: string; storagePath: string; signedUrl: string }> {
  const supabase = getSupabase();
  const userId = await getCurrentUserId();
  if (!supabase || !userId) {
    throw new Error(
      "Sign in to upload offer letters to private cloud storage."
    );
  }

  const personKey = employeePersonKey(emp);
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = userScopedPath(
    userId,
    personKey.replace(/[/\\]/g, "_"),
    `${Date.now()}-${safeName}`
  );

  const { error: uploadError } = await supabase.storage.from(OFFER_LETTER_BUCKET).upload(
    storagePath,
    file,
    {
      cacheControl: "3600",
      upsert: true,
      contentType: file.type || "application/octet-stream",
    }
  );
  if (uploadError) {
    throw new Error(uploadError.message || "Offer letter upload failed.");
  }

  const signedUrl = await createSignedStorageUrl(OFFER_LETTER_BUCKET, storagePath);
  if (!signedUrl) {
    throw new Error("Could not create signed URL for uploaded offer letter.");
  }
  return {
    storagePath,
    storageRef: encodeStorageRef(OFFER_LETTER_BUCKET, storagePath),
    signedUrl,
  };
}

export async function deleteEmployeeOfferLetterFile(storagePath: string | undefined): Promise<void> {
  const supabase = getSupabase();
  if (!supabase || !storagePath) return;
  const { error } = await supabase.storage.from(OFFER_LETTER_BUCKET).remove([storagePath]);
  if (error) console.warn("[supabase] delete offer letter failed:", error.message);
}

export async function openOfferLetterFromCloud(meta: {
  fileUrl?: string;
  storagePath?: string;
}): Promise<void> {
  const url = await resolveAccessibleUrl(
    meta.fileUrl,
    meta.storagePath,
    OFFER_LETTER_BUCKET
  );
  if (!url) throw new Error("No offer letter on file.");
  window.open(url, "_blank", "noopener,noreferrer");
}

/** Upload locally cached offer letters that are not yet in Storage. */
export async function backfillOfferLettersToCloud(
  employees: Employee[],
  settings: AppSettings
): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const userId = await getCurrentUserId();
  if (!userId) return;
  for (const emp of employees) {
    const profile = resolveEmployeeProfile(settings, emp);
    const letter = profile?.offerLetter;
    if (!letter || letter.storagePath || letter.fileUrl) continue;
    const stored = await getOfferLetterFile(emp.id);
    if (!stored) continue;
    try {
      const file = new File([stored.blob], stored.fileName, {
        type: stored.mimeType || "application/octet-stream",
      });
      const uploaded = await uploadEmployeeOfferLetterFile(emp, file);
      await upsertEmployeeRosterMeta({
        personKey: employeePersonKey(emp),
        displayName: emp.name,
        startDate: profile?.startDate ?? null,
        endDate: profile?.endDate ?? null,
        offerLetter: {
          ...letter,
          fileUrl: uploaded.storageRef,
          storagePath: uploaded.storagePath,
        },
      });
    } catch (err) {
      console.warn("[supabase] offer letter backfill failed:", err);
    }
  }
}

export { isSupabaseConfigured };
