"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Upload,
  CalendarRange,
  Users,
  Settings,
  TrendingDown,
  LayoutDashboard,
  LineChart,
  Wallet,
  ClipboardList,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { LedgerWordmark } from "@/components/brand/LedgerWordmark";
import { useApp } from "@/context/AppContext";

/**
 * Grouped by what a destination is for, separated by hairlines — the flat
 * list mixed an overview, three planning surfaces, two reference tables, a
 * workflow queue, and an admin task in no order, with Status sitting between
 * two reference tables. Settings already sat apart at the bottom, so the
 * pattern existed; this extends it. Group labels are deliberately unrendered:
 * seven items in three clusters read faster than seven items under three
 * captions.
 */
const NAV_GROUPS: { href: string; label: string; icon: typeof Settings }[][] = [
  [{ href: "/dashboard", label: "Dashboard", icon: LayoutDashboard }],
  [
    { href: "/timeline", label: "Distributions", icon: CalendarRange },
    { href: "/projections", label: "Projections", icon: LineChart },
    { href: "/runway", label: "Runway", icon: TrendingDown },
  ],
  [
    { href: "/account-balances", label: "Account Balances", icon: Wallet },
    { href: "/employees", label: "Employees", icon: Users },
  ],
  [
    { href: "/status", label: "Status", icon: ClipboardList },
    { href: "/upload", label: "Upload", icon: Upload },
  ],
];

function NavLink({
  href,
  label,
  icon: Icon,
}: {
  href: string;
  label: string;
  icon: typeof Settings;
}) {
  const pathname = usePathname();
  const active = pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm",
        active ? "bg-teal-600 text-white" : "text-slate-300 hover:bg-white/10"
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {label}
    </Link>
  );
}

export function Sidebar() {
  const { settings } = useApp();

  if (settings.sidebarHidden) return null;

  return (
    <aside className="sticky top-0 flex h-screen w-56 shrink-0 flex-col overflow-y-auto bg-[#0c2340] text-white">
      <div className="border-b border-white/10 px-3 py-4">
        <LedgerWordmark variant="sidebar" />
      </div>
      <nav className="flex-1 p-3">
        {NAV_GROUPS.map((group, i) => (
          <div
            key={group[0]!.href}
            className={cn("space-y-0.5", i > 0 && "mt-2 border-t border-white/10 pt-2")}
          >
            {group.map((item) => (
              <NavLink key={item.href} {...item} />
            ))}
          </div>
        ))}
      </nav>
      <div className="mt-auto space-y-0 border-t border-white/10 p-3">
        <NavLink href="/settings" label="Settings" icon={Settings} />
        {/* The post-award caveat is the one piece of compliance copy in the
            app, and it sat at 10px — under the 14px body minimum, and under
            the rule that nothing meaningful lives at 11px. */}
        <p className="type-row mt-3 text-slate-300">
          Planning estimates only. Confirm with your finance/post-award analyst.
        </p>
        <p className="type-mono mt-2 leading-snug text-slate-400">
          <a
            href="https://ocr.ucsf.edu/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-slate-300 underline decoration-slate-500/80 underline-offset-2 hover:text-white"
          >
            Powered by the UCSF Office of Collaboration
          </a>
        </p>
      </div>
    </aside>
  );
}
