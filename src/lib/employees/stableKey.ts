import type { AppSettings, Employee, EmployeeProfile } from "@/types";

const CREDENTIAL_SUFFIX =
  /,?\s+\b(phd|ms|mph|md|mba|mha|rn|dvm|jd|ma|ba|bs|msc|bsc)\.?$/i;

/** Drop titles/credentials and flip "Last, First" → "first last". */
function basePersonName(name: string): string {
  let n = name.trim().toLowerCase();
  n = n.replace(CREDENTIAL_SUFFIX, "").trim();
  if (n.includes(",")) {
    const [last, ...rest] = n.split(",").map((s) => s.trim());
    const first = rest.join(" ").trim();
    if (first && last) n = `${first} ${last}`;
  }
  return n.replace(/\s+/g, " ").trim();
}

/** Name tokens without single-letter middle initials. */
export function personNameTokens(name: string): string[] {
  return basePersonName(name)
    .split(" ")
    .map((p) => p.replace(/\./g, ""))
    .filter((p) => p.length > 1);
}

/**
 * Normalize display names for matching.
 * "Bolus, Reid R" / "Reid R Bolus" / "Reid Bolus" → "reid bolus"
 * (middle initials removed; keeps multi-word last names)
 */
export function normalizePersonName(name: string): string {
  return personNameTokens(name).join(" ");
}

/** True when payroll vs OCR names refer to the same person despite initials/spelling. */
export function namesLooselyMatch(a: string, b: string): boolean {
  const na = normalizePersonName(a);
  const nb = normalizePersonName(b);
  if (na && nb && na === nb) return true;

  const A = personNameTokens(a);
  const B = personNameTokens(b);
  if (A.length === 0 || B.length === 0) return false;

  const firstA = A[0]!;
  const firstB = B[0]!;
  const restA = A.slice(1);
  const restB = B.slice(1);
  if (restA.length === 0 || restB.length === 0) return false;

  const sharedLast = restA.some((t) =>
    restB.some((u) => t === u || t.includes(u) || u.includes(t))
  );
  if (!sharedLast) return false;

  if (firstA === firstB) return true;
  if (firstA.startsWith(firstB) || firstB.startsWith(firstA)) return true;
  // Jonathon / Jonathan — same first letter, close spelling. Not last-name-only.
  if (
    firstA[0] === firstB[0] &&
    levenshtein(firstA, firstB) <= 2 &&
    Math.min(firstA.length, firstB.length) >= 4
  ) {
    return true;
  }
  return false;
}

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i]![0] = i;
  for (let j = 0; j <= n; j++) dp[0]![j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i]![j] = Math.min(
        dp[i - 1]![j]! + 1,
        dp[i]![j - 1]! + 1,
        dp[i - 1]![j - 1]! + cost
      );
    }
  }
  return dp[m]![n]!;
}

export function employeeNameKey(emp: Pick<Employee, "name">): string {
  return `name:${normalizePersonName(emp.name)}`;
}

/** Prefer HR id when present; always also expose the name key for OCR/website matches. */
export function employeePersonKey(
  emp: Pick<Employee, "employeeId" | "name">
): string {
  const hr = emp.employeeId?.trim();
  if (hr) return `hr:${hr.toLowerCase()}`;
  return employeeNameKey(emp);
}

export function employeePersonKeys(
  emp: Pick<Employee, "employeeId" | "name">
): string[] {
  const keys: string[] = [];
  const hr = emp.employeeId?.trim();
  if (hr) keys.push(`hr:${hr.toLowerCase()}`);
  keys.push(employeeNameKey(emp));
  return [...new Set(keys)];
}

function profileFromNameIndex(
  byNormalizedName: Map<string, EmployeeProfile>,
  empName: string
): EmployeeProfile | undefined {
  const exact = byNormalizedName.get(normalizePersonName(empName));
  if (exact) return exact;
  for (const [key, profile] of byNormalizedName) {
    if (namesLooselyMatch(empName, key)) return profile;
  }
  return undefined;
}

/** Resolve a profile by internal id, HR key, or normalized/fuzzy name key. */
export function resolveEmployeeProfile(
  settings: AppSettings,
  emp: Pick<Employee, "id" | "employeeId" | "name">
): EmployeeProfile | undefined {
  const profiles = settings.employeeProfiles ?? {};
  if (profiles[emp.id]) return profiles[emp.id];
  for (const key of employeePersonKeys(emp)) {
    if (profiles[key]) return profiles[key];
  }
  const byNormalizedName = new Map<string, EmployeeProfile>();
  for (const [key, profile] of Object.entries(profiles)) {
    if (!key.startsWith("name:")) continue;
    byNormalizedName.set(key.slice("name:".length), profile);
  }
  return profileFromNameIndex(byNormalizedName, emp.name);
}

/**
 * After import, copy profiles onto current employee UUIDs using HR id / name keys.
 * Keeps both id and person_key entries so lookups stay resilient.
 */
export function rematchEmployeeProfiles(
  profiles: Record<string, EmployeeProfile> | undefined,
  employees: Employee[]
): Record<string, EmployeeProfile> {
  const next: Record<string, EmployeeProfile> = { ...(profiles ?? {}) };

  const byNormalizedName = new Map<string, EmployeeProfile>();
  for (const [key, profile] of Object.entries(next)) {
    if (!key.startsWith("name:")) continue;
    byNormalizedName.set(key.slice("name:".length), profile);
  }

  for (const emp of employees) {
    const keys = employeePersonKeys(emp);
    const nameKey = employeeNameKey(emp);

    let fromKeys: EmployeeProfile = {};
    for (const key of keys) {
      if (next[key]) fromKeys = { ...fromKeys, ...next[key] };
    }
    const fromNameIndex = profileFromNameIndex(byNormalizedName, emp.name) ?? {};
    const byId = next[emp.id] ?? {};
    const merged: EmployeeProfile = { ...fromNameIndex, ...fromKeys, ...byId };

    if (!merged.photoUrl && !merged.startDate && !merged.endDate && !merged.offerLetter) {
      continue;
    }
    next[emp.id] = merged;
    next[nameKey] = {
      photoUrl: merged.photoUrl,
      startDate: merged.startDate,
      endDate: merged.endDate,
      offerLetter: merged.offerLetter,
    };
  }

  return next;
}
