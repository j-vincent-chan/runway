import { AlertTriangle, CircleAlert, HelpCircle } from "lucide-react";
import type { AttentionSeverity } from "@/lib/dashboard/attention";

/** Shared severity styling so the hero spotlight and the row list stay visually one system. */
export const SEVERITY_ICON = {
  critical: CircleAlert,
  caution: AlertTriangle,
  data: HelpCircle,
} as const;

export const CHIP_CLASS: Record<AttentionSeverity, string> = {
  critical: "bg-critical-soft text-critical",
  caution: "bg-caution-soft text-caution",
  data: "bg-inset text-ink-2",
};

/** Spotlight background — a stronger tint of the same severity-soft token. */
export const SPOTLIGHT_BG_CLASS: Record<AttentionSeverity, string> = {
  critical: "bg-critical-soft",
  caution: "bg-caution-soft",
  data: "bg-inset",
};

/** The block's left edge takes the worst severity present. */
export function stripeClass(severity: AttentionSeverity | null): string {
  if (severity === "critical") return "bg-critical";
  if (severity === "caution") return "bg-caution";
  if (severity === "data") return "bg-rule-strong";
  return "bg-healthy";
}
