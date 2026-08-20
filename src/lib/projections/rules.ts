import type { AppSettings, ProjectionRule, RemainderAction } from "@/types";
import { formatMonthLabel } from "@/lib/projections/horizon";

export function rulesForPair(
  settings: AppSettings,
  personKey: string,
  chartstringKey: string
): ProjectionRule[] {
  return (settings.projectionRules ?? []).filter(
    (r) => r.personKey === personKey && r.chartstringKey === chartstringKey
  );
}

export function employmentRuleForPerson(
  settings: AppSettings,
  personKey: string
): ProjectionRule | undefined {
  return (settings.projectionRules ?? []).find(
    (r) => r.personKey === personKey && !r.chartstringKey
  );
}

export function remainderLabel(remainder: RemainderAction, aliasFor: (key: string) => string): string {
  if (remainder.kind === "uncovered") return "then uncovered";
  if (remainder.kind === "endEmployment") return "then end employment";
  return `then → ${aliasFor(remainder.chartstringKey)}`;
}

export function ruleChipLabel(rule: ProjectionRule, aliasFor: (key: string) => string): string {
  const rest = remainderLabel(rule.remainder, aliasFor);
  if (rule.trigger.type === "onDate") {
    return `off ${formatMonthLabel(rule.trigger.month)} · ${rest}`;
  }
  if (rule.trigger.type === "dollarCap") {
    const amt = new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    }).format(rule.trigger.amount);
    return `cap ${amt} · ${rest}`;
  }
  if (rule.trigger.type === "fundsDepleted") return `until depleted · ${rest}`;
  return `set ${rule.trigger.percentEffort.toFixed(0)}% from ${formatMonthLabel(rule.trigger.fromMonth)}`;
}

export function upsertRule(rules: ProjectionRule[], next: ProjectionRule): ProjectionRule[] {
  const without = rules.filter((r) => r.id !== next.id);
  if (next.chartstringKey) {
    return [
      ...without.filter(
        (r) => !(r.personKey === next.personKey && r.chartstringKey === next.chartstringKey)
      ),
      next,
    ];
  }
  return [...without.filter((r) => !(r.personKey === next.personKey && !r.chartstringKey)), next];
}
