"use client";

import { Sidebar } from "./Sidebar";
import { useApp } from "@/context/AppContext";

export function AppShell({ children }: { children: React.ReactNode }) {
  const { loading } = useApp();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f4f6f8] text-slate-500">
        Loading…
      </div>
    );
  }
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
