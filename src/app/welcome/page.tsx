"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { FlaskConical, Users } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { LedgerWordmark } from "@/components/brand/LedgerWordmark";
import { RequestAccessForm } from "@/components/onboarding/RequestAccessForm";
import {
  fetchMyProfile,
  firstNameOf,
  upsertMyProfile,
  type RolePreference,
} from "@/lib/supabase/profiles";

/**
 * The one onboarding step: "how will you use Runway?" Shown exactly once,
 * to accounts created through the new sign-up (they carry a full_name in
 * auth metadata) that don't have a profile yet. Everyone else — existing
 * accounts, returning users — is bounced straight to the Dashboard, so
 * sign-in gains no extra hop and nobody is re-onboarded.
 *
 * The choice routes and personalizes; it is never a permission. A PI is
 * done immediately; an analyst gets the request-access form, whose
 * permanent home is Settings — this is just its first appearance.
 */
export default function WelcomePage() {
  const router = useRouter();
  const { configured, ready, user } = useAuth();
  const [step, setStep] = useState<"deciding" | "role" | "analyst">("deciding");
  const [busy, setBusy] = useState(false);

  const metadataName = ((user?.user_metadata?.full_name as string | undefined) ?? "").trim();

  useEffect(() => {
    if (!ready) return;
    if (!configured || !user) {
      router.replace(configured ? "/login" : "/dashboard");
      return;
    }
    let cancelled = false;
    void (async () => {
      const profile = await fetchMyProfile();
      if (cancelled) return;
      // A profile means onboarding already happened; no metadata name means
      // the account predates the flow — either way there's nothing to ask.
      if (profile || !metadataName) router.replace("/dashboard");
      else setStep("role");
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, configured, user, metadataName, router]);

  async function choose(role: RolePreference) {
    if (busy) return;
    setBusy(true);
    await upsertMyProfile({ fullName: metadataName, rolePreference: role });
    setBusy(false);
    if (role === "pi") router.replace("/dashboard");
    else setStep("analyst");
  }

  if (step === "deciding") {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#0c2340] text-slate-400">
        Loading…
      </main>
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-[#0c2340] p-6">
      <div className="mb-8">
        <LedgerWordmark variant="sidebar" />
      </div>
      <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-lg">
        {step === "role" ? (
          <>
            <h1 className="text-xl font-semibold text-[#0c2340]">
              Welcome{firstNameOf(metadataName) ? `, ${firstNameOf(metadataName)}` : ""}
            </h1>
            <p className="mt-1 text-sm text-slate-600">How will you use Runway?</p>
            <div className="mt-4 space-y-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void choose("pi")}
                className="flex w-full items-start gap-3 rounded-lg border border-slate-300 p-4 text-left hover:border-teal-700 hover:bg-teal-50/40 disabled:opacity-50"
              >
                <FlaskConical className="mt-0.5 h-5 w-5 shrink-0 text-teal-700" aria-hidden />
                <span>
                  <span className="block text-sm font-medium text-[#0c2340]">
                    I manage my own research funding
                  </span>
                  <span className="mt-0.5 block text-sm text-slate-600">
                    Principal investigator — upload your Payroll Funding Report and plan from
                    your own workspace.
                  </span>
                </span>
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void choose("analyst")}
                className="flex w-full items-start gap-3 rounded-lg border border-slate-300 p-4 text-left hover:border-teal-700 hover:bg-teal-50/40 disabled:opacity-50"
              >
                <Users className="mt-0.5 h-5 w-5 shrink-0 text-teal-700" aria-hidden />
                <span>
                  <span className="block text-sm font-medium text-[#0c2340]">
                    I support one or more PIs
                  </span>
                  <span className="mt-0.5 block text-sm text-slate-600">
                    Financial analyst — request access to the workspaces of the PIs you work
                    with.
                  </span>
                </span>
              </button>
            </div>
          </>
        ) : (
          <>
            <h1 className="text-xl font-semibold text-[#0c2340]">
              Request access to a PI&apos;s workspace
            </h1>
            <p className="mt-1 text-sm text-slate-600">
              Enter the email of each PI you support. They&apos;ll get an email asking them to
              approve your access — nothing is shared until they do. You can add more PIs
              later from Settings.
            </p>
            <div className="mt-4">
              <RequestAccessForm onDone={() => router.replace("/dashboard")} />
            </div>
          </>
        )}
      </div>
    </main>
  );
}
