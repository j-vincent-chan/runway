"use client";

import Link from "next/link";
import { Upload, Info, PanelLeftOpen, PanelLeftClose } from "lucide-react";
import { useApp } from "@/context/AppContext";
import { AlertsBell } from "@/components/alerts/AlertsBell";
import { IMMUNOX_COLORS, PARENT_LABEL_ACADEMIC } from "@/lib/brand";
import { LedgerLogo } from "@/components/brand/LedgerLogo";
import { cn } from "@/lib/utils/cn";

export function Header({
  title,
  subtitle,
  ledgerTitle = false,
  showProductLabel = true,
  showUploadButton = true,
  showImportMeta = true,
  topAction,
}: {
  title: string;
  subtitle?: string;
  /** Large page title only (no Ledger wordmark — sidebar already shows brand). */
  ledgerTitle?: boolean;
  showProductLabel?: boolean;
  /** Hide default Upload New Report (e.g. on Data Sources page). */
  showUploadButton?: boolean;
  /** Hide file name / import time under title. */
  showImportMeta?: boolean;
  /** Optional primary header action (e.g. View Timeline). */
  topAction?: { label: string; href: string };
}) {
  const { snapshot, settings, updateSettings } = useApp();

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
                <PanelLeftClose className="h-5 w-5" />
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
            {showImportMeta && snapshot && (
              <p className="mt-2 text-xs text-slate-500">
                Source:{" "}
                <span className="font-medium text-teal-800">{snapshot.sourceFileName}</span>
                {" · "}
                Imported {new Date(snapshot.uploadedAt).toLocaleString()}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <AlertsBell />
          {topAction && (
            <Link
              href={topAction.href}
              className="rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800"
            >
              {topAction.label}
            </Link>
          )}
          {showUploadButton && (
            <Link
              href="/upload"
              className="flex items-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <Upload className="h-4 w-4" />
              Upload New Report
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
