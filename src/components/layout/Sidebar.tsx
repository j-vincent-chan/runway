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
  LogIn,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { RUNWAY_ACCENT } from "@/lib/brand";
import { LedgerWordmark } from "@/components/brand/LedgerWordmark";
import { useApp } from "@/context/AppContext";
import { useAuth } from "@/context/AuthContext";

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

/**
 * The selected row is marked by a rule at its edge over a faint tint, never
 * filled with accent. Teal means measured data on every other surface, so a
 * block of it here both dilutes that meaning and competes with the grid for
 * attention — and white on the old teal-600 fill sat near 3.7:1, under the
 * 4.5:1 floor. Idle rows step back so the selection has something to be
 * brighter than; the row clears the 44px target height.
 */
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
      aria-current={active ? "page" : undefined}
      className={cn(
        "relative flex min-h-11 items-center gap-2.5 rounded-md px-3 text-sm",
        active
          ? "bg-white/[0.07] font-medium text-white"
          : "text-slate-400 hover:bg-white/[0.06] hover:text-white"
      )}
    >
      {active && (
        <span
          aria-hidden
          className="absolute inset-y-1.5 left-0 w-[3px] rounded-full"
          style={{ background: RUNWAY_ACCENT.onDark }}
        />
      )}
      <Icon
        className="h-4 w-4 shrink-0"
        style={active ? { color: RUNWAY_ACCENT.onDark } : undefined}
      />
      {label}
    </Link>
  );
}

export function Sidebar() {
  const { settings } = useApp();
  const { configured, user, signOut } = useAuth();

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
            className={cn("space-y-0.5", i > 0 && "mt-3 border-t border-white/10 pt-3")}
          >
            {group.map((item) => (
              <NavLink key={item.href} {...item} />
            ))}
          </div>
        ))}
      </nav>
      <div className="mt-auto space-y-0 border-t border-white/10 p-3">
        <NavLink href="/settings" label="Settings" icon={Settings} />
        {/* The session control lives with the other account-level rows, not
            in every page header. Styled as a nav row, but it acts — so it
            stays a button, not a Link. */}
        {configured &&
          (user ? (
            <button
              type="button"
              onClick={() => void signOut()}
              title={user.email ?? "Sign out"}
              className="flex min-h-11 w-full items-center gap-2.5 rounded-md px-3 text-left text-sm text-slate-400 hover:bg-white/[0.06] hover:text-white"
            >
              <LogOut className="h-4 w-4 shrink-0" />
              Sign out
            </button>
          ) : (
            <NavLink href="/login" label="Sign in" icon={LogIn} />
          ))}
        {/* Underlined on hover only: a permanently underlined line at the
            foot of a nav reads as a destination you are meant to act on. */}
        <p className="type-mono mt-2 leading-snug">
          <a
            href="https://ocr.ucsf.edu/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-slate-400 underline-offset-2 hover:text-white hover:underline"
          >
            Powered by the UCSF Office of Collaboration
          </a>
        </p>
      </div>
    </aside>
  );
}
