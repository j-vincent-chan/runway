import type { FundingSource } from "@/types";
import { chartstringToProjectId } from "@/lib/utils/parse";

/** Project number segment from chartstring (e.g. 7030720 from 7000-129074-7030720-45) */
export function getProjectNumber(fs: FundingSource): string | undefined {
  if (fs.projectId) return fs.projectId;
  if (fs.accountString) return chartstringToProjectId(fs.accountString) ?? undefined;
  return undefined;
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
  portfolioTitle?: string
): string {
  const project = getProjectNumber(fs);
  if (customAlias?.trim()) return stripProjectFromAlias(customAlias, project);
  if (portfolioTitle?.trim()) return stripProjectFromAlias(portfolioTitle, project);
  return stripProjectFromAlias(fs.alias, project) || defaultAliasBase(fs);
}

export function resolveDisplayAlias(
  fs: FundingSource,
  customAlias?: string,
  portfolioTitle?: string
): string {
  const project = getProjectNumber(fs);
  const base = resolveAliasBase(fs, customAlias, portfolioTitle);
  return formatDisplayAlias(base, project);
}
