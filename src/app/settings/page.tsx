"use client";

import { Header } from "@/components/layout/Header";
import { useApp } from "@/context/AppContext";
import { PARSER_VERSION } from "@/types";
import { AccountsPanel } from "@/components/settings/AccountsPanel";
import {
  FundingSourceTypesSettings,
  PersonnelGroupsSettings,
} from "@/components/settings/CatalogSettings";
import { CloudPrivacyPanel } from "@/components/settings/CloudPrivacyPanel";

export default function SettingsPage() {
  const { settings, updateSettings, snapshot, clearAll } = useApp();

  return (
    <>
      <Header ledgerTitle title="Settings" />
      <main className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-5xl space-y-6">
          <CloudPrivacyPanel />

          <section className="rounded-xl border bg-white p-5 shadow-sm space-y-3">
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

          <PersonnelGroupsSettings />
          <FundingSourceTypesSettings />

          <section id="accounts" className="scroll-mt-6 space-y-3">
            <div>
              <h3 className="text-lg font-semibold text-[#0c2340]">Accounts</h3>
              <p className="text-sm text-slate-600">
                Funding sources, balances, and payroll burden from your imported reports.
              </p>
            </div>
            <AccountsPanel />
          </section>

          <section className="rounded-xl border bg-white p-5 text-sm text-slate-600">
            <p>Parser version: {PARSER_VERSION}</p>
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
        </div>
      </main>
    </>
  );
}
