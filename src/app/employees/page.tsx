"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Header } from "@/components/layout/Header";
import { EmptyState } from "@/components/EmptyState";
import { useApp } from "@/context/AppContext";
import {
  calculateEmployeeCoverage,
  calculateMonthlyCost,
  getAllMonths,
  getCurrentMonth,
} from "@/lib/calculations";
import { coverageOptionsFromSettings, getEffectiveExpectedPercent } from "@/lib/funding/visibility";
import {
  countAlumniEmployees,
  countHiddenEmployees,
  filterEmployeesForEmployeesPage,
  getEmployeePhotoUrlFor,
  isEmployeeAlumni,
  isEmployeeHidden,
} from "@/lib/employees/roster";
import { uploadEmployeePhotoFile } from "@/lib/supabase/sync";
import { useAuth } from "@/context/AuthContext";
import { formatCurrency, formatMonthDisplay } from "@/lib/utils/parse";
import { EmployeeAvatar } from "@/components/employees/EmployeeAvatar";
import { EmployeeEditDialog } from "@/components/employees/EmployeeEditDialog";
import { EmployeeRowActions } from "@/components/employees/EmployeeRowActions";
import { EmployeeYearlyCompCell } from "@/components/employees/EmployeeYearlyCompCell";
import { EmployeeStartDateCell } from "@/components/employees/EmployeeStartDateCell";
import { EmployeeCompTrendCell } from "@/components/employees/EmployeeCompTrendCell";
import {
  PersonnelTypeSelect,
} from "@/components/employees/PersonnelTypeSelect";
import { getEmployeePersonnelType } from "@/lib/employees/personnelType";
import {
  getEmployeeEndDate,
  getEmployeeProfile,
  getEmployeeStartDate,
} from "@/lib/employees/profile";
import { EmployeesStructurePanel } from "@/components/employees/EmployeesStructurePanel";
import type { Employee, PersonnelType } from "@/types";
import type { EmployeesPageView } from "@/lib/employees/roster";
import { cn } from "@/lib/utils/cn";

type EmployeesPageTab = "roster" | "structure";

export default function EmployeesPage() {
  return (
    <Suspense fallback={null}>
      <EmployeesPageContent />
    </Suspense>
  );
}

function EmployeesPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { cloudSyncEnabled } = useAuth();
  const [pageTab, setPageTab] = useState<EmployeesPageTab>("roster");

  useEffect(() => {
    if (searchParams.get("tab") === "structure") setPageTab("structure");
  }, [searchParams]);

  const selectPageTab = (tab: EmployeesPageTab) => {
    setPageTab(tab);
    const url = tab === "structure" ? "/employees?tab=structure" : "/employees";
    router.replace(url, { scroll: false });
  };

  const {
    hasData,
    snapshot,
    allocations,
    settings,
    setEmployeePlanningScope,
    setEmployeePersonnelType,
    setEmployeePhotoUrl,
    importOcrPeoplePhotos,
    setEmployeeStartDate,
    setEmployeeEndDate,
    uploadEmployeeOfferLetter,
    viewEmployeeOfferLetter,
    removeEmployeeOfferLetter,
    setEmployeeHidden,
    setEmployeeAlumni,
    deleteEmployee,
  } = useApp();

  const [view, setView] = useState<EmployeesPageView>("active");
  const [query, setQuery] = useState("");
  const [showHidden, setShowHidden] = useState(false);
  const [editingEmployeeId, setEditingEmployeeId] = useState<string | null>(null);
  const [ocrSyncBusy, setOcrSyncBusy] = useState(false);
  const [ocrSyncMessage, setOcrSyncMessage] = useState<string | null>(null);
  const [labPhotoUrl, setLabPhotoUrl] = useState("https://ocr.ucsf.edu/people");
  const [showLabPhotoPrompt, setShowLabPhotoPrompt] = useState(false);

  const editingEmployee = useMemo(() => {
    if (!editingEmployeeId || !snapshot) return null;
    return snapshot.employees.find((e) => e.id === editingEmployeeId) ?? null;
  }, [editingEmployeeId, snapshot]);

  const visibleEmployees = useMemo(() => {
    if (!snapshot) return [];
    const list = filterEmployeesForEmployeesPage(snapshot.employees, settings, view, showHidden);
    // The same free-text filter Account Balances has.
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        (e.role ?? "").toLowerCase().includes(q) ||
        (e.employeeId ?? "").toLowerCase().includes(q)
    );
  }, [snapshot, settings, view, showHidden, query]);

  const hiddenCount = countHiddenEmployees(settings);
  const alumniCount = countAlumniEmployees(settings);

  const activeCount = snapshot
    ? snapshot.employees.filter((e) => !isEmployeeAlumni(settings, e.id)).length
    : 0;

  return (
    <>
      <Header
        ledgerTitle
        title="Employees"
        subtitle={
          pageTab === "structure"
            ? "Org chart layout — drag the director to the top, teams into columns below"
            : "Coverage and cost by person · imported from payroll funding report"
        }
      />
      <main
        className={cn(
          "flex-1 overflow-auto p-6",
          pageTab === "structure" && "bg-surface"
        )}
      >
        {/* One toolbar row instead of two stacked toggle rows — the review's
            "heavy header" note. Roster/Structure and the roster's own controls
            share the line; the import button sits at the far end. */}
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-rule bg-surface p-0.5 text-sm shadow-sm">
            <button
              type="button"
              className={cn(
                "rounded-md px-3 py-1.5 font-medium",
                pageTab === "roster" ? "bg-brand-ground text-white" : "text-ink-2 hover:bg-inset"
              )}
              onClick={() => selectPageTab("roster")}
            >
              Roster
            </button>
            <button
              type="button"
              className={cn(
                "rounded-md px-3 py-1.5 font-medium",
                pageTab === "structure" ? "bg-brand-ground text-white" : "text-ink-2 hover:bg-inset"
              )}
              onClick={() => selectPageTab("structure")}
            >
              Structure
            </button>
          </div>
          {pageTab === "roster" && hasData && snapshot && (
            <>
              <div className="inline-flex rounded-lg border border-rule bg-surface p-0.5 text-sm shadow-sm">
                <button
                  type="button"
                  className={cn(
                    "rounded-md px-3 py-1.5 font-medium",
                    view === "active" ? "bg-brand-ground text-white" : "text-ink-2 hover:bg-inset"
                  )}
                  onClick={() => setView("active")}
                >
                  Active ({activeCount})
                </button>
                <button
                  type="button"
                  className={cn(
                    "rounded-md px-3 py-1.5 font-medium",
                    view === "alumni" ? "bg-brand-ground text-white" : "text-ink-2 hover:bg-inset"
                  )}
                  onClick={() => setView("alumni")}
                >
                  Alumni ({alumniCount})
                </button>
              </div>
              {view === "active" && hiddenCount > 0 && (
                <label className="flex cursor-pointer items-center gap-1.5 text-xs text-ink-2">
                  <input
                    type="checkbox"
                    checked={showHidden}
                    onChange={(e) => setShowHidden(e.target.checked)}
                    className="rounded border-control"
                  />
                  Show {hiddenCount} hidden employee{hiddenCount === 1 ? "" : "s"}
                </label>
              )}
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Filter by name, role, or ID…"
                className="w-full max-w-xs rounded-lg border border-rule bg-surface px-3 py-1.5 text-sm text-ink shadow-sm placeholder:text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
              <button
                type="button"
                disabled={ocrSyncBusy}
                className="rounded-lg border border-rule bg-surface px-3 py-1.5 text-sm font-medium text-ink-2 shadow-sm hover:bg-inset disabled:opacity-50"
                title="Pull headshots from your lab People page"
                onClick={() => setShowLabPhotoPrompt(true)}
              >
                {ocrSyncBusy ? "Importing…" : "Import photos from your lab website"}
              </button>
              {showLabPhotoPrompt && (
                <div className="flex w-full flex-wrap items-center gap-2 rounded-lg border border-rule bg-inset px-3 py-2">
                  <label className="text-xs font-medium text-ink-2">
                    Page URL
                    <input
                      type="url"
                      className="ml-2 w-[min(100%,22rem)] rounded border border-control bg-surface px-2 py-1 text-sm"
                      value={labPhotoUrl}
                      onChange={(e) => setLabPhotoUrl(e.target.value)}
                      placeholder="https://yoursite.edu/people"
                    />
                  </label>
                  <button
                    type="button"
                    disabled={ocrSyncBusy || !labPhotoUrl.trim()}
                    className="rounded-lg bg-accent px-3 py-1.5 text-sm font-medium text-on-accent hover:bg-accent-hover disabled:opacity-50"
                    onClick={() => {
                      void (async () => {
                        setOcrSyncBusy(true);
                        setOcrSyncMessage(null);
                        try {
                          const result = await importOcrPeoplePhotos(labPhotoUrl.trim());
                          const extra =
                            result.unmatchedOcrNames.length > 0
                              ? ` Not matched: ${result.unmatchedOcrNames.slice(0, 8).join(", ")}${
                                  result.unmatchedOcrNames.length > 8 ? "…" : ""
                                }.`
                              : "";
                          setOcrSyncMessage(
                            `Imported ${result.matched} photo${result.matched === 1 ? "" : "s"}.${extra}`
                          );
                          setShowLabPhotoPrompt(false);
                        } catch (err) {
                          setOcrSyncMessage(
                            err instanceof Error ? err.message : "Photo import failed."
                          );
                        } finally {
                          setOcrSyncBusy(false);
                        }
                      })();
                    }}
                  >
                    Import
                  </button>
                  <button
                    type="button"
                    className="rounded-lg border px-3 py-1.5 text-sm text-ink-2 hover:bg-surface"
                    onClick={() => setShowLabPhotoPrompt(false)}
                  >
                    Cancel
                  </button>
                </div>
              )}
              {ocrSyncMessage && (
                <span className="text-xs text-ink-2">{ocrSyncMessage}</span>
              )}
            </>
          )}
        </div>

        {pageTab === "structure" ? (
          <EmployeesStructurePanel />
        ) : !hasData || !snapshot ? (
          <EmptyState />
        ) : (
          <div className="overflow-x-auto rounded-xl border bg-surface shadow-sm">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-brand-ground text-xs text-white">
                  <tr>
                    {/* Pinned like Runway's months column: identity must stay
                        on screen while the rest of the row scrolls at 1440. */}
                    <th className="sticky left-0 z-10 bg-brand-ground px-3 py-2">Employee</th>
                    <th className="min-w-[9.5rem] px-3 py-2">Team</th>
                    <th className="min-w-[8rem] px-3 py-2">Start date</th>
                    {view === "alumni" && <th className="min-w-[7rem] px-3 py-2">End date</th>}
                    <th className="px-3 py-2">Your scope %</th>
                    <th className="px-3 py-2">Current coverage</th>
                    <th className="px-3 py-2">First gap</th>
                    <th className="px-3 py-2">Monthly payroll burn</th>
                    <th className="min-w-[7rem] px-3 py-2">Yearly comp</th>
                    <th className="min-w-[8rem] px-3 py-2">Comp over time</th>
                    <th className="w-10 px-2 py-2" aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {visibleEmployees.length === 0 ? (
                    <tr>
                      <td
                        colSpan={view === "alumni" ? 11 : 10}
                        className="px-3 py-8 text-center text-muted"
                      >
                        {view === "alumni"
                          ? "No alumni yet. Use the row menu on an active employee to move someone here."
                          : showHidden
                            ? "No employees match this view."
                            : "No active employees. Show hidden or check the Alumni tab."}
                      </td>
                    </tr>
                  ) : (
                    visibleEmployees.map((emp) => (
                      <EmployeeTableRow
                        key={emp.id}
                        emp={emp}
                        snapshot={snapshot}
                        allocations={allocations}
                        settings={settings}
                        isAlumniView={view === "alumni"}
                        isHidden={isEmployeeHidden(settings, emp.id)}
                        photoUrl={getEmployeePhotoUrlFor(settings, emp)}
                        onEdit={() => {
                          requestAnimationFrame(() => setEditingEmployeeId(emp.id));
                        }}
                        onHide={() => setEmployeeHidden(emp.id, true)}
                        onUnhide={() => setEmployeeHidden(emp.id, false)}
                        onAlumni={() => setEmployeeAlumni(emp.id, true)}
                        onRestore={() => setEmployeeAlumni(emp.id, false)}
                        onDelete={() => {
                          if (
                            window.confirm(
                              `Delete ${emp.name} from this workspace? Payroll allocations and costs for this person will be removed. This cannot be undone.`
                            )
                          ) {
                            deleteEmployee(emp.id);
                          }
                        }}
                        onScopeChange={(v) => setEmployeePlanningScope(emp.id, v)}
                        onStartDateChange={(d) => setEmployeeStartDate(emp.id, d)}
                        onEndDateChange={(d) => setEmployeeEndDate(emp.id, d)}
                        onUploadOfferLetter={(file) => uploadEmployeeOfferLetter(emp.id, file)}
                        onViewOfferLetter={() => viewEmployeeOfferLetter(emp.id)}
                        onRemoveOfferLetter={() => removeEmployeeOfferLetter(emp.id)}
                        onPersonnelTypeChange={(t) => setEmployeePersonnelType(emp.id, t)}
                      />
                    ))
                  )}
                </tbody>
              </table>
              <p className="border-t px-3 py-2 text-xs text-muted">
                Planning estimates only. Confirm with your finance/post-award analyst. Hidden employees
                are excluded from timeline and runway; alumni are kept for reference only.
              </p>
          </div>
        )}
      </main>

      {editingEmployee && (
        <EmployeeEditDialog
          employee={editingEmployee}
          photoUrl={getEmployeePhotoUrlFor(settings, editingEmployee)}
          open
          onClose={() => setEditingEmployeeId(null)}
          onSave={(url) => setEmployeePhotoUrl(editingEmployee.id, url)}
          onUploadFile={
            cloudSyncEnabled
              ? async (file) => {
                  const uploaded = await uploadEmployeePhotoFile(editingEmployee, file);
                  setEmployeePhotoUrl(editingEmployee.id, uploaded.storageRef);
                }
              : undefined
          }
        />
      )}
    </>
  );
}

function EmployeeTableRow({
  emp,
  snapshot,
  allocations,
  settings,
  isAlumniView,
  isHidden,
  photoUrl,
  onEdit,
  onHide,
  onUnhide,
  onAlumni,
  onRestore,
  onDelete,
  onScopeChange,
  onStartDateChange,
  onEndDateChange,
  onUploadOfferLetter,
  onViewOfferLetter,
  onRemoveOfferLetter,
  onPersonnelTypeChange,
}: {
  emp: Employee;
  snapshot: NonNullable<ReturnType<typeof useApp>["snapshot"]>;
  allocations: ReturnType<typeof useApp>["allocations"];
  settings: ReturnType<typeof useApp>["settings"];
  isAlumniView: boolean;
  isHidden: boolean;
  photoUrl?: string;
  onEdit: () => void;
  onHide: () => void;
  onUnhide: () => void;
  onAlumni: () => void;
  onRestore: () => void;
  onDelete: () => void;
  onScopeChange: (v: number | null) => void;
  onStartDateChange: (iso: string | null) => void;
  onEndDateChange: (iso: string | null) => void;
  onUploadOfferLetter: (file: File) => Promise<{ startDate?: string; endDate?: string }>;
  onViewOfferLetter: () => void;
  onRemoveOfferLetter: () => void;
  onPersonnelTypeChange: (type: PersonnelType | null) => void;
}) {
  const profile = getEmployeeProfile(settings, emp.id);
  const personnelType = getEmployeePersonnelType(settings, emp.id);
  const current = getCurrentMonth(snapshot);
  const opts = coverageOptionsFromSettings(emp, settings);
  const cov = calculateEmployeeCoverage(emp, current, allocations, opts);
  const scope = settings.employeePlanningScope?.[emp.id];
  const cost = calculateMonthlyCost(emp.id, current, snapshot.monthlyCosts);
  const months = getAllMonths(snapshot);
  // Forward-looking only: this column answers "when does coverage next fall
  // short", so a gap two years in the past — history, not a risk — must not
  // sit here in caution amber. yyyy-MM compares lexicographically.
  const gaps = months.find(
    (m) =>
      m >= current &&
      calculateEmployeeCoverage(emp, m, allocations, opts).status === "underallocated"
  );

  const actions = isAlumniView
    ? [
        { label: "Edit photo", onClick: onEdit },
        { label: "Restore to active", onClick: onRestore },
        { label: "Delete", onClick: onDelete, destructive: true },
      ]
    : [
        { label: "Edit photo", onClick: onEdit },
        ...(isHidden
          ? [{ label: "Unhide", onClick: onUnhide }]
          : [{ label: "Hide", onClick: onHide }]),
        { label: "Move to alumni", onClick: onAlumni },
        { label: "Delete", onClick: onDelete, destructive: true },
      ];

  return (
    <tr
      className={cn(
        "group border-t hover:bg-inset",
        isHidden && "bg-inset/80 opacity-75",
        isAlumniView && "bg-inset/50"
      )}
    >
      {/* Sticky cells need their own opaque fill, mirroring the row states. */}
      <td
        className={cn(
          "sticky left-0 z-[1] bg-surface px-3 py-2 group-hover:bg-inset",
          isHidden && "bg-inset",
          isAlumniView && "bg-inset"
        )}
      >
        <div className="flex items-center gap-2.5">
          <EmployeeAvatar name={emp.name} photoUrl={photoUrl} />
          <div className="min-w-0">
            <span className="font-medium">{emp.name}</span>
            {isHidden && (
              <span className="ml-1.5 text-[10px] font-normal text-muted">(hidden)</span>
            )}
            {isAlumniView && (
              <span className="ml-1.5 text-[10px] font-normal text-linked">Alumni</span>
            )}
          </div>
        </div>
      </td>
      <td className="px-3 py-2 align-top">
        <PersonnelTypeSelect
          value={personnelType}
          onChange={onPersonnelTypeChange}
        />
      </td>
      <td className="px-3 py-2 align-top">
        <EmployeeStartDateCell
          startDate={getEmployeeStartDate(settings, emp.id)}
          offerLetter={profile?.offerLetter}
          onStartDateChange={onStartDateChange}
          onUploadOfferLetter={onUploadOfferLetter}
          onViewOfferLetter={onViewOfferLetter}
          onRemoveOfferLetter={onRemoveOfferLetter}
        />
      </td>
      {isAlumniView && (
        <td className="px-3 py-2 align-top">
          <input
            type="date"
            value={getEmployeeEndDate(settings, emp.id) ?? ""}
            onChange={(e) => onEndDateChange(e.target.value || null)}
            className="w-full min-w-[7rem] rounded border border-rule px-1.5 py-0.5 text-xs text-ink"
            title="Employment end date"
          />
        </td>
      )}
      <td className="px-3 py-2">
        <input
          type="number"
          min={0}
          max={100}
          step={0.5}
          className="w-16 rounded border px-1 py-0.5 text-sm"
          placeholder="—"
          value={scope ?? ""}
          onChange={(e) => {
            const v = e.target.value;
            if (v === "") onScopeChange(null);
            else onScopeChange(parseFloat(v));
          }}
          title="Leave blank for full appointment; set e.g. 40 if you only manage part of this person"
        />
      </td>
      <td className="px-3 py-2">
        {cov.allocatedPercent.toFixed(0)}%
        <span className="text-muted"> / {getEffectiveExpectedPercent(emp, settings)}%</span>
      </td>
      {/* Amber only when there is a gap — an em-dash is not a caution state. */}
      <td className={cn("px-3 py-2", gaps ? "text-caution" : "text-muted")}>
        {gaps ? formatMonthDisplay(gaps) : "—"}
      </td>
      <td className="px-3 py-2">{formatCurrency(cost.total)}</td>
      <td className="px-3 py-2">
        <EmployeeYearlyCompCell employee={emp} snapshot={snapshot} />
      </td>
      <td className="px-3 py-2">
        <EmployeeCompTrendCell employee={emp} snapshot={snapshot} settings={settings} />
      </td>
      <td className="px-2 py-2">
        <EmployeeRowActions actions={actions} />
      </td>
    </tr>
  );
}
