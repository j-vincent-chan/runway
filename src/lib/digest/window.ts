/**
 * When the morning digest is allowed to go out.
 *
 * The cron fires hourly; this module decides whether a given run should send.
 * The rule: a queued item ships in the first run at or after the digest hour
 * (8:00 AM analyst-local by default) that comes *after* it was queued. An item
 * queued at 7:59 goes out that morning; one queued at 8:30 waits for the next
 * morning — the overnight gap is the PI's window to unlock and correct.
 *
 * Running hourly instead of once at 8:00 is the retry story: a failed send
 * leaves items queued, and the next hour's run picks them up, because they
 * still satisfy `queuedAt < cutoff`.
 */

export const DIGEST_HOUR_DEFAULT = 8;
export const DIGEST_TZ_DEFAULT = "America/Los_Angeles";

/**
 * Offset between UTC and the zone at `date`, in ms. Computed at `date` itself,
 * so a DST switch (2:00 AM local) is settled by any daytime digest hour.
 */
function tzOffsetMs(date: Date, tz: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts: Record<string, string> = {};
  for (const p of dtf.formatToParts(date)) parts[p.type] = p.value;
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    // "24" can appear for midnight in some ICU versions.
    Number(parts.hour === "24" ? "0" : parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );
  return asUtc - date.getTime();
}

/**
 * Today's digest hour in `tz` as a UTC instant — but only once `now` has
 * passed it; before the hour, no digest may send and this returns null.
 *
 * A row ships when `digestQueuedAt < cutoff`: queued before this morning's
 * hour and the hour has arrived.
 */
export function digestCutoff(
  now: Date,
  tz: string = DIGEST_TZ_DEFAULT,
  hour: number = DIGEST_HOUR_DEFAULT
): Date | null {
  const offset = tzOffsetMs(now, tz);
  const local = new Date(now.getTime() + offset);
  if (local.getUTCHours() < hour) return null;
  const cutoffLocalAsUtc = Date.UTC(
    local.getUTCFullYear(),
    local.getUTCMonth(),
    local.getUTCDate(),
    hour
  );
  return new Date(cutoffLocalAsUtc - offset);
}

/** Whether a row queued at `queuedAt` belongs in the digest for `now`'s run. */
export function isDueForDigest(
  queuedAt: string | Date,
  now: Date,
  tz?: string,
  hour?: number
): boolean {
  const cutoff = digestCutoff(now, tz, hour);
  if (!cutoff) return false;
  const queued = typeof queuedAt === "string" ? new Date(queuedAt) : queuedAt;
  return queued.getTime() < cutoff.getTime();
}

/**
 * The sentence the Lock In dialog shows about when the handoff will be
 * emailed — "this morning at 8:00 AM" only when the hour hasn't struck yet.
 */
export function nextDigestLabel(
  now: Date,
  tz: string = DIGEST_TZ_DEFAULT,
  hour: number = DIGEST_HOUR_DEFAULT
): string {
  const offset = tzOffsetMs(now, tz);
  const local = new Date(now.getTime() + offset);
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  const ampm = hour < 12 ? "AM" : "PM";
  return local.getUTCHours() < hour
    ? `this morning at ${h12}:00 ${ampm}`
    : `tomorrow at ${h12}:00 ${ampm}`;
}
