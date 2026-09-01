"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import type { Session, User } from "@supabase/supabase-js";
import { getSupabase, isSupabaseConfigured } from "@/lib/supabase/client";
import {
  canUseCloudSync,
  getCloudLocalOnly,
  setCloudLocalOnly,
} from "@/lib/supabase/cloudGate";

type AuthContextValue = {
  configured: boolean;
  ready: boolean;
  session: Session | null;
  user: User | null;
  localOnly: boolean;
  cloudSyncEnabled: boolean;
  setLocalOnly: (value: boolean) => void;
  signInWithPassword: (email: string, password: string) => Promise<void>;
  signUpWithPassword: (email: string, password: string, fullName: string) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const configured = isSupabaseConfigured();
  const [ready, setReady] = useState(!configured);
  const [session, setSession] = useState<Session | null>(null);
  const [localOnly, setLocalOnlyState] = useState(false);

  useEffect(() => {
    setLocalOnlyState(getCloudLocalOnly());
  }, []);

  useEffect(() => {
    if (!configured) {
      setReady(true);
      return;
    }
    const supabase = getSupabase();
    if (!supabase) {
      setReady(true);
      return;
    }

    let cancelled = false;
    void supabase.auth.getSession().then(({ data }) => {
      if (cancelled) return;
      setSession(data.session ?? null);
      setReady(true);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setReady(true);
    });

    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, [configured]);

  const setLocalOnly = useCallback((value: boolean) => {
    setCloudLocalOnly(value);
    setLocalOnlyState(value);
  }, []);

  const signInWithPassword = useCallback(async (email: string, password: string) => {
    const supabase = getSupabase();
    if (!supabase) throw new Error("Supabase is not configured.");
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    if (error) throw error;
  }, []);

  const signUpWithPassword = useCallback(
    async (email: string, password: string, fullName: string) => {
      const supabase = getSupabase();
      if (!supabase) throw new Error("Supabase is not configured.");
      // The name rides in auth metadata so it survives the email-confirmation
      // gap (no session yet, so no profiles row can be written); the Welcome
      // step copies it into profiles on first sign-in. The confirmation link
      // lands on /auth/confirm, which waits for the session and hands off to
      // Welcome — the origin must be in Supabase's redirect-URL allowlist.
      const { error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: { full_name: fullName.trim() },
          emailRedirectTo: `${window.location.origin}/auth/confirm`,
        },
      });
      if (error) throw error;
    },
    []
  );

  /**
   * Supabase clears the local session (and revokes it server-side) before
   * this resolves, whether or not the network revoke call itself succeeds —
   * so the redirect always runs, and a signed-out user is never left on a
   * page that assumed they were signed in (Dashboard, for one, quietly
   * renders its empty-state once the cloud data drops out from under it,
   * which reads as broken rather than signed out). router.replace, not
   * push: the page they signed out from is swapped for /login in history
   * rather than kept one back-tap away.
   */
  const signOut = useCallback(async () => {
    const supabase = getSupabase();
    if (supabase) {
      const { error } = await supabase.auth.signOut();
      if (error) {
        console.warn("[auth] sign-out network call failed; local session is still cleared:", error.message);
      }
    }
    router.replace("/login");
  }, [router]);

  const value = useMemo<AuthContextValue>(
    () => ({
      configured,
      ready,
      session,
      user: session?.user ?? null,
      localOnly,
      cloudSyncEnabled: canUseCloudSync({
        configured,
        signedIn: Boolean(session),
        localOnly,
      }),
      setLocalOnly,
      signInWithPassword,
      signUpWithPassword,
      signOut,
    }),
    [
      configured,
      ready,
      session,
      localOnly,
      setLocalOnly,
      signInWithPassword,
      signUpWithPassword,
      signOut,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
