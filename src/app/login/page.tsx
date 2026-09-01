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
      setError(err instanceof Error ? err.message : "Authentication failed.");
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
      <main className="flex min-h-screen flex-col items-center justify-center bg-[#0c2340] p-6">
        <div className="mb-8 origin-center scale-[1.2] text-white">
          <LedgerWordmark variant="sidebar" />
        </div>
        <div className="w-full max-w-md space-y-4 rounded-xl border border-white/10 bg-white p-6 shadow-lg">
          <h1 className="text-xl font-semibold text-[#0c2340]">Check your inbox</h1>
          <p className="text-sm text-slate-600">
            We sent a confirmation link to{" "}
            <span className="font-medium text-[#0c2340]">{sentToEmail}</span>. Click it to
            finish setting up your account — it opens right where you left off.
          </p>
          {error && <p className="text-sm text-red-600">{error}</p>}
          {resendNote && <p className="text-sm text-teal-800">{resendNote}</p>}
          <button
            type="button"
            disabled={busy}
            onClick={() => void resend()}
            className="w-full rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-[#0c2340] hover:border-teal-700 hover:bg-teal-50/40 disabled:opacity-60"
          >
            {busy ? "Please wait…" : "Resend email"}
          </button>
          <button
            type="button"
            className="w-full text-sm text-slate-600 hover:underline"
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
        {error && <p className="text-sm text-red-600">{error}</p>}
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
