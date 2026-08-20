/** Local preference: skip cloud sync even when signed in. */
const LOCAL_ONLY_KEY = "runway:cloudLocalOnly";

export function getCloudLocalOnly(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(LOCAL_ONLY_KEY) === "1";
  } catch {
    return false;
  }
}

export function setCloudLocalOnly(value: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (value) localStorage.setItem(LOCAL_ONLY_KEY, "1");
    else localStorage.removeItem(LOCAL_ONLY_KEY);
  } catch {
    /* ignore quota / private mode */
  }
}

/** True when Supabase is configured, user is signed in, and local-only mode is off. */
export function canUseCloudSync(opts: {
  configured: boolean;
  signedIn: boolean;
  localOnly?: boolean;
}): boolean {
  const localOnly = opts.localOnly ?? getCloudLocalOnly();
  return opts.configured && opts.signedIn && !localOnly;
}
