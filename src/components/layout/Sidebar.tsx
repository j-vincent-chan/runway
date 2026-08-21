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
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { LedgerWordmark } from "@/components/brand/LedgerWordmark";
import { useApp } from "@/context/AppContext";

const mainNav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/timeline", label: "Timeline", icon: CalendarRange },
  { href: "/projections", label: "Projections", icon: LineChart },
  { href: "/runway", label: "Runway", icon: TrendingDown },
  { href: "/employees", label: "Employees", icon: Users },
  { href: "/upload", label: "Upload", icon: Upload },
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
      <nav className="flex-1 space-y-0.5 p-3">
        {mainNav.map((item) => (
          <NavLink key={item.href} {...item} />
        ))}
      </nav>
      <div className="mt-auto space-y-0 border-t border-white/10 p-3">
        <NavLink href="/settings" label="Settings" icon={Settings} />
        <p className="mt-3 text-[10px] leading-snug text-slate-400">
          Planning estimates only. Confirm with your finance/post-award analyst.
        </p>
        <p className="mt-2 text-[10px] leading-snug text-slate-400">
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
