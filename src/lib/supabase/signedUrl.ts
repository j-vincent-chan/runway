import { getSupabase } from "@/lib/supabase/client";

export const PHOTO_BUCKET = "employee-photos";
export const OFFER_LETTER_BUCKET = "employee-offer-letters";

/** Encode a private Storage object as a stable local reference (not a public URL). */
export function encodeStorageRef(bucket: string, path: string): string {
  return `sb://${bucket}/${path.replace(/^\/+/, "")}`;
}

export function parseStorageRef(
  value: string | null | undefined
): { bucket: string; path: string } | null {
  const raw = value?.trim();
  if (!raw) return null;
  if (raw.startsWith("sb://")) {
    const rest = raw.slice("sb://".length);
    const slash = rest.indexOf("/");
    if (slash <= 0) return null;
    const bucket = rest.slice(0, slash);
    const path = rest.slice(slash + 1);
    if (!bucket || !path) return null;
    return { bucket, path };
  }
  // Legacy public object URLs: …/storage/v1/object/public/<bucket>/<path>
  const publicMatch = raw.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+?)(?:\?|$)/);
  if (publicMatch) {
    return { bucket: publicMatch[1], path: decodeURIComponent(publicMatch[2]) };
  }
  // Signed URLs: …/storage/v1/object/sign/<bucket>/<path>?token=…
  const signMatch = raw.match(/\/storage\/v1\/object\/sign\/([^/]+)\/(.+?)(?:\?|$)/);
  if (signMatch) {
    return { bucket: signMatch[1], path: decodeURIComponent(signMatch[2]) };
  }
  return null;
}

const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour

export async function createSignedStorageUrl(
  bucket: string,
  path: string,
  expiresIn = SIGNED_URL_TTL_SECONDS
): Promise<string | null> {
  const supabase = getSupabase();
  if (!supabase || !path) return null;
  const { data, error } = await supabase.storage
    .from(bucket)
    .createSignedUrl(path, expiresIn);
  if (error || !data?.signedUrl) {
    console.warn("[supabase] signed URL failed:", error?.message ?? "no url");
    return null;
  }
  return data.signedUrl;
}

/** Resolve a stored photo/offer value to a usable browser URL (signed when private). */
export async function resolveAccessibleUrl(
  stored: string | null | undefined,
  fallbackPath?: string | null,
  fallbackBucket?: string
): Promise<string | null> {
  const ref = parseStorageRef(stored);
  if (ref) {
    return createSignedStorageUrl(ref.bucket, ref.path);
  }
  if (fallbackPath && fallbackBucket) {
    return createSignedStorageUrl(fallbackBucket, fallbackPath);
  }
  const external = stored?.trim();
  if (external && /^https?:\/\//i.test(external)) {
    return external;
  }
  return null;
}
