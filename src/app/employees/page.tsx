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
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { uploadEmployeePhotoFile } from "@/lib/supabase/sync";
import { formatCurrency, formatMonthDisplay } from "@/lib/utils/parse";
import { EmployeeAvatar } from "@/components/employees/EmployeeAvatar";
import { EmployeeEditDialog } from "@/components/employees/EmployeeEditDialog";
import { EmployeeRowActions } from "@/components/employees/EmployeeRowActions";
import { EmployeeYearlyCompCell } from "@/components/employees/EmployeeYearlyCompCell";
import { EmployeeStartDateCell } from "@/components/employees/EmployeeStartDateCell";
import { EmployeeCompTrendCell } from "@/components/employees/EmployeeCompTrendCell";
import {
  PersonnelTypeLegend,
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
  const [showHidden, setShowHidden] = useState(false);
  const [editingEmployeeId, setEditingEmployeeId] = useState<string | null>(null);
  const [ocrSyncBusy, setOcrSyncBusy] = useState(false);
  const [ocrSyncMessage, setOcrSyncMessage] = useState<string | null>(null);

  const editingEmployee = useMemo(() => {
    if (!editingEmployeeId || !snapshot) return null;
    return snapshot.employees.find((e) => e.id === editingEmployeeId) ?? null;
  }, [editingEmployeeId, snapshot]);

  const visibleEmployees = useMemo(() => {
    if (!snapshot) return [];
    return filterEmployeesForEmployeesPage(snapshot.employees, settings, view, showHidden);
  }, [snapshot, settings, view, showHidden]);

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
          pageTab === "structure" && "bg-white"
        )}
      >
        <div className="mb-4 inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-sm shadow-sm">
          <button
            type="button"
            className={cn(
              "rounded-md px-3 py-1.5 font-medium",
              pageTab === "roster" ? "bg-[#0c2340] text-white" : "text-slate-600 hover:bg-slate-50"
            )}
            onClick={() => selectPageTab("roster")}
          >
            Roster
          </button>
          <button
            type="button"
            className={cn(
              "rounded-md px-3 py-1.5 font-medium",
              pageTab === "structure" ? "bg-[#0c2340] text-white" : "text-slate-600 hover:bg-slate-50"
            )}
            onClick={() => selectPageTab("structure")}
          >
            Structure
          </button>
        </div>

        {pageTab === "structure" ? (
          <EmployeesStructurePanel />
        ) : !hasData || !snapshot ? (
          <EmptyState />
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-sm shadow-sm">
                <button
                  type="button"
                  className={cn(
                    "rounded-md px-3 py-1.5 font-medium",
                    view === "active" ? "bg-[#0c2340] text-white" : "text-slate-600 hover:bg-slate-50"
                  )}
                  onClick={() => setView("active")}
                >
                  Active ({activeCount})
                </button>
                <button
                  type="button"
                  className={cn(
                    "rounded-md px-3 py-1.5 font-medium",
                    view === "alumni" ? "bg-[#0c2340] text-white" : "text-slate-600 hover:bg-slate-50"
                  )}
                  onClick={() => setView("alumni")}
                >
                  Alumni ({alumniCount})
                </button>
              </div>
              {view === "active" && hiddenCount > 0 && (
                <label className="flex cursor-pointer items-center gap-1.5 text-xs text-slate-600">
                  <input
                    type="checkbox"
                    checked={showHidden}
                    onChange={(e) => setShowHidden(e.target.checked)}
                    className="rounded border-slate-300"
                  />
                  Show hidden ({hiddenCount})
                </label>
              )}
              <button
                type="button"
                disabled={ocrSyncBusy}
                className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
                title="Pull headshots from ocr.ucsf.edu and save to Supabase"
                onClick={() => {
                  void (async () => {
                    setOcrSyncBusy(true);
                    setOcrSyncMessage(null);
                    try {
                      const result = await importOcrPeoplePhotos();
                      const extra =
                        result.unmatchedOcrNames.length > 0
                          ? ` Not in payroll: ${result.unmatchedOcrNames.join(", ")}.`
                          : "";
                      setOcrSyncMessage(
                        `Imported ${result.matched} OCR photo${result.matched === 1 ? "" : "s"}.${extra}`
                      );
                    } catch (err) {
                      setOcrSyncMessage(
                        err instanceof Error ? err.message : "OCR photo import failed."
                      );
                    } finally {
                      setOcrSyncBusy(false);
                    }
                  })();
                }}
              >
                {ocrSyncBusy ? "Importing…" : "Import photos from OCR site"}
              </button>
              {ocrSyncMessage && (
                <span className="text-xs text-slate-600">{ocrSyncMessage}</span>
              )}
            </div>

            <PersonnelTypeLegend />

            <div className="overflow-x-auto rounded-xl border bg-white shadow-sm">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-[#0c2340] text-xs text-white">
                  <tr>
                    <th className="px-3 py-2">Employee</th>
                    <th className="min-w-[10.5rem] px-3 py-2">Personnel type</th>
                    <th className="min-w-[9rem] px-3 py-2">Start date</th>
                    {view === "alumni" && <th className="min-w-[7rem] px-3 py-2">End date</th>}
                    <th className="px-3 py-2">Your scope %</th>
                    <th className="px-3 py-2">Current coverage</th>
                    <th className="px-3 py-2">First gap</th>
                    <th className="px-3 py-2">Monthly S+B</th>
                    <th className="min-w-[7.5rem] px-3 py-2">Yearly comp</th>
                    <th className="min-w-[8.5rem] px-3 py-2">Comp over time</th>
                    <th className="w-10 px-2 py-2" aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {visibleEmployees.length === 0 ? (
                    <tr>
                      <td
                        colSpan={view === "alumni" ? 11 : 10}
                        className="px-3 py-8 text-center text-slate-500"
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
              <p className="border-t px-3 py-2 text-xs text-slate-500">
                Planning estimates only. Confirm with your finance/post-award analyst. Hidden employees
                are excluded from timeline and runway; alumni are kept for reference only.
              </p>
            </div>
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
            isSupabaseConfigured()
              ? async (file) => {
                  const url = await uploadEmployeePhotoFile(editingEmployee, file);
                  setEmployeePhotoUrl(editingEmployee.id, url);
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
  const gaps = months.find(
    (m) => calculateEmployeeCoverage(emp, m, allocations, opts).status === "underallocated"
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
        "border-t hover:bg-slate-50",
        isHidden && "bg-slate-50/80 opacity-75",
        isAlumniView && "bg-slate-50/50"
      )}
    >
      <td className="px-3 py-2">
        <div className="flex items-center gap-2.5">
          <EmployeeAvatar name={emp.name} photoUrl={photoUrl} />
          <div className="min-w-0">
            <span className="font-medium">{emp.name}</span>
            {isHidden && (
              <span className="ml-1.5 text-[10px] font-normal text-slate-400">(hidden)</span>
            )}
            {isAlumniView && (
              <span className="ml-1.5 text-[10px] font-normal text-violet-600">Alumni</span>
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
            className="w-full min-w-[7rem] rounded border border-slate-200 px-1.5 py-0.5 text-xs text-slate-800"
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
        <span className="text-slate-400"> / {getEffectiveExpectedPercent(emp, settings)}%</span>
      </td>
      <td className="px-3 py-2 text-amber-700">{gaps ? formatMonthDisplay(gaps) : "—"}</td>
      <td className="px-3 py-2">{formatCurrency(cost.total)}</td>
      <td className="px-3 py-2">
        <EmployeeYearlyCompCell employee={emp} snapshot={snapshot} />
      </td>
      <td className="px-3 py-2">
        <EmployeeCompTrendCell employee={emp} snapshot={snapshot} />
      </td>
      <td className="px-2 py-2">
        <EmployeeRowActions actions={actions} />
      </td>
    </tr>
  );
}
