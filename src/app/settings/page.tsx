"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/layout/Header";
import { useApp } from "@/context/AppContext";
import { PARSER_VERSION } from "@/types";
import {
  AccountGroupsSettings,
  AccountsSettings,
  FundingSourceTypesSettings,
  PersonnelGroupsSettings,
} from "@/components/settings/CatalogSettings";
import { CloudPrivacyPanel } from "@/components/settings/CloudPrivacyPanel";
import { DelegateAccessCard } from "@/components/settings/DelegateAccessCard";
import { cn } from "@/lib/utils/cn";

const TABS = [
  { id: "privacy", label: "Privacy & sync" },
  { id: "planning", label: "Planning defaults" },
  // id stays "personnel" — it's the /settings#personnel deep link.
  { id: "personnel", label: "Teams" },
  { id: "funding", label: "Funding source types" },
  { id: "account-groups", label: "Account groups" },
  { id: "accounts", label: "Accounts" },
  { id: "data", label: "Data & about" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function tabFromHash(): TabId {
  if (typeof window === "undefined") return "privacy";
  const hash = window.location.hash.replace(/^#/, "");
  if (TABS.some((t) => t.id === hash)) return hash as TabId;
  return "privacy";
}

export default function SettingsPage() {
  const { settings, updateSettings, snapshot, clearAll } = useApp();
  const [tab, setTab] = useState<TabId>(() => tabFromHash());

  useEffect(() => {
    const onHash = () => setTab(tabFromHash());
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  const selectTab = (id: TabId) => {
    setTab(id);
    if (typeof window !== "undefined") {
      const url = id === "privacy" ? "/settings" : `/settings#${id}`;
      window.history.replaceState(null, "", url);
    }
  };

  return (
    <>
      <Header ledgerTitle title="Settings" />
      <main className="flex-1 overflow-auto p-6">
        <div className="mx-auto flex max-w-5xl flex-col gap-6 md:flex-row md:items-start">
          <nav
            className="flex shrink-0 gap-1 overflow-x-auto md:w-48 md:flex-col md:overflow-visible"
            aria-label="Settings sections"
          >
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => selectTab(t.id)}
                className={cn(
                  "whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm font-medium transition-colors",
                  tab === t.id
                    ? "bg-[#0c2340] text-white"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                )}
              >
                {t.label}
              </button>
            ))}
          </nav>

          <div className="min-w-0 flex-1 space-y-6">
            {tab === "privacy" && (
              <>
                <CloudPrivacyPanel />
                <DelegateAccessCard />
              </>
            )}

            {tab === "planning" && (
              <section className="space-y-3 rounded-xl border bg-white p-5 shadow-sm">
                <h3 className="font-semibold">Planning defaults</h3>
                <label className="block text-sm">
                  Fiscal year start month
                  <select
                    className="mt-1 w-full rounded border px-2 py-1"
                    value={settings.fiscalYearStartMonth}
                    onChange={(e) => updateSettings({ fiscalYearStartMonth: +e.target.value })}
                  >
                    {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block text-sm">
                  Support ending soon (days)
                  <input
                    type="number"
                    className="mt-1 w-full rounded border px-2 py-1"
                    value={settings.supportEndingSoonDays}
                    onChange={(e) => updateSettings({ supportEndingSoonDays: +e.target.value })}
                  />
                </label>
                <label className="block text-sm">
                  Funding cliff threshold (% drop)
                  <input
                    type="number"
                    className="mt-1 w-full rounded border px-2 py-1"
                    value={settings.fundingCliffThreshold}
                    onChange={(e) => updateSettings({ fundingCliffThreshold: +e.target.value })}
                  />
                </label>
              </section>
            )}

            {tab === "personnel" && <PersonnelGroupsSettings />}
            {tab === "funding" && <FundingSourceTypesSettings />}
            {tab === "account-groups" && <AccountGroupsSettings />}

            {tab === "accounts" && <AccountsSettings />}

            {tab === "data" && (
              <section className="rounded-xl border bg-white p-5 text-sm text-slate-600">
                <h3 className="font-semibold text-[#0c2340]">Data &amp; about</h3>
                <p className="mt-3">Parser version: {PARSER_VERSION}</p>
                <p className="mt-1">
                  Planning data is stored in this browser. Private Supabase sync runs only when you
                  are signed in and local-only mode is off.
                </p>
                {snapshot && (
                  <button
                    type="button"
                    onClick={() => {
                      if (
                        confirm(
                          "Clear all imported payroll data? Account aliases and types you set will be kept."
                        )
                      )
                        clearAll();
                    }}
                    className="mt-4 text-red-600 hover:underline"
                  >
                    Clear all imported data
                  </button>
                )}
              </section>
            )}
          </div>
        </div>
      </main>
    </>
  );
}
