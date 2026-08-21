"use client";

import { type FormEvent, useEffect, useId, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CircleHelp } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { LedgerWordmark } from "@/components/brand/LedgerWordmark";

export default function LoginPage() {
  const router = useRouter();
  const { configured, ready, user, signInWithPassword, signUpWithPassword } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [signupNote, setSignupNote] = useState<string | null>(null);
  const [localModeInfoOpen, setLocalModeInfoOpen] = useState(false);
  const localModeInfoId = useId();

  useEffect(() => {
    if (!ready || !configured || !user) return;
    router.replace("/dashboard");
  }, [ready, configured, user, router]);

  if (!configured) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="max-w-md rounded-xl border bg-white p-6 shadow-sm">
          <h1 className="text-lg font-semibold text-[#0c2340]">Cloud not configured</h1>
          <p className="mt-2 text-sm text-slate-600">
            Add Supabase URL and publishable key to{" "}
            <code className="text-xs">.env.local</code>, then enable Email auth in the
            Supabase dashboard. You can keep using Runway in local-only mode without
            signing in.
          </p>
          <Link href="/dashboard" className="mt-4 inline-block text-sm text-teal-700 hover:underline">
            Continue to app
          </Link>
        </div>
      </main>
    );
  }

  if (user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f4f6f8] text-slate-500">
        Loading…
      </div>
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSignupNote(null);
    setBusy(true);
    try {
      if (mode === "signin") {
        await signInWithPassword(email, password);
        router.replace("/dashboard");
      } else {
        await signUpWithPassword(email, password);
        setSignupNote(
          "Account created. If email confirmation is enabled in Supabase, check your inbox before signing in."
        );
        setMode("signin");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#0c2340] p-6">
      <div className="mb-8 origin-center scale-[1.2] text-white">
        <LedgerWordmark variant="sidebar" />
      </div>
      <form
        onSubmit={onSubmit}
        className="w-full max-w-md space-y-4 rounded-xl border border-white/10 bg-white p-6 shadow-lg"
      >
        <div>
          <h1 className="text-xl font-semibold text-[#0c2340]">
            {mode === "signin" ? "Sign in" : "Create account"}
          </h1>
        </div>
        <label className="block text-sm">
          Email
          <input
            type="email"
            required
            autoComplete="email"
            className="mt-1 w-full rounded border px-3 py-2"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="block text-sm">
          Password
          <input
            type="password"
            required
            minLength={6}
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            className="mt-1 w-full rounded border px-3 py-2"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        {signupNote && <p className="text-sm text-teal-800">{signupNote}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-teal-700 px-4 py-2 text-sm font-medium text-white hover:bg-teal-800 disabled:opacity-60"
        >
          {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Sign up"}
        </button>
        <button
          type="button"
          className="w-full text-sm text-slate-600 hover:underline"
          onClick={() => {
            setMode(mode === "signin" ? "signup" : "signin");
            setError(null);
            setSignupNote(null);
          }}
        >
          {mode === "signin" ? "Need an account? Sign up" : "Already have an account? Sign in"}
        </button>
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center justify-center gap-1.5">
            <Link href="/dashboard" className="text-sm text-slate-500 hover:underline">
              Use local-mode only
            </Link>
            <button
              type="button"
              className="rounded-full p-0.5 text-slate-400 hover:text-slate-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
              aria-label="About local-mode only"
              aria-expanded={localModeInfoOpen}
              aria-controls={localModeInfoId}
              onClick={() => setLocalModeInfoOpen((open) => !open)}
            >
              <CircleHelp className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
          {localModeInfoOpen && (
            <p
              id={localModeInfoId}
              className="max-w-xs rounded-lg bg-slate-50 px-3 py-2 text-center text-xs leading-relaxed text-slate-600"
            >
              Saved on this browser only (projections, aliases, titles, photo links).
              Nothing goes to the cloud. Clearing this site’s data or cookies deletes it.
            </p>
          )}
        </div>
      </form>
    </main>
  );
}
