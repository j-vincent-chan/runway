"use client";

import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useApp } from "@/context/AppContext";
import {
  getPersonnelGroups,
  getPersonnelTypeMeta,
} from "@/lib/employees/personnelType";
import { getFundingSourceTypes, getAccountCategoryMeta } from "@/lib/funding/accountCategory";
import { nextCatalogStyle, slugifyCatalogId } from "@/lib/catalog/defaults";
import type { FundingSourceTypeDef, PersonnelGroupDef } from "@/types";
import { cn } from "@/lib/utils/cn";

function CatalogRow({
  label,
  pillClass,
  dotClass,
  onEdit,
  onDelete,
}: {
  label: string;
  pillClass: string;
  dotClass: string;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <li className="flex items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2">
      <span
        className={cn(
          "inline-flex max-w-[70%] items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
          pillClass
        )}
      >
        <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", dotClass)} aria-hidden />
        {label}
      </span>
      <div className="flex shrink-0 gap-1">
        <button
          type="button"
          className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          title="Edit"
          onClick={onEdit}
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
          title="Delete"
          onClick={onDelete}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </li>
  );
}

export function PersonnelGroupsSettings() {
  const { settings, upsertPersonnelGroupDef, deletePersonnelGroupDef } = useApp();
  const groups = getPersonnelGroups(settings);
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  const save = async () => {
    const label = draft.trim();
    if (!label) return;
    if (editingId) {
      const existing = groups.find((g) => g.id === editingId);
      if (!existing) return;
      await upsertPersonnelGroupDef({ ...existing, label });
    } else {
      const style = nextCatalogStyle(groups.length);
      const id = slugifyCatalogId(label);
      const unique =
        groups.some((g) => g.id === id) ? `${id}_${Date.now().toString(36)}` : id;
      const next: PersonnelGroupDef = {
        id: unique,
        label,
        ...style,
        sortOrder: groups.length,
      };
      await upsertPersonnelGroupDef(next);
    }
    setDraft("");
    setEditingId(null);
  };

  return (
    <section className="rounded-xl border bg-white p-5 shadow-sm space-y-3">
      <div>
        <h3 className="font-semibold">Personnel groups</h3>
        <p className="mt-1 text-sm text-slate-600">
          Used on Employees and for grouping Timeline, Projections, and Runway.
        </p>
      </div>
      <ul className="space-y-2">
        {groups.map((g) => {
          const meta = getPersonnelTypeMeta(g.id, settings);
          return (
            <CatalogRow
              key={g.id}
              label={meta.label}
              pillClass={meta.pillClass}
              dotClass={meta.dotClass}
              onEdit={() => {
                setEditingId(g.id);
                setDraft(g.label);
              }}
              onDelete={() => {
                if (confirm(`Delete personnel group “${g.label}”?`)) {
                  void deletePersonnelGroupDef(g.id);
                }
              }}
            />
          );
        })}
      </ul>
      <div className="flex flex-wrap gap-2 pt-1">
        <input
          className="min-w-[12rem] flex-1 rounded border px-2 py-1.5 text-sm"
          placeholder={editingId ? "Rename group" : "New group name"}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void save();
          }}
        />
        <button
          type="button"
          onClick={() => void save()}
          className="inline-flex items-center gap-1 rounded-lg bg-teal-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-800"
        >
          <Plus className="h-3.5 w-3.5" />
          {editingId ? "Save" : "Add"}
        </button>
        {editingId && (
          <button
            type="button"
            className="rounded-lg border px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
            onClick={() => {
              setEditingId(null);
              setDraft("");
            }}
          >
            Cancel
          </button>
        )}
      </div>
    </section>
  );
}

export function FundingSourceTypesSettings() {
  const { settings, upsertFundingSourceTypeDef, deleteFundingSourceTypeDef } = useApp();
  const types = getFundingSourceTypes(settings);
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  const save = async () => {
    const label = draft.trim();
    if (!label) return;
    if (editingId) {
      const existing = types.find((t) => t.id === editingId);
      if (!existing) return;
      await upsertFundingSourceTypeDef({ ...existing, label });
    } else {
      const style = nextCatalogStyle(types.length);
      const id = slugifyCatalogId(label);
      const unique = types.some((t) => t.id === id) ? `${id}_${Date.now().toString(36)}` : id;
      const next: FundingSourceTypeDef = {
        id: unique,
        label,
        ...style,
        sortOrder: types.length,
      };
      await upsertFundingSourceTypeDef(next);
    }
    setDraft("");
    setEditingId(null);
  };

  return (
    <section className="rounded-xl border bg-white p-5 shadow-sm space-y-3">
      <div>
        <h3 className="font-semibold">Funding sources</h3>
        <p className="mt-1 text-sm text-slate-600">
          Labels used on Accounts and Dashboard funding type mix pie slices.
        </p>
      </div>
      <ul className="space-y-2">
        {types.map((t) => {
          const meta = getAccountCategoryMeta(t.id, settings);
          return (
            <CatalogRow
              key={t.id}
              label={meta.label}
              pillClass={meta.pillClass}
              dotClass={meta.dotClass}
              onEdit={() => {
                setEditingId(t.id);
                setDraft(t.label);
              }}
              onDelete={() => {
                if (confirm(`Delete funding source “${t.label}”?`)) {
                  void deleteFundingSourceTypeDef(t.id);
                }
              }}
            />
          );
        })}
      </ul>
      <div className="flex flex-wrap gap-2 pt-1">
        <input
          className="min-w-[12rem] flex-1 rounded border px-2 py-1.5 text-sm"
          placeholder={editingId ? "Rename funding source" : "New funding source name"}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void save();
          }}
        />
        <button
          type="button"
          onClick={() => void save()}
          className="inline-flex items-center gap-1 rounded-lg bg-teal-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-teal-800"
        >
          <Plus className="h-3.5 w-3.5" />
          {editingId ? "Save" : "Add"}
        </button>
        {editingId && (
          <button
            type="button"
            className="rounded-lg border px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
            onClick={() => {
              setEditingId(null);
              setDraft("");
            }}
          >
            Cancel
          </button>
        )}
      </div>
    </section>
  );
}
