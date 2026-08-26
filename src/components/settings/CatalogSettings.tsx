"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { useApp } from "@/context/AppContext";
import {
  getPersonnelGroups,
  getPersonnelTypeMeta,
} from "@/lib/employees/personnelType";
import {
  getAccountCategoryMeta,
  getFundingSourceCategoryForAccountKey,
  getFundingSourceTypes,
} from "@/lib/funding/accountCategory";
import {
  nextCatalogStyle,
  slugifyCatalogId,
  UNDELETABLE_ACCOUNT_GROUP_IDS,
} from "@/lib/catalog/defaults";
import type {
  AccountCategory,
  AccountGroupDef,
  AppSettings,
  FundingSource,
  FundingSourceTypeDef,
  MonthlyAllocation,
  PayrollReportSnapshot,
  PersonnelGroupDef,
} from "@/types";
import { cn } from "@/lib/utils/cn";
import { getAccountGroups, getAccountGroupMeta } from "@/lib/net-position/accountGroup";
import {
  AccountGroupLegend,
  AccountGroupSelect,
} from "@/components/funding/AccountGroupSelect";
import {
  buildAccountBalanceView,
  fundingSourcesForAccountKey,
  getEmployeesOnAccountKey,
  normalizeAccountBalanceKey,
  resolveAccountBalanceAlias,
  syntheticFundingSourceForAccount,
  type AccountBalanceViewItem,
} from "@/lib/net-position/accountBalancesView";
import { AliasEditor } from "@/components/funding/AliasEditor";
import {
  AccountCategoryLegend,
  AccountCategorySelect,
} from "@/components/funding/AccountCategorySelect";
import { EmployeeAvatarStack } from "@/components/employees/EmployeeAvatarStack";
import { getAliasEntry } from "@/lib/funding/sourceKey";
import { formatCurrency } from "@/lib/utils/parse";

function CatalogRow({
  label,
  pillClass,
  dotClass,
  onEdit,
  onDelete,
  undeletableReason,
}: {
  label: string;
  pillClass: string;
  dotClass: string;
  onEdit: () => void;
  onDelete: () => void;
  /** When set, the delete control is replaced by this explanation. */
  undeletableReason?: string;
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
        {undeletableReason ? (
          <span className="self-center text-[11.5px] text-slate-500" title={undeletableReason}>
            Built in
          </span>
        ) : (
          <button
            type="button"
            className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
            title="Delete"
            onClick={onDelete}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
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
        <h3 className="font-semibold">Teams</h3>
        <p className="mt-1 text-sm text-slate-600">
          Assigned on Employees, and used to group Timeline, Projections, Runway, and the
          Dashboard.
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
                if (confirm(`Delete team “${g.label}”?`)) {
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
          placeholder={editingId ? "Rename team" : "New team name"}
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
              undeletableReason={
                UNDELETABLE_ACCOUNT_GROUP_IDS.includes(g.id)
                  ? "Accounts you don't control are marked with this group on Runway, Timeline and Projections, so it can't be deleted."
                  : undefined
              }
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

/**
 * The Accounts table. Net Position Reports are the ground truth for payroll
 * accounts, so this is the one place an account is named, grouped, and
 * classified by funding source.
 */
export function AccountsSettings() {
  const {
    snapshot,
    allocations,
    fundingSources,
    netPositionImports,
    settings,
    hiddenAccountKeys,
    setAccountGroupForBalanceKey,
    setFundingSourceCategoryForAccountKey,
    updateFundingSourceAlias,
  } = useApp();
  const [showHidden, setShowHidden] = useState(false);

  const items = useMemo(
    () =>
      buildAccountBalanceView({
        netPositionImports,
        hiddenKeys: hiddenAccountKeys,
        aliases: settings.fundingSourceAliases,
        accountGroupByBalanceKey: settings.accountGroupByBalanceKey,
        sort: "titleAsc",
      }),
    [
      netPositionImports,
      hiddenAccountKeys,
      settings.fundingSourceAliases,
      settings.accountGroupByBalanceKey,
    ]
  );

  /**
   * buildAccountBalanceView flags hidden accounts but does not drop them, so
   * this panel listed every account regardless. Hiding an account — directly,
   * or by hiding its fund for everyone on Runway/Timeline — now removes it
   * here too, with a disclosure so it can still be found and revealed.
   */
  const visibleItems = items.filter((i) => !i.isHidden);
  const hiddenItems = items.filter((i) => i.isHidden);
  const shownItems = showHidden ? items : visibleItems;

  if (items.length === 0) {
    return (
      <section className="rounded-xl border bg-white p-5 shadow-sm space-y-3">
        <div>
          <h3 className="font-semibold">Accounts</h3>
          <p className="mt-1 text-sm text-slate-600">
            Name each account, put it in an account group, and classify its funding source.
          </p>
        </div>
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
          No accounts yet. Upload a Net Position Report on{" "}
          <Link href="/upload" className="font-medium underline hover:text-amber-950">
            Data Sources
          </Link>{" "}
          to list your payroll accounts here.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-xl border bg-white p-5 shadow-sm space-y-3">
      <div>
        <h3 className="font-semibold">Accounts</h3>
        <p className="mt-1 text-sm text-slate-600">
          Every account on your Net Position Report. Name it, put it in an account group, and
          classify its funding source — groups appear on Account Balances, funding sources on the
          Dashboard.
        </p>
      </div>
      <AccountGroupLegend />
      <AccountCategoryLegend />
      {hiddenItems.length > 0 && (
        <button
          type="button"
          onClick={() => setShowHidden((v) => !v)}
          className="text-sm font-medium text-[#0c2340] underline underline-offset-2 hover:text-[#12626e]"
        >
          {showHidden
            ? `Hide ${hiddenItems.length} hidden ${hiddenItems.length === 1 ? "account" : "accounts"}`
            : `Show ${hiddenItems.length} hidden ${hiddenItems.length === 1 ? "account" : "accounts"}`}
        </button>
      )}
      <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-[#0c2340] text-xs text-white">
            <tr>
              <th className="min-w-[14rem] px-3 py-2">Account</th>
              <th className="px-3 py-2">Fund–dept–project</th>
              <th className="min-w-[11rem] px-3 py-2">Account group</th>
              <th className="min-w-[11.5rem] px-3 py-2">Funding source</th>
              <th className="min-w-[6rem] px-3 py-2 text-center">Employees</th>
              <th className="px-3 py-2 text-right">Ending balance</th>
            </tr>
          </thead>
          <tbody>
            {shownItems.map((item) => (
              <AccountRow
                key={item.accountKey}
                item={item}
                snapshot={snapshot}
                allocations={allocations}
                fundingSources={fundingSources}
                settings={settings}
                onAliasSave={updateFundingSourceAlias}
                onGroupChange={setAccountGroupForBalanceKey}
                onCategoryChange={setFundingSourceCategoryForAccountKey}
              />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function AccountRow({
  item,
  snapshot,
  allocations,
  fundingSources,
  settings,
  onAliasSave,
  onGroupChange,
  onCategoryChange,
}: {
  item: AccountBalanceViewItem;
  snapshot: PayrollReportSnapshot | null;
  allocations: MonthlyAllocation[];
  fundingSources: FundingSource[];
  settings: AppSettings;
  onAliasSave: (fundingSourceId: string, aliasBase: string) => void;
  onGroupChange: (accountKey: string, groupId: string | null) => void;
  onCategoryChange: (accountKey: string, category: AccountCategory | null) => void;
}) {
  const accountKey = normalizeAccountBalanceKey(item.accountKey);

  /**
   * The payroll rows under this account. There may be several — chartstrings
   * differing only in activity segment — or none, for an account nobody is
   * charged to yet; the synthetic source keeps the alias editable either way,
   * the same way Account Balances does it.
   */
  const matchingSources = useMemo(
    () => fundingSourcesForAccountKey(item.accountKey, fundingSources),
    [item.accountKey, fundingSources]
  );
  const primarySource = matchingSources[0] ?? syntheticFundingSourceForAccount(item);

  const employees = useMemo(
    () => getEmployeesOnAccountKey(item.accountKey, fundingSources, snapshot, allocations),
    [item.accountKey, fundingSources, snapshot, allocations]
  );

  const aliasEntry = matchingSources[0]
    ? getAliasEntry(settings.fundingSourceAliases, matchingSources[0])
    : undefined;
  const customAlias =
    aliasEntry?.alias ?? resolveAccountBalanceAlias(settings.fundingSourceAliases, accountKey);

  return (
    <tr className="border-t hover:bg-slate-50/80">
      <td className="px-3 py-2">
        <AliasEditor
          source={primarySource}
          customAlias={customAlias}
          accountTitle={item.projectDescription}
          showProjectSuffix={false}
          fullWidth
          onSave={(base) => onAliasSave(primarySource.id, base)}
        />
      </td>
      <td className="px-3 py-2 font-mono text-xs text-slate-500">{item.displayKey}</td>
      <td className="px-3 py-2">
        {/* Assigning "Not my accounts" here is the same action as the shield
            on Runway and Timeline — one store, three doors. */}
        <AccountGroupSelect
          value={settings.accountGroupByBalanceKey?.[accountKey]}
          onChange={(groupId) => onGroupChange(item.accountKey, groupId)}
        />
      </td>
      <td className="px-3 py-2">
        <AccountCategorySelect
          value={getFundingSourceCategoryForAccountKey(settings, accountKey, fundingSources)}
          onChange={(category) => onCategoryChange(item.accountKey, category)}
        />
      </td>
      <td className="px-3 py-2">
        <EmployeeAvatarStack employees={employees} settings={settings} />
      </td>
      <td className="px-3 py-2 text-right tabular-nums text-slate-700">
        {formatCurrency(item.displayBalance)}
      </td>
    </tr>
  );
}
