"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { LedgerWordmark } from "@/components/brand/LedgerWordmark";
import { parseAuthHashError, type AuthHashError } from "@/lib/supabase/authHash";

/**
 * Where the confirmation email lands. The link's tokens arrive in the URL
 * hash and are consumed asynchronously by supabase-js, so this page waits
 * for the session instead of judging on first paint, then hands off to
 * Welcome — which decides between the role step and the Dashboard. Expired
 * or reused links arrive as an error hash and get a dead-end card here;
 * every other page would silently bounce them.
 */
export default function ConfirmPage() {
  const router = useRouter();
  const { configured, ready, user } = useAuth();
  // Read once at first client render; the error hash is static for the life
  // of the page (supabase-js strips only token hashes). Prerendered HTML
  // can't know the hash, so the failed case hydrates via client re-render.
  const [hashError] = useState<AuthHashError | null>(() =>
    typeof window === "undefined" ? null : parseAuthHashError(window.location.hash)
  );
  const [timedOut, setTimedOut] = useState(false);

  useEffect(() => {
    if (!ready || hashError) return;
    if (!configured) {
      router.replace("/dashboard");
      return;
    }
    if (user) {
      router.replace("/welcome");
      return;
    }
    // No session yet: the hash tokens may still be in flight. Give
    // onAuthStateChange a moment to land the session before declaring
    // the link dead.
    const timer = setTimeout(() => setTimedOut(true), 3000);
    return () => clearTimeout(timer);
  }, [ready, configured, user, hashError, router]);

  const failed = hashError !== null || (timedOut && !user);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-brand-ground p-6">
      <div className="mb-8">
        <LedgerWordmark variant="sidebar" />
      </div>
      {failed ? (
        <div className="w-full max-w-md rounded-xl bg-surface p-6 shadow-lg">
          <h1 className="text-xl font-semibold text-ink">
            This confirmation link is invalid or has expired
          </h1>
          <p className="mt-2 text-sm text-ink-2">
            Sign in to request a fresh link, or create the account again if you never
            finished signing up.
          </p>
          <Link
            href="/login"
            className="mt-4 inline-block rounded-lg bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:bg-accent-hover"
          >
            Back to sign in
          </Link>
        </div>
      ) : (
        <p className="text-muted">Confirming your email…</p>
      )}
    </main>
  );
}
