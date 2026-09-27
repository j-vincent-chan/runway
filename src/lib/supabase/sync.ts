import type { AppSettings, Employee, EmployeeOfferLetterMeta, PersonLink, PlannedHire } from "@/types";
import { getOfferLetterFile } from "@/lib/storage/offerLetterStore";
import { employeePersonKey, resolveEmployeeProfile } from "@/lib/employees/stableKey";
import { getActiveWorkspaceOwnerId } from "@/lib/supabase/activeWorkspace";
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

/**
 * Union two entity arrays by id, remote winning on conflict — the same
 * "filled/present wins" philosophy as the flat-map merges above, generalized
 * to arrays of per-entity rows (planned hires, links, reconciliation
 * records, ...). Local-only entries survive in case a remote fetch raced a
 * not-yet-synced local edit.
 */
function mergeArrayById<T extends { id: string }>(local: T[], remote: T[]): T[] {
  const byId = new Map(local.map((item) => [item.id, item]));
  for (const item of remote) byId.set(item.id, item);
  return [...byId.values()];
}

export async function fetchRemoteAliases(): Promise<
  AppSettings["fundingSourceAliases"]
> {
  const supabase = getSupabase();
  const ownerId = await getActiveWorkspaceOwnerId();
  if (!supabase || !ownerId) return {};

  const { data, error } = await supabase
    .from("funding_source_aliases")
    .select("chartstring_key, alias, notes, color")
    .eq("user_id", ownerId);

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

export type RemoteAccountGroupAssignmentRow = {
  account_key: string;
  group_id: string;
};

export async function fetchRemoteAccountGroupAssignments(): Promise<
  NonNullable<AppSettings["accountGroupByBalanceKey"]>
> {
  const supabase = getSupabase();
  const ownerId = await getActiveWorkspaceOwnerId();
  if (!supabase || !ownerId) return {};

  const { data, error } = await supabase
    .from("account_group_assignments")
    .select("account_key, group_id")
    .eq("user_id", ownerId);

  if (error) {
    console.warn("[supabase] fetch account group assignments failed:", error.message);
    return {};
  }

  const out: NonNullable<AppSettings["accountGroupByBalanceKey"]> = {};
  for (const row of (data ?? []) as RemoteAccountGroupAssignmentRow[]) {
    if (!row.account_key || !row.group_id) continue;
    out[row.account_key] = row.group_id;
  }
  return out;
}

export async function upsertAccountGroupAssignment(
  accountKey: string,
  groupId: string
): Promise<void> {
  const supabase = getSupabase();
  const userId = await getActiveWorkspaceOwnerId();
  if (!supabase || !userId) return;

  const { error } = await supabase.from("account_group_assignments").upsert(
    {
      user_id: userId,
      account_key: accountKey,
      group_id: groupId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,account_key" }
  );

  if (error) console.warn("[supabase] upsert account group assignment failed:", error.message);
}

export async function deleteAccountGroupAssignmentRemote(accountKey: string): Promise<void> {
  const supabase = getSupabase();
  const userId = await getActiveWorkspaceOwnerId();
  if (!supabase || !userId) return;
  const { error } = await supabase
    .from("account_group_assignments")
    .delete()
    .eq("user_id", userId)
    .eq("account_key", accountKey);
  if (error) console.warn("[supabase] delete account group assignment failed:", error.message);
}

export type RemoteFundingSourceCategoryAssignmentRow = {
  chartstring_key: string;
  category: string;
};

export async function fetchRemoteFundingSourceCategoryAssignments(): Promise<
  NonNullable<AppSettings["fundingSourceCategories"]>
> {
  const supabase = getSupabase();
  const ownerId = await getActiveWorkspaceOwnerId();
  if (!supabase || !ownerId) return {};

  const { data, error } = await supabase
    .from("funding_source_category_assignments")
    .select("chartstring_key, category")
    .eq("user_id", ownerId);

  if (error) {
    console.warn("[supabase] fetch funding source category assignments failed:", error.message);
    return {};
  }

  const out: NonNullable<AppSettings["fundingSourceCategories"]> = {};
  for (const row of (data ?? []) as RemoteFundingSourceCategoryAssignmentRow[]) {
    if (!row.chartstring_key || !row.category) continue;
    out[row.chartstring_key] = row.category;
  }
  return out;
}

export async function upsertFundingSourceCategoryAssignment(
  chartstringKey: string,
  category: string
): Promise<void> {
  const supabase = getSupabase();
  const userId = await getActiveWorkspaceOwnerId();
  if (!supabase || !userId) return;

  const { error } = await supabase.from("funding_source_category_assignments").upsert(
    {
      user_id: userId,
      chartstring_key: chartstringKey,
      category,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,chartstring_key" }
  );

  if (error) {
    console.warn("[supabase] upsert funding source category assignment failed:", error.message);
  }
}

export async function deleteFundingSourceCategoryAssignmentRemote(
  chartstringKey: string
): Promise<void> {
  const supabase = getSupabase();
  const userId = await getActiveWorkspaceOwnerId();
  if (!supabase || !userId) return;
  const { error } = await supabase
    .from("funding_source_category_assignments")
    .delete()
    .eq("user_id", userId)
    .eq("chartstring_key", chartstringKey);
  if (error) {
    console.warn("[supabase] delete funding source category assignment failed:", error.message);
  }
}

type RemotePlannedHireRow = {
  id: string;
  display_name: string;
  role: string | null;
  team_id: string | null;
  start_month: string;
  end_month: string | null;
  appointment_percent: number;
  annual_salary: number;
  benefits_rate_pct: number;
  notes: string | null;
  created_at: string;
  created_by: string;
};

function remotePlannedHireRowToRecord(row: RemotePlannedHireRow): PlannedHire {
  return {
    id: row.id,
    displayName: row.display_name,
    role: row.role ?? undefined,
    teamId: (row.team_id as PlannedHire["teamId"]) ?? undefined,
    startMonth: row.start_month,
    endMonth: row.end_month ?? undefined,
    appointmentPercent: row.appointment_percent,
    annualSalary: row.annual_salary,
    benefitsRatePct: row.benefits_rate_pct,
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
    createdBy: row.created_by,
  };
}

export async function fetchRemotePlannedHires(): Promise<PlannedHire[]> {
  const supabase = getSupabase();
  const ownerId = await getActiveWorkspaceOwnerId();
  if (!supabase || !ownerId) return [];

  const { data, error } = await supabase
    .from("planned_hires")
    .select(
      [
        "id",
        "display_name",
        "role",
        "team_id",
        "start_month",
        "end_month",
        "appointment_percent",
        "annual_salary",
        "benefits_rate_pct",
        "notes",
        "created_at",
        "created_by",
      ].join(", ")
    )
    .eq("user_id", ownerId);

  if (error) {
    console.warn("[supabase] fetch planned hires failed:", error.message);
    return [];
  }

  return ((data ?? []) as unknown as RemotePlannedHireRow[]).map(remotePlannedHireRowToRecord);
}

export async function upsertPlannedHire(plan: PlannedHire): Promise<void> {
  const supabase = getSupabase();
  const userId = await getActiveWorkspaceOwnerId();
  if (!supabase || !userId) return;

  const { error } = await supabase.from("planned_hires").upsert(
    {
      user_id: userId,
      id: plan.id,
      display_name: plan.displayName,
      role: plan.role ?? null,
      team_id: plan.teamId ?? null,
      start_month: plan.startMonth,
      end_month: plan.endMonth ?? null,
      appointment_percent: plan.appointmentPercent,
      annual_salary: plan.annualSalary,
      benefits_rate_pct: plan.benefitsRatePct,
      notes: plan.notes ?? null,
      created_at: plan.createdAt,
      created_by: plan.createdBy,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,id" }
  );

  if (error) console.warn("[supabase] upsert planned hire failed:", error.message);
}

export async function deletePlannedHireRemote(id: string): Promise<void> {
  const supabase = getSupabase();
  const userId = await getActiveWorkspaceOwnerId();
  if (!supabase || !userId) return;
  const { error } = await supabase
    .from("planned_hires")
    .delete()
    .eq("user_id", userId)
    .eq("id", id);
  if (error) console.warn("[supabase] delete planned hire failed:", error.message);
}

type RemotePersonLinkRow = {
  id: string;
  planned_hire_id: string;
  employee_person_key: string;
  basis: string;
  signals: string[] | null;
  linked_at: string;
  linked_by: string;
  reversed_at: string | null;
  reversed_by: string | null;
  copied_team: boolean | null;
  copied_start_date: boolean | null;
  copied_scope: boolean | null;
};

function remotePersonLinkRowToRecord(row: RemotePersonLinkRow): PersonLink {
  const copied =
    row.copied_team !== null || row.copied_start_date !== null || row.copied_scope !== null
      ? {
          ...(row.copied_team !== null ? { team: row.copied_team } : {}),
          ...(row.copied_start_date !== null ? { startDate: row.copied_start_date } : {}),
          ...(row.copied_scope !== null ? { scope: row.copied_scope } : {}),
        }
      : undefined;
  return {
    id: row.id,
    plannedHireId: row.planned_hire_id,
    employeePersonKey: row.employee_person_key,
    basis: row.basis as PersonLink["basis"],
    signals: row.signals ?? [],
    linkedAt: row.linked_at,
    linkedBy: row.linked_by,
    ...(row.reversed_at ? { reversedAt: row.reversed_at } : {}),
    ...(row.reversed_by ? { reversedBy: row.reversed_by } : {}),
    ...(copied ? { copied } : {}),
  };
}

export async function fetchRemotePersonLinks(): Promise<PersonLink[]> {
  const supabase = getSupabase();
  const ownerId = await getActiveWorkspaceOwnerId();
  if (!supabase || !ownerId) return [];

  const { data, error } = await supabase
    .from("person_links")
    .select(
      [
        "id",
        "planned_hire_id",
        "employee_person_key",
        "basis",
        "signals",
        "linked_at",
        "linked_by",
        "reversed_at",
        "reversed_by",
        "copied_team",
        "copied_start_date",
        "copied_scope",
      ].join(", ")
    )
    .eq("user_id", ownerId);

  if (error) {
    console.warn("[supabase] fetch person links failed:", error.message);
    return [];
  }

  return ((data ?? []) as unknown as RemotePersonLinkRow[]).map(remotePersonLinkRowToRecord);
}

/** Links are never locally deleted — Unlink marks reversedAt/reversedBy instead. */
export async function upsertPersonLink(link: PersonLink): Promise<void> {
  const supabase = getSupabase();
  const userId = await getActiveWorkspaceOwnerId();
  if (!supabase || !userId) return;

  const { error } = await supabase.from("person_links").upsert(
    {
      user_id: userId,
      id: link.id,
      planned_hire_id: link.plannedHireId,
      employee_person_key: link.employeePersonKey,
      basis: link.basis,
      signals: link.signals,
      linked_at: link.linkedAt,
      linked_by: link.linkedBy,
      reversed_at: link.reversedAt ?? null,
      reversed_by: link.reversedBy ?? null,
      copied_team: link.copied?.team ?? null,
      copied_start_date: link.copied?.startDate ?? null,
      copied_scope: link.copied?.scope ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,id" }
  );

  if (error) console.warn("[supabase] upsert person link failed:", error.message);
}

export async function fetchRemoteRosterMeta(): Promise<RemoteRosterRecord[]> {
  const supabase = getSupabase();
  const ownerId = await getActiveWorkspaceOwnerId();
  if (!supabase || !ownerId) return [];

  const query = supabase.from("employee_roster_meta").select(
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
  const { data, error } = await query.eq("user_id", ownerId);

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
  employees: Employee[],
  remoteAccountGroups?: AppSettings["accountGroupByBalanceKey"],
  remoteFundingSourceCategories?: AppSettings["fundingSourceCategories"],
  remotePlannedHires?: PlannedHire[],
  remotePersonLinks?: PersonLink[]
): AppSettings {
  const withAliases: AppSettings = {
    ...local,
    fundingSourceAliases: {
      ...local.fundingSourceAliases,
      ...remoteAliases,
    },
    accountGroupByBalanceKey: {
      ...local.accountGroupByBalanceKey,
      ...remoteAccountGroups,
    },
    fundingSourceCategories: {
      ...local.fundingSourceCategories,
      ...remoteFundingSourceCategories,
    },
    plannedHires: mergeArrayById(local.plannedHires ?? [], remotePlannedHires ?? []),
    personLinks: mergeArrayById(local.personLinks ?? [], remotePersonLinks ?? []),
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
  const userId = await getActiveWorkspaceOwnerId();
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
  const userId = await getActiveWorkspaceOwnerId();
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
  const userId = await getActiveWorkspaceOwnerId();
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
  const userId = await getActiveWorkspaceOwnerId();
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
  const userId = await getActiveWorkspaceOwnerId();
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
  const userId = await getActiveWorkspaceOwnerId();
  if (!userId) return;
  for (const emp of employees) {
    const profile = resolveEmployeeProfile(settings, emp);
    const letter = profile?.offerLetter;
    if (!letter || letter.storagePath || letter.fileUrl) continue;
    const stored = await getOfferLetterFile(emp.id, userId);
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
