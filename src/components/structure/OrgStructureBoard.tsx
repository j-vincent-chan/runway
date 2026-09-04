"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Employee, OrgBranch, OrgStructure } from "@/types";
import { StructureEmployeeCard } from "@/components/structure/StructureEmployeeCard";
import { getDragEmployee } from "@/lib/org/dnd";
import {
  addOrgBranch,
  DEFAULT_ORG_SUBTITLE,
  DEFAULT_ORG_TITLE,
  employeesById,
  moveEmployeeInOrg,
  removeOrgBranch,
  renameOrgBranch,
  setOrgLead,
  syncOrgStructureWithRoster,
  unassignedEmployeeIds,
  updateOrgChartMeta,
} from "@/lib/org/structure";
import { getEmployeePhotoUrlFor } from "@/lib/employees/roster";
import type { AppSettings } from "@/types";
import { cn } from "@/lib/utils/cn";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";

export function OrgStructureBoard({
  employees,
  settings,
  onStructureChange,
}: {
  employees: Employee[];
  settings: AppSettings;
  onStructureChange: (structure: OrgStructure) => void;
}) {
  const rosterIds = useMemo(() => employees.map((e) => e.id), [employees]);
  const empMap = useMemo(() => employeesById(employees), [employees]);

  const structure = useMemo(
    () => syncOrgStructureWithRoster(settings.orgStructure, rosterIds),
    [settings.orgStructure, rosterIds]
  );

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{
    branchId: string | null;
    index: number;
  } | null>(null);
  const [showUnassigned, setShowUnassigned] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(structure.title ?? DEFAULT_ORG_TITLE);
  const [subtitleDraft, setSubtitleDraft] = useState(
    structure.subtitle ?? DEFAULT_ORG_SUBTITLE
  );

  useEffect(() => {
    const raw = settings.orgStructure;
    const synced = syncOrgStructureWithRoster(raw, rosterIds);
    const pruned =
      raw &&
      JSON.stringify({
        lead: raw.leadEmployeeId,
        branches: raw.branches.map((b) => b.employeeIds),
      }) !==
        JSON.stringify({
          lead: synced.leadEmployeeId,
          branches: synced.branches.map((b) => b.employeeIds),
        });
    if (pruned) onStructureChange(synced);
  }, [settings.orgStructure, rosterIds, onStructureChange]);

  useEffect(() => {
    setTitleDraft(structure.title ?? DEFAULT_ORG_TITLE);
    setSubtitleDraft(structure.subtitle ?? DEFAULT_ORG_SUBTITLE);
  }, [structure.title, structure.subtitle]);

  const unassigned = useMemo(
    () => unassignedEmployeeIds(structure, rosterIds),
    [structure, rosterIds]
  );

  const leadEmployee = structure.leadEmployeeId
    ? empMap.get(structure.leadEmployeeId)
    : undefined;

  const endDrag = () => {
    setDraggingId(null);
    setDropTarget(null);
  };

  const handleDrop = useCallback(
    (employeeId: string, branchId: string | null, index: number) => {
      const next = moveEmployeeInOrg(structure, employeeId, branchId, index);
      onStructureChange(next);
      endDrag();
    },
    [structure, onStructureChange]
  );

  const handleLeadDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const id = getDragEmployee(e.dataTransfer);
    if (id) {
      onStructureChange(setOrgLead(structure, id));
      endDrag();
    }
  };

  const commitTitleEdit = () => {
    setEditingTitle(false);
    onStructureChange(
      updateOrgChartMeta(structure, {
        title: titleDraft.trim() || DEFAULT_ORG_TITLE,
        subtitle: subtitleDraft.trim() || DEFAULT_ORG_SUBTITLE,
      })
    );
  };

  return (
    <div className="mx-auto max-w-[1200px]">
      {/* Chart header — matches reference site */}
      <div className="text-center">
        {editingTitle ? (
          <div className="mx-auto max-w-lg space-y-2">
            <input
              autoFocus
              className="w-full border-b-2 border-brand-ground bg-transparent text-center text-3xl font-bold text-ink outline-none"
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && commitTitleEdit()}
            />
            <input
              className="w-full border-b border-control bg-transparent text-center text-sm text-estimated outline-none"
              value={subtitleDraft}
              onChange={(e) => setSubtitleDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && commitTitleEdit()}
            />
            <button
              type="button"
              className="text-xs text-accent hover:underline"
              onClick={commitTitleEdit}
            >
              Done editing
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="group w-full text-center"
            title="Click to edit title and subtitle"
            onClick={() => setEditingTitle(true)}
          >
            <h2 className="text-3xl font-bold text-ink group-hover:text-accent">
              {structure.title ?? DEFAULT_ORG_TITLE}
            </h2>
            <p className="mt-1 text-sm font-medium text-estimated group-hover:text-estimated">
              {structure.subtitle ?? DEFAULT_ORG_SUBTITLE}
            </p>
          </button>
        )}
      </div>

      {/* Director / lead node */}
      <div className="mt-10 flex flex-col items-center">
        <div
          className={cn(
            "min-h-[4.5rem] transition-colors",
            dropTarget?.branchId === null && dropTarget.index === -1 && "rounded-full ring-2 ring-accent"
          )}
          onDragOver={(e) => {
            e.preventDefault();
            setDropTarget({ branchId: null, index: -1 });
          }}
          onDragLeave={() => setDropTarget(null)}
          onDrop={handleLeadDrop}
        >
          {leadEmployee ? (
            <StructureEmployeeCard
              employee={leadEmployee}
              photoUrl={getEmployeePhotoUrlFor(settings, leadEmployee)}
              variant="lead"
              isDragging={draggingId === leadEmployee.id}
              onDragStart={() => setDraggingId(leadEmployee.id)}
              onDragEnd={endDrag}
            />
          ) : (
            <div className="flex h-16 min-w-[14rem] items-center justify-center rounded-full border-2 border-dashed border-control bg-inset px-6 text-sm text-muted">
              Drag director here
            </div>
          )}
        </div>
        {structure.branches.length > 0 && (
          <div className="mt-0 h-10 w-0.5 bg-muted" aria-hidden />
        )}
      </div>

      {/* Branch columns with connector lines */}
      {structure.branches.length > 0 && (
        <div className="relative mt-0 px-4">
          <div
            className="pointer-events-none absolute left-[8%] right-[8%] top-0 h-0.5 bg-muted"
            aria-hidden
          />
          <div className="flex justify-center gap-6 overflow-x-auto pb-4 pt-6">
            {structure.branches.map((branch) => (
              <ChartColumn
                key={branch.id}
                branch={branch}
                empMap={empMap}
                settings={settings}
                draggingId={draggingId}
                dropTarget={dropTarget}
                onDragStart={setDraggingId}
                onDragEnd={endDrag}
                onDropAt={handleDrop}
                onSetDropTarget={setDropTarget}
                onRename={(name) =>
                  onStructureChange(renameOrgBranch(structure, branch.id, name))
                }
                onRemove={() => {
                  if (
                    branch.employeeIds.length > 0 &&
                    !window.confirm(
                      `Remove "${branch.name}"? ${branch.employeeIds.length} people will move to Unassigned.`
                    )
                  ) {
                    return;
                  }
                  let next = removeOrgBranch(structure, branch.id);
                  for (const id of branch.employeeIds) {
                    next = moveEmployeeInOrg(next, id, null);
                  }
                  onStructureChange(next);
                }}
              />
            ))}
            <AddBranchColumn
              onAdd={() => onStructureChange(addOrgBranch(structure, "New branch"))}
            />
          </div>
        </div>
      )}

      {structure.branches.length === 0 && (
        <div className="mt-8 flex justify-center">
          <AddBranchColumn
            wide
            onAdd={() => onStructureChange(addOrgBranch(structure, "Research Development"))}
          />
        </div>
      )}

      {/* Edit toolbar */}
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3 border-t border-rule pt-6 text-xs text-muted">
        <button
          type="button"
          className="inline-flex items-center gap-1 rounded-lg border border-rule bg-surface px-3 py-1.5 hover:bg-inset"
          onClick={() => onStructureChange(addOrgBranch(structure, "New branch"))}
        >
          <Plus className="h-3.5 w-3.5" />
          Add branch
        </button>
        {unassigned.length > 0 && (
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded-lg border border-caution bg-caution-soft px-3 py-1.5 text-caution hover:bg-caution-soft"
            onClick={() => setShowUnassigned((v) => !v)}
          >
            {showUnassigned ? (
              <ChevronUp className="h-3.5 w-3.5" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" />
            )}
            {unassigned.length} unassigned
          </button>
        )}
        <span>Drag people between columns · click branch name to rename</span>
      </div>

      {showUnassigned && unassigned.length > 0 && (
        <UnassignedStrip
          employeeIds={unassigned}
          empMap={empMap}
          settings={settings}
          draggingId={draggingId}
          onDragStart={setDraggingId}
          onDragEnd={endDrag}
          onDropAt={handleDrop}
        />
      )}
    </div>
  );
}

function ChartColumn({
  branch,
  empMap,
  settings,
  draggingId,
  dropTarget,
  onDragStart,
  onDragEnd,
  onDropAt,
  onSetDropTarget,
  onRename,
  onRemove,
}: {
  branch: OrgBranch;
  empMap: Map<string, Employee>;
  settings: AppSettings;
  draggingId: string | null;
  dropTarget: { branchId: string | null; index: number } | null;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onDropAt: (employeeId: string, branchId: string | null, index: number) => void;
  onSetDropTarget: (t: { branchId: string | null; index: number } | null) => void;
  onRename: (name: string) => void;
  onRemove: () => void;
}) {
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(branch.name);

  useEffect(() => {
    setNameDraft(branch.name);
  }, [branch.name]);

  const isActive = dropTarget?.branchId === branch.id;

  return (
    <div
      className={cn(
        "flex w-[min(100%,13.5rem)] shrink-0 flex-col items-center",
        isActive && "rounded-lg ring-2 ring-accent"
      )}
      onDragOver={(e) => {
        e.preventDefault();
        onSetDropTarget({ branchId: branch.id, index: branch.employeeIds.length });
      }}
      onDragLeave={() => onSetDropTarget(null)}
      onDrop={(e) => {
        e.preventDefault();
        const id = getDragEmployee(e.dataTransfer);
        if (!id) return;
        onDropAt(id, branch.id, branch.employeeIds.length);
      }}
    >
      <div className="mb-4 h-6 w-0.5 bg-muted" aria-hidden />

      <div className="group/header relative w-full text-center">
        {editingName ? (
          <input
            autoFocus
            className="w-full border-b border-control bg-transparent text-center text-xs font-semibold uppercase tracking-[0.12em] text-ink-2 outline-none"
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={() => {
              setEditingName(false);
              onRename(nameDraft);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setEditingName(false);
                onRename(nameDraft);
              }
            }}
          />
        ) : (
          <button
            type="button"
            className="w-full text-xs font-semibold uppercase tracking-[0.12em] text-muted hover:text-ink"
            onClick={() => setEditingName(true)}
          >
            {branch.name}
          </button>
        )}
        <button
          type="button"
          className="absolute -right-1 top-0 rounded p-0.5 text-muted opacity-0 hover:text-critical group-hover/header:opacity-100"
          title="Remove branch"
          onClick={onRemove}
        >
          <Trash2 className="h-3 w-3" />
        </button>
      </div>

      <div className="mt-4 flex w-full flex-col items-center gap-3">
        {branch.employeeIds.length === 0 ? (
          <p className="py-6 text-center text-[10px] text-muted">Drop here</p>
        ) : (
          branch.employeeIds.map((id, index) => {
            const emp = empMap.get(id);
            if (!emp) return null;
            return (
              <div key={id} className="w-full">
                <DropIndicator
                  branchId={branch.id}
                  index={index}
                  onDropAt={onDropAt}
                  visible={!!draggingId}
                  active={dropTarget?.branchId === branch.id && dropTarget.index === index}
                />
                <StructureEmployeeCard
                  employee={emp}
                  photoUrl={getEmployeePhotoUrlFor(settings, emp)}
                  isDragging={draggingId === id}
                  onDragStart={() => onDragStart(id)}
                  onDragEnd={onDragEnd}
                />
              </div>
            );
          })
        )}
        <DropIndicator
          branchId={branch.id}
          index={branch.employeeIds.length}
          onDropAt={onDropAt}
          visible={!!draggingId}
          active={
            dropTarget?.branchId === branch.id &&
            dropTarget.index === branch.employeeIds.length
          }
        />
      </div>
    </div>
  );
}

function AddBranchColumn({ onAdd, wide }: { onAdd: () => void; wide?: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        "flex shrink-0 flex-col items-center justify-center gap-1 self-start rounded-lg border-2 border-dashed border-rule text-muted hover:border-accent hover:text-accent",
        wide ? "mt-16 min-h-[8rem] w-48" : "mt-10 h-32 w-28"
      )}
      onClick={onAdd}
    >
      <Plus className="h-5 w-5" />
      <span className="text-[10px] font-medium uppercase tracking-wide">Add branch</span>
    </button>
  );
}

function UnassignedStrip({
  employeeIds,
  empMap,
  settings,
  draggingId,
  onDragStart,
  onDragEnd,
  onDropAt,
}: {
  employeeIds: string[];
  empMap: Map<string, Employee>;
  settings: AppSettings;
  draggingId: string | null;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onDropAt: (employeeId: string, branchId: string | null, index: number) => void;
}) {
  return (
    <div
      className="mt-4 rounded-xl border border-caution bg-caution-soft/50 p-4"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const id = getDragEmployee(e.dataTransfer);
        if (id) onDropAt(id, null, 0);
      }}
    >
      <p className="mb-3 text-xs font-medium text-caution">Unassigned — drag onto the chart</p>
      <div className="flex flex-wrap justify-center gap-3">
        {employeeIds.map((id) => {
          const emp = empMap.get(id);
          if (!emp) return null;
          return (
            <div key={id} className="w-[13rem]">
              <StructureEmployeeCard
                employee={emp}
                photoUrl={getEmployeePhotoUrlFor(settings, emp)}
                isDragging={draggingId === id}
                onDragStart={() => onDragStart(id)}
                onDragEnd={onDragEnd}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

function DropIndicator({
  branchId,
  index,
  onDropAt,
  visible,
  active,
}: {
  branchId: string | null;
  index: number;
  onDropAt: (employeeId: string, branchId: string | null, index: number) => void;
  visible: boolean;
  active?: boolean;
}) {
  if (!visible) return <div className="h-0" />;
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = "move";
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const id = getDragEmployee(e.dataTransfer);
        if (id) onDropAt(id, branchId, index);
      }}
      className={cn(
        "w-full rounded-full transition-all",
        active ? "my-0.5 h-1.5 bg-accent" : "h-1 bg-transparent"
      )}
    />
  );
}
