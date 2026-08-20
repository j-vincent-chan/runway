# Privacy checklist for Runway

Keep real payroll / MyPortfolio exports **out of git** and **out of public cloud URLs**. Use the app’s Upload flow; sync only authenticated, private Supabase data when you choose.

## One-time setup (required after this change)

1. In the Supabase dashboard → **SQL**, re-run `payroll-funding-planner/supabase/schema.sql`.
   - Makes `employee-photos`, `employee-offer-letters`, and `app-workspace` **private**
   - Restricts table + Storage RLS to **`authenticated`** only
2. Enable **Authentication → Providers → Email** (email/password).
3. Under **Authentication → URL configuration**, set Site URL to your app origin (e.g. `http://localhost:3000` or your Vercel URL).
4. Create an account via **Sign in** in the app header (or `/login`).

## Local-only mode

- Runway always works from **browser localStorage** without signing in.
- Settings → **Privacy & cloud sync** → check **Local-only mode** to never upload workspace/roster data even when signed in.
- Upload `.xlsx` in the app; do not commit those files.

## What is synced when cloud sync is on

- Parsed planning workspace JSON (private Storage bucket `app-workspace`)
- Aliases, catalogs, roster meta
- Photos / offer letters in private buckets, accessed via **signed URLs** (not permanent public links)

Raw Excel files are not uploaded as the source of truth.

## Rotate secrets if they were exposed

If publishable/anon keys or tokens appeared in chat, screenshots, or a shared repo:

1. Supabase → **Project Settings → API** → rotate the publishable / anon key (and service role if exposed).
2. Update `payroll-funding-planner/.env.local` (never commit this file).
3. Redeploy Vercel/hosting with the new env vars.
4. Revoke any leaked Vercel OIDC / personal tokens from the provider dashboard.

## Institutional policy

Confirm with UCSF / your compliance contact before storing named payroll data in any cloud project. If cloud storage is not allowed, keep **Local-only mode** on permanently.
