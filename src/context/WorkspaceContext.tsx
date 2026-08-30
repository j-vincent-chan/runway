"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useAuth } from "@/context/AuthContext";
import { setActiveWorkspaceOverride } from "@/lib/supabase/activeWorkspace";
import {
  deleteDelegate,
  fetchDelegationsToMe,
  fetchMyDelegates,
  upsertDelegate,
  type DelegationGrant,
} from "@/lib/supabase/delegates";

/**
 * Roles are derived, not stored: everyone is the PI of their own workspace,
 * and "financial analyst" simply means at least one PI has granted you access
 * (workspace_delegates row naming your email). Switching into a delegated
 * workspace sets the module-level override every cloud read/write honors,
 * then AppContext re-hydrates against the PI's data.
 *
 * Delegation is cloud-only by construction — a grant lives in Supabase and
 * the PI's data never touches the analyst's browser storage.
 *
 * All state here is keyed by the auth user it was loaded for and ignored the
 * moment another user signs in, so nothing needs a synchronous reset on
 * account switch and one user's grants can never leak into another's view.
 */
export type ActiveWorkspace = {
  userId: string;
  email: string;
  /** false while acting inside a delegated PI workspace. */
  isSelf: boolean;
};

type WorkspaceContextValue = {
  /** null until auth is ready or while signed out. */
  activeOwner: ActiveWorkspace | null;
  /** Grants naming me as the analyst — the PI workspaces I can open. */
  delegationsToMe: DelegationGrant[];
  /** Grants I made as the PI — who can open mine. */
  myDelegates: DelegationGrant[];
  /** piUserId to act as, or null for my own workspace. */
  switchWorkspace: (piUserId: string | null) => void;
  refreshDelegations: () => Promise<void>;
  addDelegate: (analystEmail: string) => Promise<{ ok: boolean; error?: string }>;
  removeDelegate: (analystEmail: string) => Promise<void>;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

function selectionStorageKey(userId: string): string {
  return `runway:activeWorkspace:${userId}`;
}

function readPersistedSelection(userId: string): string | null {
  try {
    return localStorage.getItem(selectionStorageKey(userId));
  } catch {
    return null;
  }
}

function persistSelection(userId: string, piUserId: string | null): void {
  try {
    if (piUserId) localStorage.setItem(selectionStorageKey(userId), piUserId);
    else localStorage.removeItem(selectionStorageKey(userId));
  } catch {
    // Selection persistence is a convenience; failing closed is fine.
  }
}

type GrantsState = { forUserId: string; toMe: DelegationGrant[]; mine: DelegationGrant[] };
type SelectionState = { forUserId: string; grant: DelegationGrant };

const NO_GRANTS: DelegationGrant[] = [];

export function WorkspaceProvider({ children }: { children: React.ReactNode }) {
  const { ready: authReady, user, cloudSyncEnabled } = useAuth();
  const userId = user?.id ?? null;
  const userEmail = user?.email ?? (user?.user_metadata?.email as string | undefined) ?? "";
  const delegationActive = Boolean(cloudSyncEnabled && userId);

  const [grants, setGrants] = useState<GrantsState | null>(null);
  const [selection, setSelection] = useState<SelectionState | null>(null);

  const delegationsToMe =
    delegationActive && grants?.forUserId === userId ? grants.toMe : NO_GRANTS;
  const myDelegates =
    delegationActive && grants?.forUserId === userId ? grants.mine : NO_GRANTS;
  const selectedPi =
    delegationActive && selection?.forUserId === userId ? selection.grant : null;

  const refreshDelegations = useCallback(async () => {
    if (!delegationActive || !userId) return;
    const [toMe, mine] = await Promise.all([
      fetchDelegationsToMe(userEmail),
      fetchMyDelegates(),
    ]);
    setGrants({ forUserId: userId, toMe, mine });
  }, [delegationActive, userId, userEmail]);

  /**
   * On sign-in: load grants, then restore a persisted selection only if the
   * grant still exists — a revoked analyst lands back on their own (empty)
   * workspace rather than a wall of permission errors.
   */
  useEffect(() => {
    if (!authReady || !delegationActive || !userId) return;
    let cancelled = false;
    void (async () => {
      const [toMe, mine] = await Promise.all([
        fetchDelegationsToMe(userEmail),
        fetchMyDelegates(),
      ]);
      if (cancelled) return;
      setGrants({ forUserId: userId, toMe, mine });
      const persisted = readPersistedSelection(userId);
      const grant = persisted ? toMe.find((g) => g.piUserId === persisted) ?? null : null;
      if (persisted && !grant) persistSelection(userId, null);
      setSelection(grant ? { forUserId: userId, grant } : null);
    })();
    return () => {
      cancelled = true;
    };
  }, [authReady, delegationActive, userId, userEmail]);

  const switchWorkspace = useCallback(
    (piUserId: string | null) => {
      if (!userId) return;
      const grant = piUserId
        ? delegationsToMe.find((g) => g.piUserId === piUserId) ?? null
        : null;
      // AppContext's re-hydrate re-asserts the override from activeOwner;
      // setting it here too just closes the gap until that effect runs.
      setActiveWorkspaceOverride(grant ? { userId: grant.piUserId, email: grant.piEmail } : null);
      persistSelection(userId, grant?.piUserId ?? null);
      setSelection(grant ? { forUserId: userId, grant } : null);
    },
    [userId, delegationsToMe]
  );

  const addDelegate = useCallback(
    async (analystEmail: string) => {
      const result = await upsertDelegate({ analystEmail, piEmail: userEmail });
      if (result.ok) await refreshDelegations();
      return result;
    },
    [userEmail, refreshDelegations]
  );

  const removeDelegate = useCallback(
    async (analystEmail: string) => {
      await deleteDelegate(analystEmail);
      await refreshDelegations();
    },
    [refreshDelegations]
  );

  const activeOwner = useMemo<ActiveWorkspace | null>(() => {
    if (!userId) return null;
    if (selectedPi) return { userId: selectedPi.piUserId, email: selectedPi.piEmail, isSelf: false };
    return { userId, email: userEmail, isSelf: true };
  }, [userId, userEmail, selectedPi]);

  const value = useMemo<WorkspaceContextValue>(
    () => ({
      activeOwner,
      delegationsToMe,
      myDelegates,
      switchWorkspace,
      refreshDelegations,
      addDelegate,
      removeDelegate,
    }),
    [
      activeOwner,
      delegationsToMe,
      myDelegates,
      switchWorkspace,
      refreshDelegations,
      addDelegate,
      removeDelegate,
    ]
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceContextValue {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used within WorkspaceProvider");
  return ctx;
}
