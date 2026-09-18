"use client";

import { useState } from "react";
import Link from "next/link";
import { projectionSourceLabel } from "@/lib/projections/sources";
import { isPlannedPersonKey, personKeyForEmployee } from "@/lib/reconciliation/plans";
import { generateId } from "@/lib/utils/parse";
import type {
  AppSettings,
  Employee,
  FundingSource,
  PlannedFundingSource,
  ProjectionRule,
} from "@/types";

function chartstringKey(fs: FundingSource) {
  return (fs.accountString ?? fs.rawName).trim().toLowerCase();
}

/**
 * The sentence-shaped rule builder — "Put [person] on [account] at [n]%" —
 * the one form in the product that reads the way the PI thinks about the
 * change. Named as a component (not a page-local helper) so the pattern has
 * a home if other surfaces grow a sentence-shaped form.
 */
export function AddToPersonBar({
  employees,
  sources,
  settings,
  accountTitlesByChartstring,
  onAddPlanned,
  onSaveRule,
  originMonth,
  plannedEntities = [],
}: {
  employees: Employee[];
  sources: FundingSource[];
  /** Unlinked planned hires — a rule can be put on a plan the same way. */
  plannedEntities?: Employee[];
  settings: AppSettings;
  accountTitlesByChartstring: Map<string, string>;
  onAddPlanned: (planned: PlannedFundingSource) => void;
  onSaveRule: (rule: ProjectionRule) => void;
  originMonth: string;
}) {
  const people = [...employees, ...plannedEntities];
  const [employeeId, setEmployeeId] = useState(people[0]?.id ?? "");
  const [sourceId, setSourceId] = useState(sources[0]?.id ?? "");
  const [pct, setPct] = useState("100");
  const [newAlias, setNewAlias] = useState("");

  return (
    <div className="flex flex-wrap items-end gap-2 text-sm">
      <label className="text-xs text-ink-2">
        Put
        <select
          className="ml-1 rounded border px-2 py-1 text-sm"
          value={employeeId}
          onChange={(e) => setEmployeeId(e.target.value)}
        >
          {people.map((e) => (
            <option key={e.id} value={e.id}>
              {isPlannedPersonKey(e.id) ? `${e.name} · planned` : e.name}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs text-ink-2">
        on
        <select
          className="ml-1 rounded border px-2 py-1 text-sm"
          value={sourceId}
          onChange={(e) => setSourceId(e.target.value)}
        >
          {sources.map((s) => (
            <option key={s.id} value={s.id}>
              {projectionSourceLabel(s, settings, accountTitlesByChartstring)}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs text-ink-2">
        at
        <input
          className="ml-1 w-16 rounded border px-2 py-1"
          value={pct}
          onChange={(e) => setPct(e.target.value)}
        />
        %
      </label>
      <button
        type="button"
        className="rounded bg-accent px-3 py-1.5 text-xs font-medium text-on-accent"
        onClick={() => {
          const emp = people.find((e) => e.id === employeeId);
          const fs = sources.find((s) => s.id === sourceId);
          if (!emp || !fs) return;
          onSaveRule({
            id: generateId(),
            personKey: personKeyForEmployee(emp),
            chartstringKey: chartstringKey(fs),
            trigger: {
              type: "setEffort",
              fromMonth: originMonth,
              percentEffort: Number(pct) || 0,
            },
            remainder: { kind: "uncovered" },
            applyOverPayroll: true,
          });
        }}
      >
        Set from origin
      </button>
      <span className="text-muted">|</span>
      <input
        className="rounded border px-2 py-1 text-xs"
        placeholder="New chartstring alias"
        value={newAlias}
        onChange={(e) => setNewAlias(e.target.value)}
      />
      <button
        type="button"
        className="rounded border px-3 py-1.5 text-xs font-medium"
        onClick={() => {
          if (!newAlias.trim()) return;
          const id = generateId();
          const planned: PlannedFundingSource = {
            id,
            chartstringKey: `planned:${id}`,
            alias: newAlias.trim(),
            color: "#dce4fc",
          };
          onAddPlanned(planned);
          setSourceId(id);
          setNewAlias("");
        }}
      >
        Add chartstring
      </button>
      <span className="text-muted">|</span>
      <Link
        href="/employees?view=planned&add=1"
        className="rounded border px-3 py-1.5 text-xs font-medium text-ink-2 hover:bg-inset"
        title="Plan a hire before payroll knows them — opens Employees → Planned with the form ready"
      >
        Add planned hire…
      </Link>
    </div>
  );
}
