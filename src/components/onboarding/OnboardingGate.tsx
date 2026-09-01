"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";
import { lookupMyProfile } from "@/lib/supabase/profiles";

/**
 * Steers a signed-in user who hasn't finished onboarding (no profiles row
 * yet) to /welcome from anywhere in the main app, so a deep link or a
 * confirmation tab can't drop them into an empty workspace mid-flow.
 * Everyone else passes through untouched: signed-out and local-only users,
 * accounts that predate onboarding (no full_name metadata), and — because a
 * failed lookup proves nothing — anyone whose profile fetch errors.
 */
export function OnboardingGate() {
  const router = useRouter();
  const { configured, ready, user } = useAuth();
  const onboardedUserIds = useRef<Set<string>>(new Set());

  const userId = user?.id ?? null;
  const metadataName = ((user?.user_metadata?.full_name as string | undefined) ?? "").trim();

  useEffect(() => {
    if (!configured || !ready || !userId || !metadataName) return;
    if (onboardedUserIds.current.has(userId)) return;
    let cancelled = false;
    void (async () => {
      const lookup = await lookupMyProfile();
      if (cancelled) return;
      if (lookup.status === "found") onboardedUserIds.current.add(userId);
      else if (lookup.status === "none") router.replace("/welcome");
    })();
    return () => {
      cancelled = true;
    };
  }, [configured, ready, userId, metadataName, router]);

  return null;
}
