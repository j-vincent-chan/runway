/**
 * Supabase's implicit auth flow reports failures in the URL hash of the
 * redirect target, e.g. an expired confirmation link arrives as
 * `#error=access_denied&error_code=otp_expired&error_description=Email+link…`.
 * Success hashes (`#access_token=…`) are consumed and stripped by
 * supabase-js; error hashes are not, so the landing page must read them.
 */
export type AuthHashError = {
  code: string | null;
  description: string | null;
};

/** Null when the hash carries no `error` param (empty, or a token hash). */
export function parseAuthHashError(hash: string): AuthHashError | null {
  const raw = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!raw) return null;
  const params = new URLSearchParams(raw);
  if (!params.get("error")) return null;
  return {
    code: params.get("error_code"),
    description: params.get("error_description"),
  };
}
