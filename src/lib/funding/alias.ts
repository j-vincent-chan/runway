import type { FundingSource } from "@/types";
import { chartstringToProjectId } from "@/lib/utils/parse";
import { normalizeChartstring } from "@/lib/funding/chartstring";

/** Project number segment from chartstring (e.g. 7030720 from 7000-129074-7030720-45) */
export function getProjectNumber(fs: FundingSource): string | undefined {
  if (fs.projectId) return fs.projectId;
  if (fs.accountString) return chartstringToProjectId(fs.accountString) ?? undefined;
  return undefined;
}

/** Dept segment of a chartstring (129074 from 7000-129074-7030720-45). */
function chartstringDept(chart: string): string | undefined {
  const parts = normalizeChartstring(chart).split("-").filter(Boolean);
  return parts.length >= 3 ? parts[1] : undefined;
}

/**
 * The code suffix a row displays. Normally the project number alone — but a
 * project number is not unique across depts, so when another source in the
 * snapshot shares it under a different dept, the dept is appended. Two rows
 * both reading "146328D" with the only disambiguator buried in a parenthetical
 * is a defect: the code column exists to tell rows apart.
 */
export function projectDisplayCode(
  fs: FundingSource,
  allSources?: FundingSource[]
): string | undefined {
  const project = getProjectNumber(fs);
  if (!project || !allSources) return project;
  const dept = chartstringDept(fs.accountString ?? fs.rawName);
  if (!dept) return project;
  const ambiguous = allSources.some(
    (other) =>
      other.id !== fs.id &&
      getProjectNumber(other) === project &&
      chartstringDept(other.accountString ?? other.rawName) !== dept
  );
  return ambiguous ? `${project} · dept ${dept}` : project;
}

/** Default friendly label without project suffix */
export function defaultAliasBase(fs: FundingSource): string {
  if (fs.fund) return `Fund ${fs.fund}`;
  const fromAlias = fs.alias.split("·")[0]?.trim();
  if (fromAlias && !fromAlias.startsWith("Percent")) return fromAlias;
  return "Account";
}

/** Full label shown in UI: "{base} · {projectNumber}" */
export function formatDisplayAlias(base: string, projectNumber?: string): string {
  const b = base.trim();
  if (!b) return projectNumber ?? "Account";
  if (!projectNumber) return b;
  const suffix = ` · ${projectNumber}`;
  if (b.endsWith(suffix) || b.endsWith(projectNumber)) return normalizeDisplayAlias(b, projectNumber);
  return `${b}${suffix}`;
}

function normalizeDisplayAlias(value: string, projectNumber: string): string {
  const stripped = stripProjectFromAlias(value, projectNumber);
  return formatDisplayAlias(stripped, projectNumber);
}

/** User-editable portion only (strip auto-appended project suffix if pasted) */
export function stripProjectFromAlias(value: string, projectNumber?: string): string {
  let v = value.trim();
  if (!projectNumber) return v;
  const suffix = ` · ${projectNumber}`;
  if (v.endsWith(suffix)) return v.slice(0, -suffix.length).trim();
  if (v.endsWith(`-${projectNumber}`)) return v.slice(0, -(projectNumber.length + 1)).trim();
  const parts = v.split("·").map((p) => p.trim());
  if (parts.length > 1 && parts[parts.length - 1] === projectNumber) {
    return parts.slice(0, -1).join(" · ").trim();
  }
  return v;
}

export function resolveAliasBase(
  fs: FundingSource,
  customAlias?: string,
  accountTitle?: string
): string {
  const project = getProjectNumber(fs);
  if (customAlias?.trim()) return stripProjectFromAlias(customAlias, project);
  if (accountTitle?.trim()) return stripProjectFromAlias(accountTitle, project);
  return stripProjectFromAlias(fs.alias, project) || defaultAliasBase(fs);
}

export function resolveDisplayAlias(
  fs: FundingSource,
  customAlias?: string,
  accountTitle?: string
): string {
  const project = getProjectNumber(fs);
  const base = resolveAliasBase(fs, customAlias, accountTitle);
  return formatDisplayAlias(base, project);
}
