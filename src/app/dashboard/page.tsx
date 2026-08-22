"use client";

import { Header } from "@/components/layout/Header";
import { EmptyState } from "@/components/EmptyState";
import { useApp } from "@/context/AppContext";
import { DashboardContent } from "@/components/dashboard/DashboardContent";

export default function DashboardPage() {
  const { hasData } = useApp();

  return (
    <>
      <Header
        ledgerTitle
        title="Dashboard"
        subtitle="Key changes, personnel trends, and funding mix for your lab"
      />
      <main className="flex-1 overflow-y-auto p-6">
        <div className="mx-auto w-full max-w-7xl">
          {!hasData ? (
            <EmptyState />
          ) : (
            <DashboardContent />
          )}
        </div>
      </main>
    </>
  );
}
