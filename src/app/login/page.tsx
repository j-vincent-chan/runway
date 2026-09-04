"use client";

import { type FormEvent, useEffect, useId, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CircleHelp } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { LedgerWordmark } from "@/components/brand/LedgerWordmark";

export default function LoginPage() {
  const router = useRouter();
  const { configured, ready, user, signInWithPassword, signUpWithPassword, resendSignUpEmail } =
    useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sentToEmail, setSentToEmail] = useState<string | null>(null);
  const [resendNote, setResendNote] = useState<string | null>(null);
  const [localModeInfoOpen, setLocalModeInfoOpen] = useState(false);
  const localModeInfoId = useId();

  useEffect(() => {
    if (!ready || !configured || !user) return;
    // Welcome decides: a first sign-in gets the role step, everyone else is
    // bounced straight on to the Dashboard.
    router.replace("/welcome");
  }, [ready, configured, user, router]);

  if (!configured) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-inset p-6">
        <div className="max-w-md rounded-xl border bg-surface p-6 shadow-sm">
          <h1 className="text-lg font-semibold text-ink">Cloud not configured</h1>
          <p className="mt-2 text-sm text-ink-2">
            Add Supabase URL and publishable key to{" "}
            <code className="text-xs">.env.local</code>, then enable Email auth in the
            Supabase dashboard. You can keep using Runway in local-only mode without
            signing in.
          </p>
          <Link href="/dashboard" className="mt-4 inline-block text-sm text-accent hover:underline">
            Continue to app
          </Link>
        </div>
      </main>
    );
  }

  if (user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper text-muted">
        Loading…
      </div>
    );
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "signin") {
        await signInWithPassword(email, password);
        router.replace("/welcome");
      } else {
        await signUpWithPassword(email, password, fullName);
        setSentToEmail(email.trim());
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Authentication failed.";
      // Surface duplicate-email errors more clearly
      if (message.toLowerCase().includes("already registered") || message.toLowerCase().includes("user already exists")) {
        setError(`An account with ${email.trim()} already exists. Sign in instead, or delete the account first if you're testing.`);
      } else {
        setError(message);
      }
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (!sentToEmail || busy) return;
    setError(null);
    setResendNote(null);
    setBusy(true);
    try {
      await resendSignUpEmail(sentToEmail);
      setResendNote(`Confirmation email re-sent to ${sentToEmail}.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not resend the email.");
    } finally {
      setBusy(false);
    }
  }

  if (sentToEmail) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-brand-ground p-6">
        <div className="mb-8 origin-center scale-[1.2] text-white">
          <LedgerWordmark variant="sidebar" />
        </div>
        <div className="w-full max-w-md space-y-4 rounded-xl border border-white/10 bg-surface p-6 shadow-lg">
          <h1 className="text-xl font-semibold text-ink">Check your inbox</h1>
          <p className="text-sm text-ink-2">
            We sent a confirmation link to{" "}
            <span className="font-medium text-ink">{sentToEmail}</span>. Click it to
            finish setting up your account — it opens right where you left off.
          </p>
          {error && <p className="text-sm text-critical">{error}</p>}
          {resendNote && <p className="text-sm text-accent">{resendNote}</p>}
          <button
            type="button"
            disabled={busy}
            onClick={() => void resend()}
            className="w-full rounded-lg border border-control px-4 py-2 text-sm font-medium text-ink hover:border-accent hover:bg-accent-soft/40 disabled:opacity-60"
          >
            {busy ? "Please wait…" : "Resend email"}
          </button>
          <button
            type="button"
            className="w-full text-sm text-ink-2 hover:underline"
            onClick={() => {
              setSentToEmail(null);
              setResendNote(null);
              setError(null);
              setMode("signin");
            }}
          >
            Back to sign in
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-brand-ground p-6">
      <div className="mb-8 origin-center scale-[1.2] text-white">
        <LedgerWordmark variant="sidebar" />
      </div>
      <form
        onSubmit={onSubmit}
        className="w-full max-w-md space-y-4 rounded-xl border border-white/10 bg-surface p-6 shadow-lg"
      >
        <div>
          <h1 className="text-xl font-semibold text-ink">
            {mode === "signin" ? "Sign in" : "Create account"}
          </h1>
        </div>
        {mode === "signup" && (
          <label className="block text-sm">
            Full name
            <input
              type="text"
              required
              autoComplete="name"
              placeholder="e.g. Vincent Chan"
              className="mt-1 w-full rounded border px-3 py-2"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </label>
        )}
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
        {error && <p className="text-sm text-critical">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-lg bg-accent px-4 py-2 text-sm font-medium text-on-accent hover:bg-accent-hover disabled:opacity-60"
        >
          {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Sign up"}
        </button>
        <button
          type="button"
          className="w-full text-sm text-ink-2 hover:underline"
          onClick={() => {
            setMode(mode === "signin" ? "signup" : "signin");
            setError(null);
          }}
        >
          {mode === "signin" ? "Need an account? Sign up" : "Already have an account? Sign in"}
        </button>
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center justify-center gap-1.5">
            <Link href="/dashboard" className="text-sm text-muted hover:underline">
              Use local-mode only
            </Link>
            <button
              type="button"
              className="rounded-full p-0.5 text-muted hover:text-ink-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
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
              className="max-w-xs rounded-lg bg-inset px-3 py-2 text-center text-xs leading-relaxed text-ink-2"
            >
              While in local-mode, your data is only stored in your browser and never
              uploaded to the cloud. Clearing your browser data will permanently delete
              it.
            </p>
          )}
        </div>
      </form>
    </main>
  );
}
