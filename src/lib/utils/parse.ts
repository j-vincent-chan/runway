import { parse, isValid, format } from "date-fns";
import type { PayFrequency } from "@/types";

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function parseCurrency(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return Number.isNaN(value) ? null : value;
  const str = String(value).trim();
  if (!str || str === "-" || str === "—") return null;
  let negative = str.startsWith("(") && str.endsWith(")");
  const cleaned = str.replace(/[(),]/g, "").replace(/\$/g, "").trim();
  if (!cleaned) return null;
  const num = parseFloat(cleaned);
  if (Number.isNaN(num)) return null;
  return negative ? -Math.abs(num) : num;
}

/** True when effort is non-zero, including payroll reversals (negative %). */
export function hasPercentEffort(percentEffort: number): boolean {
  return Math.abs(percentEffort) >= 0.005;
}

/**
 * Excel percent cells store 25% as 0.25 and 150% as 1.5.
 * Unformatted exports may instead use percent points (25, 55.3, 150).
 */
function scaleExcelPercentNumber(value: number): number {
  const abs = Math.abs(value);
  if (abs <= 1) return value * 100;
  if (abs < 10 && !Number.isInteger(value)) return value * 100;
  return value;
}

export function parsePercent(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") {
    if (Number.isNaN(value)) return null;
    return scaleExcelPercentNumber(value);
  }
  const str = String(value).trim();
  if (!str || str === "-" || str === "—") return null;
  let body = str;
  let parenNegative = false;
  if (body.startsWith("(") && body.endsWith(")")) {
    parenNegative = true;
    body = body.slice(1, -1).trim();
  }
  const hasPct = body.includes("%");
  const num = parseFloat(body.replace(/%/g, "").replace(/,/g, ""));
  if (Number.isNaN(num)) return null;
  const signed = parenNegative ? -Math.abs(num) : num;
  if (hasPct) return signed;
  return scaleExcelPercentNumber(signed);
}

/** Prefer Excel's percent format / formatted text when present. */
export function parsePercentCell(
  cell: { v?: unknown; w?: string; z?: string } | null | undefined,
  fallback?: unknown
): number | null {
  if (cell) {
    const formatted = typeof cell.w === "string" ? cell.w.trim() : "";
    if (formatted && formatted.includes("%")) {
      return parsePercent(formatted);
    }
    const fmt = typeof cell.z === "string" ? cell.z : "";
    if (fmt.includes("%") && typeof cell.v === "number" && !Number.isNaN(cell.v)) {
      return cell.v * 100;
    }
    if (cell.v !== undefined && cell.v !== null && cell.v !== "") {
      return parsePercent(cell.v);
    }
  }
  return parsePercent(fallback ?? null);
}

const MONTH_MAP: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

export function parseMonthLabel(label: string): string | null {
  const t = label.trim();
  const m1 = t.match(/^([A-Za-z]{3})-(\d{4})$/);
  if (m1) {
    const mo = MONTH_MAP[m1[1].toLowerCase()];
    if (mo) return `${m1[2]}-${String(mo).padStart(2, "0")}`;
  }
  const m2 = t.match(/^(\d{4})-(\d{2})$/);
  if (m2) return t;
  return null;
}

const MONTH_NAMES = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function formatMonthShort(month: string): string {
  const [, m] = month.split("-");
  return MONTH_NAMES[parseInt(m, 10) - 1] ?? month;
}

export function formatMonthDisplay(month: string): string {
  const [y, m] = month.split("-");
  return `${MONTH_NAMES[parseInt(m, 10) - 1]}-${y?.slice(2)}`;
}

/** Report run dates (yyyy-MM-dd) → Jul 31, 2026 */
export function formatIsoDateDisplay(isoDate: string | undefined | null): string | null {
  if (!isoDate) return null;
  const d = parse(isoDate.slice(0, 10), "yyyy-MM-dd", new Date());
  if (!isValid(d)) return isoDate;
  return format(d, "MMM d, yyyy");
}

export function formatCurrency(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(n);
}

/** USD with $ prefix; up to 2 decimal places (for editable balances). */
export function formatCurrencyBalance(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(n);
}

export function roundCurrencyAmount(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Round effort to one decimal — same precision as the timeline bars. */
export function roundPercentDisplay(n: number): number {
  return Math.round(n * 10) / 10;
}

export function formatPercent(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  const rounded = roundPercentDisplay(n);
  const nearestWhole = Math.round(rounded);
  if (Math.abs(rounded - nearestWhole) < 0.01) {
    return `${nearestWhole}%`;
  }
  return `${rounded.toFixed(1).replace(/\.0$/, "")}%`;
}

/** Full-time hours per year for hourly rate from annual salary. */
export const ANNUAL_WORK_HOURS = 2080;

export function detectPayFrequency(compensationLabel: string): PayFrequency | undefined {
  const l = compensationLabel.toLowerCase().replace(/\s+/g, " ");
  if (l.includes("bi-weekly") || l.includes("biweekly") || l.includes("bi weekly")) {
    return "biweekly";
  }
  if (l.includes("semi-monthly") || l.includes("semimonthly")) return "semimonthly";
  if (/\bweekly\b/.test(l) && !l.includes("bi")) return "weekly";
  if (l.includes("monthly")) return "monthly";
  return undefined;
}

export function formatHourlyRate(n: number): string {
  return `${new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n)}/hr`;
}

export function parseEmployeeName(raw: string): { name: string; employeeId?: string } {
  const idMatch = raw.match(/\((\d{8,})/);
  const employeeId = idMatch?.[1];
  let namePart = raw.split("(")[0].trim();
  if (namePart.includes(",")) {
    const [last, first] = namePart.split(",").map((s) => s.trim());
    namePart = `${first} ${last}`.replace(/\s+/g, " ").trim();
  }
  return { name: namePart, employeeId };
}

export function extractChartstring(label: string): string | null {
  const m = label.match(/\((\d{4}-\d+[^)]*)\)/);
  return m ? m[1].trim() : null;
}

export function chartstringToFund(chart: string): string {
  return chart.split("-")[0] ?? chart;
}

export function chartstringToProjectId(chart: string): string | undefined {
  const parts = chart.split("-");
  return parts.length >= 3 ? parts[2] : undefined;
}
