"use client";

import { usePathname } from "next/navigation";
import { Sidebar } from "./Sidebar";
import { OnboardingGate } from "@/components/onboarding/OnboardingGate";
import { useApp } from "@/context/AppContext";
import { useAuth } from "@/context/AuthContext";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { loading } = useApp();
  const { ready: authReady } = useAuth();
  const bare =
    pathname === "/login" ||
    pathname === "/welcome" ||
    pathname === "/workspaces" ||
    pathname === "/" ||
    pathname.startsWith("/auth/");

  if (!authReady || (loading && !bare)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f4f6f8] text-slate-500">
        Loading…
      </div>
    );
  }

  if (bare) {
    return <>{children}</>;
  }

  return (
    <div className="flex min-h-screen">
      {/* Bare pages route themselves; the gate covers only the main app. */}
      <OnboardingGate />
      <Sidebar />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
