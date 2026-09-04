"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Accounts moved into Settings — keep old URL working. */
export default function AccountsRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/settings#accounts");
  }, [router]);
  return (
    <main className="flex flex-1 items-center justify-center p-6 text-sm text-muted">
      Redirecting to Settings…
    </main>
  );
}
