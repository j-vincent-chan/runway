"use client";

import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { useApp } from "@/context/AppContext";
import { PARSER_VERSION } from "@/types";

export default function SettingsPage() {
  const { settings, updateSettings, snapshot, clearAll } = useApp();

  return (
    <>
      <Header ledgerTitle title="Settings" />
      <main className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-2xl space-y-6">
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

          {snapshot && (
            <p className="text-sm text-slate-600">
              Account aliases and funding types are edited on the{" "}
              <Link href="/accounts" className="font-medium text-teal-700 hover:underline">
                Accounts
              </Link>{" "}
              page.
            </p>
          )}

          <section className="rounded-xl border bg-white p-5 text-sm text-slate-600">
            <p>Parser version: {PARSER_VERSION}</p>
            <p className="mt-1">Data stored in browser local storage.</p>
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
