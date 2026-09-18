"use client";

import { createContext, useContext, useMemo, useState } from "react";
import { useApp } from "@/context/AppContext";
import { LinkPlannedHireDialog } from "@/components/projections/LinkPlannedHireDialog";
import { UnlinkPlannedHireDialog } from "@/components/projections/UnlinkPlannedHireDialog";

export interface LinkDialogRequest {
  plannedHireId: string;
  /** Preselects the person; omitted for a manual link with the picker. */
  employeePersonKey?: string;
  mode: "suggested" | "manual";
}

interface ReconciliationDialogsValue {
  openLinkDialog: (request: LinkDialogRequest) => void;
  openUnlinkDialog: (linkId: string) => void;
}

const ReconciliationDialogsContext = createContext<ReconciliationDialogsValue | null>(null);

/**
 * One mount point for the Link and Unlink dialogs. Employees, Projections
 * and Upload all open them, so the dialogs live above the routed page rather
 * than three times over — and the row that opened one is re-read from the
 * derived view, so a dialog can never show a plan whose status has moved on.
 */
export function ReconciliationDialogsProvider({ children }: { children: React.ReactNode }) {
  const { reconciliation, unlinkPlannedHire } = useApp();
  const [linkRequest, setLinkRequest] = useState<LinkDialogRequest | null>(null);
  const [unlinkId, setUnlinkId] = useState<string | null>(null);

  const linkRow = linkRequest
    ? reconciliation.rows.find((r) => r.plan.id === linkRequest.plannedHireId)
    : undefined;
  const unlinkRow = unlinkId ? reconciliation.rows.find((r) => r.link?.id === unlinkId) : undefined;

  const value = useMemo<ReconciliationDialogsValue>(
    () => ({ openLinkDialog: setLinkRequest, openUnlinkDialog: setUnlinkId }),
    []
  );

  return (
    <ReconciliationDialogsContext.Provider value={value}>
      {children}
      {linkRequest && linkRow && linkRow.status !== "linked" && (
        <LinkPlannedHireDialog
          row={linkRow}
          mode={linkRequest.mode}
          initialPersonKey={linkRequest.employeePersonKey}
          onClose={() => setLinkRequest(null)}
        />
      )}
      {unlinkId && unlinkRow?.link && (
        <UnlinkPlannedHireDialog
          row={unlinkRow}
          onConfirm={() => {
            const result = unlinkPlannedHire(unlinkId);
            if (!result.ok) window.alert(result.reason);
            setUnlinkId(null);
          }}
          onClose={() => setUnlinkId(null)}
        />
      )}
    </ReconciliationDialogsContext.Provider>
  );
}

export function useReconciliationDialogs(): ReconciliationDialogsValue {
  const ctx = useContext(ReconciliationDialogsContext);
  if (!ctx) {
    throw new Error("useReconciliationDialogs must be used within ReconciliationDialogsProvider");
  }
  return ctx;
}
