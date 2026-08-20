"use client";

import { useMemo, useState } from "react";
import type {
  AppSettings,
  Employee,
  FundingSource,
  PlannedFundingSource,
  ProjectionRule,
  ProjectionTrigger,
  RemainderAction,
} from "@/types";
import { generateId } from "@/lib/utils/parse";
import { employeePersonKey } from "@/lib/employees/stableKey";
import { chartstringKeyForFundingSource, makePlannedChartstringKey, nextPlannedColor, projectionSourceLabel } from "@/lib/projections/sources";
import { rulesForPair } from "@/lib/projections/rules";
import { formatMonthLabel } from "@/lib/projections/horizon";
import type { ProjectionResult } from "@/lib/projections/simulate";
import { formatCurrency } from "@/lib/utils/parse";

export function RuleEditor({
  employee,
  source,
  settings,
  originMonth,
  result,
  portfolioTitlesByChartstring,
  onSave,
  onRemove,
  onAddPlanned,
  onClose,
}: {
  employee: Employee;
  source: FundingSource;
  settings: AppSettings;
  originMonth: string;
  result: ProjectionResult;
  portfolioTitlesByChartstring?: Map<string, string>;
  onSave: (rule: ProjectionRule) => void;
  onRemove: (ruleId: string) => void;
  onAddPlanned: (planned: PlannedFundingSource) => void;
  onClose: () => void;
}) {
  const personKey = employeePersonKey(employee);
  const chartstringKey = chartstringKeyForFundingSource(source);
  const existing = rulesForPair(settings, personKey, chartstringKey)[0];

  const [mode, setMode] = useState<
    "continue" | "onDate" | "dollarCap" | "fundsDepleted" | "setEffort"
  >(existing ? existing.trigger.type : "continue");
  const [dateMonth, setDateMonth] = useState(
    existing?.trigger.type === "onDate" ? existing.trigger.month : originMonth
  );
  const [capAmount, setCapAmount] = useState(
    existing?.trigger.type === "dollarCap" ? String(existing.trigger.amount) : ""
  );
  const [setPct, setSetPct] = useState(
    existing?.trigger.type === "setEffort" ? String(existing.trigger.percentEffort) : "0"
  );
  const [setFrom, setSetFrom] = useState(
    existing?.trigger.type === "setEffort" ? existing.trigger.fromMonth : originMonth
  );
  const [remainderKind, setRemainderKind] = useState<RemainderAction["kind"]>(
    existing?.remainder.kind ?? "uncovered"
  );
  const [moveTo, setMoveTo] = useState(
    existing?.remainder.kind === "moveTo" ? existing.remainder.chartstringKey : ""
  );
  const [applyOverPayroll, setApplyOverPayroll] = useState(Boolean(existing?.applyOverPayroll));
  const [showAdd, setShowAdd] = useState(false);
  const [newAlias, setNewAlias] = useState("");
  const [newChart, setNewChart] = useState("");
  const [newBalance, setNewBalance] = useState("");
  const [newEnd, setNewEnd] = useState("");

  const destinations = useMemo(() => {
    return result.sources.filter((s) => chartstringKeyForFundingSource(s) !== chartstringKey);
  }, [result.sources, chartstringKey]);

  const shared = useMemo(() => {
    const origin = result.states[0];
    if (!origin) return 0;
    return origin.allocations.filter((a) => a.chartstringKey === chartstringKey).length;
  }, [result.states, chartstringKey]);

  const depletedMonth = useMemo(() => {
    for (const state of result.states) {
      const root = Object.keys(state.remainingByRoot).find((r) =>
        chartstringKey.startsWith(r)
      );
      const left = root ? state.remainingByRoot[root] : undefined;
      if (left !== undefined && left <= 0.5) return state.month;
    }
    return null;
  }, [result.states, chartstringKey]);

  function buildRemainder(): RemainderAction {
    if (remainderKind === "moveTo") {
      return { kind: "moveTo", chartstringKey: moveTo };
    }
    if (remainderKind === "endEmployment") return { kind: "endEmployment" };
    return { kind: "uncovered" };
  }

  function save() {
    if (mode === "continue") {
      if (existing) onRemove(existing.id);
      onClose();
      return;
    }
    let trigger: ProjectionTrigger;
    if (mode === "onDate") trigger = { type: "onDate", month: dateMonth };
    else if (mode === "dollarCap") {
      trigger = {
        type: "dollarCap",
        amount: Number(capAmount) || 0,
        fromMonth: existing?.trigger.type === "dollarCap" ? existing.trigger.fromMonth : originMonth,
      };
    } else if (mode === "fundsDepleted") trigger = { type: "fundsDepleted" };
    else {
      trigger = { type: "setEffort", fromMonth: setFrom, percentEffort: Number(setPct) || 0 };
    }
    onSave({
      id: existing?.id ?? generateId(),
      personKey,
      chartstringKey,
      trigger,
      remainder: buildRemainder(),
      applyOverPayroll,
    });
    onClose();
  }

  function addPlanned() {
    const id = generateId();
    const planned: PlannedFundingSource = {
      id,
      chartstringKey: makePlannedChartstringKey(id, newChart),
      accountString: newChart.trim() || undefined,
      alias: newAlias.trim() || "New account",
      color: nextPlannedColor(settings.plannedFundingSources ?? []),
      openingBalance: newBalance ? Number(newBalance) : undefined,
      projectEndMonth: newEnd || undefined,
    };
    onAddPlanned(planned);
    setMoveTo(planned.chartstringKey);
    setRemainderKind("moveTo");
    setShowAdd(false);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-end bg-black/30 sm:items-center sm:justify-center">
      <div className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-t-xl bg-white p-5 shadow-xl sm:rounded-xl">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-[#0c2340]">Distribution rule</h2>
            <p className="mt-1 text-sm text-slate-600">
              {employee.name} · {projectionSourceLabel(source, settings, portfolioTitlesByChartstring)}
            </p>
          </div>
          <button type="button" className="text-sm text-slate-500 hover:text-slate-800" onClick={onClose}>
            Close
          </button>
        </div>

        <fieldset className="mt-4 space-y-2 text-sm">
          {(
            [
              ["continue", "Continue (carry forward)"],
              ["onDate", "End on a date"],
              ["dollarCap", "End after a dollar amount"],
              ["fundsDepleted", "End when this account is depleted"],
              ["setEffort", "Set effort from a month"],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className="flex items-center gap-2">
              <input
                type="radio"
                name="mode"
                checked={mode === value}
                onChange={() => setMode(value)}
              />
              {label}
            </label>
          ))}
        </fieldset>

        {mode === "onDate" && (
          <label className="mt-3 block text-sm">
            Last month on this chartstring
            <input
              type="month"
              className="mt-1 w-full rounded border px-2 py-1.5"
              value={dateMonth}
              onChange={(e) => setDateMonth(e.target.value)}
            />
          </label>
        )}
        {mode === "dollarCap" && (
          <label className="mt-3 block text-sm">
            Envelope amount (from {formatMonthLabel(originMonth)} plus any payroll actuals already counted)
            <input
              type="number"
              min={0}
              className="mt-1 w-full rounded border px-2 py-1.5"
              value={capAmount}
              onChange={(e) => setCapAmount(e.target.value)}
            />
          </label>
        )}
        {mode === "fundsDepleted" && (
          <p className="mt-3 text-xs text-slate-600">
            Uses MyPortfolio remaining cash minus personnel in this report only.
            {shared > 1 ? ` ${shared} people currently draw on this account.` : ""}
            {depletedMonth
              ? ` At current burn this pool hits $0 around ${formatMonthLabel(depletedMonth)}.`
              : " No depletion month in this horizon."}
          </p>
        )}
        {mode === "setEffort" && (
          <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <label>
              From month
              <input
                type="month"
                className="mt-1 w-full rounded border px-2 py-1.5"
                value={setFrom}
                onChange={(e) => setSetFrom(e.target.value)}
              />
            </label>
            <label>
              Percent effort
              <input
                type="number"
                min={0}
                max={100}
                className="mt-1 w-full rounded border px-2 py-1.5"
                value={setPct}
                onChange={(e) => setSetPct(e.target.value)}
              />
            </label>
          </div>
        )}

        {mode !== "continue" && mode !== "setEffort" && (
          <div className="mt-4 space-y-2 text-sm">
            <p className="font-medium text-slate-800">When they come off</p>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={remainderKind === "uncovered"}
                onChange={() => setRemainderKind("uncovered")}
              />
              Leave uncovered
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={remainderKind === "endEmployment"}
                onChange={() => setRemainderKind("endEmployment")}
              />
              End employment
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                checked={remainderKind === "moveTo"}
                onChange={() => setRemainderKind("moveTo")}
              />
              Move leftover to
              <select
                className="rounded border px-2 py-1"
                value={moveTo}
                disabled={remainderKind !== "moveTo"}
                onChange={(e) => setMoveTo(e.target.value)}
              >
                <option value="">Select account</option>
                {destinations.map((s) => (
                  <option key={s.id} value={chartstringKeyForFundingSource(s)}>
                    {projectionSourceLabel(s, settings, portfolioTitlesByChartstring)}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="text-xs font-medium text-teal-800 hover:underline"
              onClick={() => setShowAdd((v) => !v)}
            >
              {showAdd ? "Cancel new chartstring" : "Add a chartstring"}
            </button>
            {showAdd && (
              <div className="space-y-2 rounded border bg-slate-50 p-3">
                <input
                  className="w-full rounded border px-2 py-1.5"
                  placeholder="Alias (e.g. Startup)"
                  value={newAlias}
                  onChange={(e) => setNewAlias(e.target.value)}
                />
                <input
                  className="w-full rounded border px-2 py-1.5 font-mono text-xs"
                  placeholder="Chartstring (optional)"
                  value={newChart}
                  onChange={(e) => setNewChart(e.target.value)}
                />
                <input
                  className="w-full rounded border px-2 py-1.5"
                  placeholder="Opening balance (optional)"
                  value={newBalance}
                  onChange={(e) => setNewBalance(e.target.value)}
                />
                <label className="block text-xs text-slate-600">
                  Project end month (optional)
                  <input
                    type="month"
                    className="mt-1 w-full rounded border px-2 py-1.5"
                    value={newEnd}
                    onChange={(e) => setNewEnd(e.target.value)}
                  />
                </label>
                <button
                  type="button"
                  className="rounded bg-teal-700 px-3 py-1.5 text-xs font-medium text-white"
                  onClick={addPlanned}
                >
                  Add and use as destination
                </button>
              </div>
            )}
          </div>
        )}

        <label className="mt-4 flex items-start gap-2 text-xs text-slate-600">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={applyOverPayroll}
            onChange={(e) => setApplyOverPayroll(e.target.checked)}
          />
          Apply from origin even if imported payroll still shows a different mix
        </label>

        <div className="mt-5 flex justify-end gap-2">
          {existing && (
            <button
              type="button"
              className="rounded border px-3 py-1.5 text-sm text-red-700"
              onClick={() => {
                onRemove(existing.id);
                onClose();
              }}
            >
              Remove rule
            </button>
          )}
          <button type="button" className="rounded bg-teal-700 px-4 py-1.5 text-sm font-medium text-white" onClick={save}>
            Save
          </button>
        </div>
        <p className="mt-3 text-[11px] text-slate-500">
          Assumes current pay continues. Depletion is personnel in this report only
          {shared ? ` · origin burn ${formatCurrency(
            result.states[0]?.allocations
              .filter((a) => a.employeeId === employee.id && a.chartstringKey === chartstringKey)
              .reduce((s, a) => s + a.monthlyBurn, 0) ?? 0
          )}` : ""}.
        </p>
      </div>
    </div>
  );
}
