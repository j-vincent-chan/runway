/**
 * Every link an email carries must be an absolute URL — a schemeless value
 * produces a relative href, which mail clients render as dead text instead
 * of a link (production once shipped NEXT_PUBLIC_APP_URL without https://
 * and every emailed link died silently in Outlook).
 */
export function normalizeAppUrl(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim() ?? "";
  if (!trimmed) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  return withScheme.replace(/\/+$/, "");
}

/** The app origin for email links, scheme guaranteed. */
export function appUrlFromEnv(): string {
  return normalizeAppUrl(process.env.NEXT_PUBLIC_APP_URL) ?? "https://runway.vercel.app";
}
