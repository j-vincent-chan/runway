import type { Employee, OrgBranch, OrgStructure } from "@/types";
import { generateId } from "@/lib/utils/parse";

export const DEFAULT_ORG_TITLE = "Our Team";
export const DEFAULT_ORG_SUBTITLE = "Our diverse and cross-functional team";

export function createOrgBranch(name: string): OrgBranch {
  return { id: generateId(), name, employeeIds: [] };
}

export function emptyOrgStructure(): OrgStructure {
  return { branches: [] };
}

function stripEmployeeFromBranches(
  branches: OrgBranch[],
  employeeId: string
): OrgBranch[] {
  return branches.map((b) => ({
    ...b,
    employeeIds: b.employeeIds.filter((id) => id !== employeeId),
  }));
}

/** Active employee ids placed in a branch or as chart lead. */
export function placedEmployeeIds(structure: OrgStructure): Set<string> {
  const ids = new Set<string>();
  if (structure.leadEmployeeId) ids.add(structure.leadEmployeeId);
  for (const b of structure.branches) {
    for (const id of b.employeeIds) ids.add(id);
  }
  return ids;
}

export function unassignedEmployeeIds(
  structure: OrgStructure,
  rosterIds: string[]
): string[] {
  const placed = placedEmployeeIds(structure);
  return rosterIds.filter((id) => !placed.has(id));
}

export function syncOrgStructureWithRoster(
  structure: OrgStructure | undefined,
  rosterIds: string[]
): OrgStructure {
  const base = structure ?? emptyOrgStructure();
  const rosterSet = new Set(rosterIds);
  const leadEmployeeId =
    base.leadEmployeeId && rosterSet.has(base.leadEmployeeId)
      ? base.leadEmployeeId
      : undefined;
  const branches = base.branches.map((b) => ({
    ...b,
    employeeIds: b.employeeIds.filter((id) => rosterSet.has(id) && id !== leadEmployeeId),
  }));
  return {
    title: base.title,
    subtitle: base.subtitle,
    leadEmployeeId,
    branches,
  };
}

export function moveEmployeeInOrg(
  structure: OrgStructure,
  employeeId: string,
  toBranchId: string | null,
  toIndex?: number
): OrgStructure {
  let branches = stripEmployeeFromBranches(structure.branches, employeeId);
  let leadEmployeeId =
    structure.leadEmployeeId === employeeId ? undefined : structure.leadEmployeeId;

  if (toBranchId === null) {
    return { ...structure, leadEmployeeId, branches };
  }

  const idx = branches.findIndex((b) => b.id === toBranchId);
  if (idx < 0) return { ...structure, leadEmployeeId, branches };

  const target = { ...branches[idx] };
  const list = [...target.employeeIds];
  const insertAt =
    toIndex === undefined ? list.length : Math.max(0, Math.min(toIndex, list.length));
  list.splice(insertAt, 0, employeeId);
  target.employeeIds = list;
  branches[idx] = target;
  return { ...structure, leadEmployeeId, branches };
}

export function setOrgLead(
  structure: OrgStructure,
  employeeId: string | null
): OrgStructure {
  if (!employeeId) {
    return { ...structure, leadEmployeeId: undefined };
  }
  const branches = stripEmployeeFromBranches(structure.branches, employeeId);
  return { ...structure, leadEmployeeId: employeeId, branches };
}

export function updateOrgChartMeta(
  structure: OrgStructure,
  meta: { title?: string; subtitle?: string }
): OrgStructure {
  return {
    ...structure,
    ...(meta.title !== undefined ? { title: meta.title } : {}),
    ...(meta.subtitle !== undefined ? { subtitle: meta.subtitle } : {}),
  };
}

export function renameOrgBranch(
  structure: OrgStructure,
  branchId: string,
  name: string
): OrgStructure {
  return {
    ...structure,
    branches: structure.branches.map((b) =>
      b.id === branchId ? { ...b, name: name.trim() || b.name } : b
    ),
  };
}

export function addOrgBranch(structure: OrgStructure, name: string): OrgStructure {
  return {
    ...structure,
    branches: [...structure.branches, createOrgBranch(name.trim() || "New branch")],
  };
}

export function removeOrgBranch(structure: OrgStructure, branchId: string): OrgStructure {
  return { ...structure, branches: structure.branches.filter((b) => b.id !== branchId) };
}

export function employeesById(employees: Employee[]): Map<string, Employee> {
  return new Map(employees.map((e) => [e.id, e]));
}

export function pruneEmployeeFromOrgStructure(
  structure: OrgStructure | undefined,
  employeeId: string
): OrgStructure | undefined {
  if (!structure) return structure;
  return {
    ...structure,
    leadEmployeeId:
      structure.leadEmployeeId === employeeId ? undefined : structure.leadEmployeeId,
    branches: structure.branches.map((b) => ({
      ...b,
      employeeIds: b.employeeIds.filter((id) => id !== employeeId),
    })),
  };
}
