/** Lab account that inherits the pre-auth shared workspace. Everyone else starts empty. */
export const DEFAULT_LAB_OWNER_EMAIL = "vincent.chan@ucsf.edu";

export function getLabOwnerEmail(): string {
  const fromEnv = process.env.NEXT_PUBLIC_LAB_OWNER_EMAIL?.trim();
  return (fromEnv || DEFAULT_LAB_OWNER_EMAIL).toLowerCase();
}

export function isLabOwnerEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return email.trim().toLowerCase() === getLabOwnerEmail();
}
