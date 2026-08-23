"use client";

import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  TrendingDown,
  TrendingUp,
  Users,
  Wallet,
} from "lucide-react";
import type { DashboardInsight, DashboardInsightKind } from "@/lib/dashboard/insights";
import { cn } from "@/lib/utils/cn";

const KIND_ICON: Record<DashboardInsightKind, typeof TrendingUp> = {
  cost_yoy: TrendingUp,
  headcount: Users,
  funding_mix: Wallet,
  runway_attention: AlertTriangle,
  largest_cost_group: Wallet,
};

function toneClasses(tone: DashboardInsight["tone"]): string {
  if (tone === "up") return "border-teal-100 bg-white";
  if (tone === "down") return "border-slate-200 bg-white";
  if (tone === "attention") return "border-amber-200 bg-amber-50";
  return "border-slate-200 bg-white";
}

function IconFor({ insight }: { insight: DashboardInsight }) {
  if (insight.kind === "cost_yoy" || insight.kind === "funding_mix") {
    const Icon = insight.tone === "down" ? TrendingDown : TrendingUp;
    return <Icon className="h-4 w-4" />;
  }
  const Icon = KIND_ICON[insight.kind];
  return <Icon className="h-4 w-4" />;
}

function iconWrapClass(insight: DashboardInsight): string {
  if (insight.tone === "up") return "bg-teal-50 text-teal-800";
  if (insight.tone === "down") return "bg-slate-100 text-slate-700";
  if (insight.tone === "attention") return "bg-amber-100 text-amber-900";
  return "bg-slate-100 text-[#0c2340]";
}

export function KeyChangesSection({ insights }: { insights: DashboardInsight[] }) {
  return (
    <section className="rounded-2xl border border-[#0c2340]/15 bg-gradient-to-br from-[#0c2340] to-[#123456] p-5 text-white shadow-sm sm:p-6">
      <header className="mb-4">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-white/60">
          This period
        </p>
        <h2 className="mt-1 text-lg font-semibold tracking-tight sm:text-xl">Key changes</h2>
        <p className="mt-1 max-w-2xl text-xs text-white/70 sm:text-sm">
          What moved in cost, team size, and funding mix.
        </p>
      </header>

      {insights.length === 0 ? (
        <p className="rounded-xl border border-white/10 bg-white/5 px-4 py-6 text-sm text-white/70">
          Not enough history yet to highlight changes. Upload more payroll months to see YoY
          movement here.
        </p>
      ) : (
        <ul
          className={cn(
            "grid gap-3",
            insights.length <= 2 && "sm:grid-cols-2",
            insights.length === 3 && "sm:grid-cols-2 xl:grid-cols-3",
            insights.length === 4 && "sm:grid-cols-2 xl:grid-cols-4",
            insights.length >= 5 && "sm:grid-cols-2 xl:grid-cols-3"
          )}
        >
          {insights.map((insight) => (
            <li
              key={insight.id}
              className={cn(
                "flex min-h-[7.5rem] flex-col rounded-xl border p-4 text-[#0c2340] shadow-sm",
                toneClasses(insight.tone)
              )}
            >
              <div className="flex items-start gap-3">
                <span
                  className={cn(
                    "mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                    iconWrapClass(insight)
                  )}
                >
                  <IconFor insight={insight} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold leading-snug text-[#0c2340]">
                    {insight.headline}
                  </p>
                  {insight.detail && (
                    <p className="mt-1 text-xs leading-snug text-slate-600">{insight.detail}</p>
                  )}
                </div>
              </div>
              {insight.href && insight.hrefLabel && (
                <Link
                  href={insight.href}
                  className="mt-auto inline-flex items-center gap-1 pt-3 text-xs font-semibold text-teal-800 hover:underline"
                >
                  {insight.hrefLabel}
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
