import { BookOpen, Layers, Pencil, Shield } from "lucide-react";

const RULES = [
  {
    icon: BookOpen,
    text: "Payroll report is the source of truth for personnel distributions.",
  },
  {
    icon: Layers,
    text: "Net Position Reports are the ground truth for payroll accounts — every balance Runway spends against, tracked over time.",
  },
  {
    icon: Layers,
    text: "Employee and Position Salary Report supplies official FY rates on the roster. Payroll remains the source of truth for monthly charges.",
  },
  {
    icon: Pencil,
    text: "Planning edits and scenarios are stored separately from imported data.",
  },
  {
    icon: Shield,
    text: "This is a planning tool, not the official system of record.",
  },
];

export function DataRulesCard() {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <h3 className="text-sm font-semibold text-[#0c2340]">Data Rules</h3>
      <ul className="mt-3 space-y-3">
        {RULES.map(({ icon: Icon, text }) => (
          <li key={text} className="flex gap-2.5 text-sm text-slate-600">
            <Icon className="mt-0.5 h-4 w-4 shrink-0 text-teal-700" />
            <span>{text}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
