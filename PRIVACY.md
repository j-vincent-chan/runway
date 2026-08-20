# Privacy checklist for Runway

Keep real payroll / MyPortfolio exports **out of git** and **out of public cloud URLs**. Use the app’s Upload flow; sync only authenticated, private Supabase data when you choose.

## Per-user datasets

- Each signed-in account has its **own** cloud workspace, aliases, catalogs, roster, and files.
- Another user logging in does **not** see your payroll data (and cannot overwrite it).
- Browser storage is also keyed per user, so switching accounts on one machine keeps datasets separate.
- **Lab owner** (`vincent.chan@ucsf.edu`, overridable via `NEXT_PUBLIC_LAB_OWNER_EMAIL`) is the only account that inherits the pre-auth shared dataset:
  - Browser: unsigned `:local` / legacy key → owner’s user slot on first sign-in
  - Cloud: Storage `default.json` → `{ownerUserId}/workspace.json` (then `default.json` is removed)
- After that, old shared cloud data at `default.json` is gone; other accounts always start empty.

## One-time setup (required after this change)

1. In the Supabase dashboard → **SQL**, re-run `supabase/schema.sql`.
   - Makes storage buckets **private**
   - Restricts RLS so each user only sees **their own** rows and files
   - Allows the lab owner email to claim legacy `default.json`
2. Enable **Authentication → Providers → Email** (email/password).
3. Under **Authentication → URL configuration**, set Site URL to your app origin (e.g. `http://localhost:3000` or your Vercel URL).
4. Create / sign in as **vincent.chan@ucsf.edu** via **Sign in** in the app header (or `/login`) so the existing lab workspace attaches to that account.
5. If data is still missing after sign-in: re-run `schema.sql`, then check Storage → `app-workspace` for `default.json` (see `supabase/recover_owner_workspace.sql`). Sign in again with cloud sync on.

## Local-only mode

- Runway always works from **browser localStorage** without signing in.
- Settings → **Privacy & cloud sync** → check **Local-only mode** to never upload workspace/roster data even when signed in.
- Upload `.xlsx` in the app; do not commit those files.

## What is synced when cloud sync is on

- Parsed planning workspace JSON under `{userId}/workspace.json` in private Storage
- Your aliases, catalogs, and roster meta only
- Photos / offer letters under `{userId}/…`, accessed via **signed URLs**

Raw Excel files are not uploaded as the source of truth.

## Rotate secrets if they were exposed

If publishable/anon keys or tokens appeared in chat, screenshots, or a shared repo:

1. Supabase → **Project Settings → API** → rotate the publishable / anon key (and service role if exposed).
2. Update `.env.local` (never commit this file).
3. Redeploy Vercel/hosting with the new env vars.
4. Revoke any leaked Vercel OIDC / personal tokens from the provider dashboard.

## Institutional policy

Confirm with UCSF / your compliance contact before storing named payroll data in any cloud project. If cloud storage is not allowed, keep **Local-only mode** on permanently.
