"use client";

import { useCallback, useMemo } from "react";
import { EmptyState } from "@/components/EmptyState";
import { OrgStructureBoard } from "@/components/structure/OrgStructureBoard";
import { useApp } from "@/context/AppContext";
import { filterEmployeesForPlanning } from "@/lib/employees/roster";

export function EmployeesStructurePanel() {
  const { hasData, snapshot, settings, setOrgStructure } = useApp();

  const planningEmployees = useMemo(() => {
    if (!snapshot) return [];
    return filterEmployeesForPlanning(snapshot.employees, settings).sort((a, b) =>
      a.name.localeCompare(b.name)
    );
  }, [snapshot, settings]);

  const handleStructureChange = useCallback(
    (structure: Parameters<typeof setOrgStructure>[0]) => {
      setOrgStructure(structure);
    },
    [setOrgStructure]
  );

  if (!hasData || !snapshot) {
    return (
      <EmptyState message="Import employees on Upload to build your org chart in Runway." />
    );
  }

  if (planningEmployees.length === 0) {
    return (
      <EmptyState
        title="No active employees"
        message="Everyone is hidden or marked alumni. Restore people on the Roster tab to build your structure."
      />
    );
  }

  return (
    <OrgStructureBoard
      employees={planningEmployees}
      settings={settings}
      onStructureChange={handleStructureChange}
    />
  );
}
