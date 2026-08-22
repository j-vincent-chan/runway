import type {
  AccountGroupDef,
  AppSettings,
  FundingSourceTypeDef,
  PersonnelGroupDef,
} from "@/types";
import {
  DEFAULT_FUNDING_SOURCE_TYPES,
  DEFAULT_PERSONNEL_GROUPS,
} from "@/lib/catalog/defaults";
import { getCurrentUserId } from "@/lib/supabase/authUser";
import { getSupabase } from "@/lib/supabase/client";
import { ensureFundingSourceTypes } from "@/lib/funding/accountCategory";
import { ensurePersonnelGroups } from "@/lib/employees/personnelType";
import { ensureAccountGroups } from "@/lib/net-position/accountGroup";

type RemotePersonnelGroupRow = {
  id: string;
  label: string;
  short_label: string | null;
  pill_class: string;
  dot_class: string;
  chart_color: string;
  sort_order: number;
};

type RemoteFundingSourceTypeRow = {
  id: string;
  label: string;
  pill_class: string;
  dot_class: string;
  chart_color: string;
  sort_order: number;
};

type RemoteAccountGroupRow = {
  id: string;
  label: string;
  pill_class: string;
  dot_class: string;
  chart_color: string;
  sort_order: number;
};

export function ensureCatalogDefaults(settings: AppSettings): AppSettings {
  return ensureAccountGroups(
    ensureFundingSourceTypes(ensurePersonnelGroups(settings))
  );
}

export async function fetchRemotePersonnelGroups(): Promise<PersonnelGroupDef[] | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("personnel_groups")
    .select("id, label, short_label, pill_class, dot_class, chart_color, sort_order")
    .order("sort_order");
  if (error) {
    console.warn("[supabase] fetch personnel_groups failed:", error.message);
    return null;
  }
  const rows = (data ?? []) as RemotePersonnelGroupRow[];
  if (rows.length === 0) return null;
  return rows.map((r) => ({
    id: r.id,
    label: r.label,
    shortLabel: r.short_label ?? undefined,
    pillClass: r.pill_class,
    dotClass: r.dot_class,
    chartColor: r.chart_color,
    sortOrder: r.sort_order,
  }));
}

export async function fetchRemoteFundingSourceTypes(): Promise<FundingSourceTypeDef[] | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("funding_source_types")
    .select("id, label, pill_class, dot_class, chart_color, sort_order")
    .order("sort_order");
  if (error) {
    console.warn("[supabase] fetch funding_source_types failed:", error.message);
    return null;
  }
  const rows = (data ?? []) as RemoteFundingSourceTypeRow[];
  if (rows.length === 0) return null;
  return rows.map((r) => ({
    id: r.id,
    label: r.label,
    pillClass: r.pill_class,
    dotClass: r.dot_class,
    chartColor: r.chart_color,
    sortOrder: r.sort_order,
  }));
}

export async function fetchRemoteAccountGroups(): Promise<AccountGroupDef[] | null> {
  const supabase = getSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("account_groups")
    .select("id, label, pill_class, dot_class, chart_color, sort_order")
    .order("sort_order");
  if (error) {
    // Table may not exist until migration is applied — soft-fail.
    console.warn("[supabase] fetch account_groups failed:", error.message);
    return null;
  }
  const rows = (data ?? []) as RemoteAccountGroupRow[];
  if (rows.length === 0) return null;
  return rows.map((r) => ({
    id: r.id,
    label: r.label,
    pillClass: r.pill_class,
    dotClass: r.dot_class,
    chartColor: r.chart_color,
    sortOrder: r.sort_order,
  }));
}

export async function upsertPersonnelGroup(group: PersonnelGroupDef): Promise<void> {
  const supabase = getSupabase();
  const userId = await getCurrentUserId();
  if (!supabase || !userId) return;
  const { error } = await supabase.from("personnel_groups").upsert(
    {
      user_id: userId,
      id: group.id,
      label: group.label,
      short_label: group.shortLabel ?? null,
      pill_class: group.pillClass,
      dot_class: group.dotClass,
      chart_color: group.chartColor,
      sort_order: group.sortOrder,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,id" }
  );
  if (error) console.warn("[supabase] upsert personnel_groups failed:", error.message);
}

export async function deletePersonnelGroupRemote(id: string): Promise<void> {
  const supabase = getSupabase();
  const userId = await getCurrentUserId();
  if (!supabase || !userId) return;
  const { error } = await supabase
    .from("personnel_groups")
    .delete()
    .eq("user_id", userId)
    .eq("id", id);
  if (error) console.warn("[supabase] delete personnel_groups failed:", error.message);
}

export async function upsertFundingSourceType(type: FundingSourceTypeDef): Promise<void> {
  const supabase = getSupabase();
  const userId = await getCurrentUserId();
  if (!supabase || !userId) return;
  const { error } = await supabase.from("funding_source_types").upsert(
    {
      user_id: userId,
      id: type.id,
      label: type.label,
      pill_class: type.pillClass,
      dot_class: type.dotClass,
      chart_color: type.chartColor,
      sort_order: type.sortOrder,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,id" }
  );
  if (error) console.warn("[supabase] upsert funding_source_types failed:", error.message);
}

export async function deleteFundingSourceTypeRemote(id: string): Promise<void> {
  const supabase = getSupabase();
  const userId = await getCurrentUserId();
  if (!supabase || !userId) return;
  const { error } = await supabase
    .from("funding_source_types")
    .delete()
    .eq("user_id", userId)
    .eq("id", id);
  if (error) console.warn("[supabase] delete funding_source_types failed:", error.message);
}

export async function upsertAccountGroup(group: AccountGroupDef): Promise<void> {
  const supabase = getSupabase();
  const userId = await getCurrentUserId();
  if (!supabase || !userId) return;
  const { error } = await supabase.from("account_groups").upsert(
    {
      user_id: userId,
      id: group.id,
      label: group.label,
      pill_class: group.pillClass,
      dot_class: group.dotClass,
      chart_color: group.chartColor,
      sort_order: group.sortOrder,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id,id" }
  );
  if (error) console.warn("[supabase] upsert account_groups failed:", error.message);
}

export async function deleteAccountGroupRemote(id: string): Promise<void> {
  const supabase = getSupabase();
  const userId = await getCurrentUserId();
  if (!supabase || !userId) return;
  const { error } = await supabase
    .from("account_groups")
    .delete()
    .eq("user_id", userId)
    .eq("id", id);
  if (error) console.warn("[supabase] delete account_groups failed:", error.message);
}

/** Seed remote tables from defaults when empty; return catalogs for settings merge. */
export async function syncCatalogFromCloud(settings: AppSettings): Promise<AppSettings> {
  let next = ensureCatalogDefaults(settings);
  const remoteGroups = await fetchRemotePersonnelGroups();
  const remoteTypes = await fetchRemoteFundingSourceTypes();
  const remoteAccountGroups = await fetchRemoteAccountGroups();

  if (remoteGroups && remoteGroups.length > 0) {
    next = { ...next, personnelGroups: remoteGroups };
  } else {
    for (const g of next.personnelGroups?.length
      ? next.personnelGroups
      : DEFAULT_PERSONNEL_GROUPS) {
      await upsertPersonnelGroup(g);
    }
  }

  if (remoteTypes && remoteTypes.length > 0) {
    next = { ...next, fundingSourceTypes: remoteTypes };
  } else {
    for (const t of next.fundingSourceTypes?.length
      ? next.fundingSourceTypes
      : DEFAULT_FUNDING_SOURCE_TYPES) {
      await upsertFundingSourceType(t);
    }
  }

  if (remoteAccountGroups && remoteAccountGroups.length > 0) {
    next = { ...next, accountGroups: remoteAccountGroups };
  } else if ((next.accountGroups?.length ?? 0) > 0) {
    for (const g of next.accountGroups!) {
      await upsertAccountGroup(g);
    }
  }

  return ensureCatalogDefaults(next);
}
