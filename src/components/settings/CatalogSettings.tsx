"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useApp } from "@/context/AppContext";
import {
  getPersonnelGroups,
  getPersonnelTypeMeta,
} from "@/lib/employees/personnelType";
import { getFundingSourceTypes, getAccountCategoryMeta } from "@/lib/funding/accountCategory";
import { nextCatalogStyle, slugifyCatalogId } from "@/lib/catalog/defaults";
import type { FundingSourceTypeDef, PersonnelGroupDef, AccountGroupDef } from "@/types";
import { cn } from "@/lib/utils/cn";
import { getAccountGroups, getAccountGroupMeta } from "@/lib/net-position/accountGroup";
import {
  AccountGroupLegend,
  AccountGroupSelect,
} from "@/components/funding/AccountGroupSelect";
import {
  buildAccountBalanceView,
  normalizeAccountBalanceKey,
} from "@/lib/net-position/accountBalancesView";
import { formatCurrency } from "@/lib/utils/parse";

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

export function AccountGroupsSettings() {
  const { settings, upsertAccountGroupDef, deleteAccountGroupDef } = useApp();
  const groups = getAccountGroups(settings);
  const [draft, setDraft] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  const save = async () => {
    const label = draft.trim();
    if (!label) return;
    if (editingId) {
      const existing = groups.find((g) => g.id === editingId);
      if (!existing) return;
      await upsertAccountGroupDef({ ...existing, label });
    } else {
      const style = nextCatalogStyle(groups.length);
      const id = slugifyCatalogId(label);
      const unique = groups.some((g) => g.id === id) ? `${id}_${Date.now().toString(36)}` : id;
      const next: AccountGroupDef = {
        id: unique,
        label,
        ...style,
        sortOrder: groups.length,
      };
      await upsertAccountGroupDef(next);
    }
    setDraft("");
    setEditingId(null);
  };

  return (
    <section className="rounded-xl border bg-white p-5 shadow-sm space-y-3">
      <div>
        <h3 className="font-semibold">Account groups</h3>
        <p className="mt-1 text-sm text-slate-600">
          Tags used to organize accounts on Account Balances and Net Position Report Accounts.
        </p>
      </div>
      <ul className="space-y-2">
        {groups.map((g) => {
          const meta = getAccountGroupMeta(g.id, settings);
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
                if (confirm(`Delete account group “${g.label}”?`)) {
                  void deleteAccountGroupDef(g.id);
                }
              }}
            />
          );
        })}
      </ul>
      {groups.length === 0 && (
        <p className="text-sm text-slate-500">No account groups yet. Add one below.</p>
      )}
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

/** Label Account Balances accounts (Net Position + watched MyPortfolio) with account groups. */
export function NetPositionAccountsSettings() {
  const {
    netPositionImports,
    mergedPortfolioBalances,
    settings,
    setAccountGroupForBalanceKey,
  } = useApp();

  const items = useMemo(
    () =>
      buildAccountBalanceView({
        netPositionImports,
        portfolioBalances: mergedPortfolioBalances,
        hiddenKeys: [],
        watchedPortfolioKeys: settings.watchedPortfolioAccountKeys ?? [],
        aliases: settings.fundingSourceAliases,
        accountGroupByBalanceKey: settings.accountGroupByBalanceKey,
        sort: "titleAsc",
      }),
    [
      netPositionImports,
      mergedPortfolioBalances,
      settings.watchedPortfolioAccountKeys,
      settings.fundingSourceAliases,
      settings.accountGroupByBalanceKey,
    ]
  );

  if (items.length === 0) {
    return (
      <section className="rounded-xl border bg-white p-5 shadow-sm space-y-3">
        <div>
          <h3 className="font-semibold">Net Position Report Accounts</h3>
          <p className="mt-1 text-sm text-slate-600">
            Assign account groups to accounts from Net Position Reports and watched MyPortfolio
            accounts.
          </p>
        </div>
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          No accounts to label yet.{" "}
          <Link href="/upload" className="font-medium underline hover:text-amber-950">
            Upload on Data Sources
          </Link>
          , or add MyPortfolio accounts on{" "}
          <Link href="/account-balances" className="font-medium underline hover:text-amber-950">
            Account Balances
          </Link>
          .
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border bg-white p-5 shadow-sm space-y-3">
      <div>
        <h3 className="font-semibold">Net Position Report Accounts</h3>
        <p className="mt-1 text-sm text-slate-600">
          Label each Net Position or watched MyPortfolio account with an account group. Groups
          appear on Account Balances.
        </p>
      </div>
      <AccountGroupLegend />
      <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-[#0c2340] text-xs text-white">
            <tr>
              <th className="min-w-[12rem] px-3 py-2">Account</th>
              <th className="px-3 py-2">Fund–dept–project</th>
              <th className="min-w-[11.5rem] px-3 py-2">Account group</th>
              <th className="px-3 py-2 text-right">Ending balance</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => (
              <tr key={item.accountKey} className="border-t hover:bg-slate-50/80">
                <td className="px-3 py-2 font-medium text-[#0c2340]">{item.title}</td>
                <td className="px-3 py-2 font-mono text-xs text-slate-500">{item.displayKey}</td>
                <td className="px-3 py-2">
                  <AccountGroupSelect
                    value={
                      settings.accountGroupByBalanceKey?.[
                        normalizeAccountBalanceKey(item.accountKey)
                      ]
                    }
                    onChange={(groupId) =>
                      setAccountGroupForBalanceKey(item.accountKey, groupId)
                    }
                  />
                </td>
                <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                  {item.displayBalance !== null ? formatCurrency(item.displayBalance) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

