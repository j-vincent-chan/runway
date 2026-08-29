"use client";

import Link from "next/link";
import { Info, PanelLeft, PanelLeftOpen, LogIn, LogOut, Users } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { useAuth } from "@/context/AuthContext";
import { useWorkspace } from "@/context/WorkspaceContext";
import { AlertsBell } from "@/components/alerts/AlertsBell";
import { IMMUNOX_COLORS, PARENT_LABEL_ACADEMIC } from "@/lib/brand";
import { LedgerLogo } from "@/components/brand/LedgerLogo";
import { cn } from "@/lib/utils/cn";

export function Header({
  title,
  subtitle,
  ledgerTitle = false,
  showProductLabel = true,
  showImportMeta = true,
  topAction,
  dashboardContextBar,
}: {
  title: string;
  subtitle?: string;
  /** Large page title only (no Ledger wordmark — sidebar already shows brand). */
  ledgerTitle?: boolean;
  showProductLabel?: boolean;
  /** Hide file name / import time under title. */
  showImportMeta?: boolean;
  /** Optional primary header action (e.g. View Timeline). */
  topAction?: { label: string; href: string };
  /** Replaces the plain filename/timestamp/sync line with a richer, page-owned strip. */
  dashboardContextBar?: React.ReactNode;
}) {
  const { snapshot, settings, updateSettings } = useApp();
  const { configured, user, cloudSyncEnabled, signOut } = useAuth();
  const { activeOwner, delegationsToMe, switchWorkspace } = useWorkspace();

  return (
    <header className="shrink-0 border-b border-slate-200 bg-white px-6 py-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <div className={cn("mt-0.5 flex shrink-0 items-center", settings.sidebarHidden && "gap-1.5")}>
            <button
              type="button"
              className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-[#0c2340]"
              aria-label={settings.sidebarHidden ? "Show navigation" : "Hide navigation"}
              title={settings.sidebarHidden ? "Show navigation" : "Hide navigation"}
              onClick={() => updateSettings({ sidebarHidden: !settings.sidebarHidden })}
            >
              {settings.sidebarHidden ? (
                <PanelLeftOpen className="h-5 w-5" />
              ) : (
                <PanelLeft className="h-5 w-5" />
              )}
            </button>
            {settings.sidebarHidden && <LedgerLogo size={28} />}
          </div>
          <div className="min-w-0">
            {showProductLabel && !ledgerTitle && (
              <p
                className="text-[10px] font-medium uppercase tracking-widest"
                style={{ color: IMMUNOX_COLORS.teal }}
              >
                {PARENT_LABEL_ACADEMIC}
              </p>
            )}
            <div className={ledgerTitle ? "mt-0" : "mt-0.5 flex items-center gap-2"}>
              <h1
                className={
                  ledgerTitle
                    ? "text-3xl font-bold tracking-tight text-[#0c2340]"
                    : "text-xl font-semibold text-[#0c2340]"
                }
              >
                {title}
              </h1>
              {!ledgerTitle && (
                <span title="Planning layer — not payroll system of record">
                  <Info className="h-4 w-4 text-slate-400" />
                </span>
              )}
            </div>
            {subtitle && <p className="mt-1 text-sm text-slate-500">{subtitle}</p>}
            {dashboardContextBar ? (
              dashboardContextBar
            ) : (
              showImportMeta && snapshot && (
                <p className="mt-2 text-xs text-slate-500">
                  Source:{" "}
                  <span className="font-medium text-teal-800">{snapshot.sourceFileName}</span>
                  {" · "}
                  Imported {new Date(snapshot.uploadedAt).toLocaleString()}
                  {configured && (
                    <>
                      {" · "}
                      {cloudSyncEnabled ? (
                        <span className="text-teal-800">Cloud sync on</span>
                      ) : (
                        <span className="text-slate-500">Local only</span>
                      )}
                    </>
                  )}
                </p>
              )
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* The workspace picker exists only for accounts with delegated
              access — everyone else is simply in their own workspace. */}
          {delegationsToMe.length > 0 && activeOwner && (
            <label
              className={cn(
                "flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-sm",
                activeOwner.isSelf
                  ? "border-slate-300 bg-white text-slate-700"
                  : "border-teal-700 bg-teal-50 text-teal-900"
              )}
              title={
                activeOwner.isSelf
                  ? "Choose which workspace to work in"
                  : `Working in ${activeOwner.email}'s workspace with full access`
              }
            >
              <Users className="h-4 w-4 shrink-0" aria-hidden />
              <span className="sr-only">Workspace</span>
              <select
                className="max-w-[14rem] bg-transparent text-sm font-medium focus:outline-none"
                value={activeOwner.isSelf ? "" : activeOwner.userId}
                onChange={(e) => switchWorkspace(e.target.value || null)}
              >
                <option value="">My workspace</option>
                {delegationsToMe.map((g) => (
                  <option key={g.piUserId} value={g.piUserId}>
                    {g.piEmail}
                  </option>
                ))}
              </select>
            </label>
          )}
          <AlertsBell />
          {configured &&
            (user ? (
              <button
                type="button"
                onClick={() => void signOut()}
                className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                title={user.email ?? "Sign out"}
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            ) : (
              <Link
                href="/login"
                className="flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                <LogIn className="h-4 w-4" />
                Sign in
              </Link>
            ))}
          {topAction && (
            <Link
              href={topAction.href}
              className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800"
            >
              {topAction.label}
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
