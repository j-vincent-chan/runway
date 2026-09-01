# Supabase auth email templates

Supabase sends the auth emails (signup confirmation, password reset), so their
templates live in the Supabase dashboard, not in code. These files are the
canonical source — paste them in whenever they change. Each is a hand-inlined
mirror of the app-email layout in `src/lib/email/layout.ts`; a visual change
there should be reflected here.

## Installing

Dashboard → your project → **Authentication → Emails → Templates**:

| File | Template slot | Subject to set |
|---|---|---|
| `confirm-signup.html` | Confirm signup | `Confirm your email to start using Runway` |
| `reset-password.html` | Reset password | `Reset your Runway password` |

Paste the file's full contents (comments included — they're stripped fine)
into the "Message body" of the matching slot, set the subject, save, then send
yourself a test signup to verify.

Notes:

- `{{ .ConfirmationURL }}` resolves to the verify link; the signup flow's
  `emailRedirectTo` (set in `src/context/AuthContext.tsx`) lands it on
  `/auth/confirm`, which requires the URL to be in Authentication → URL
  Configuration → Redirect URLs.
- `{{ .Data.full_name }}` is the name collected at sign-up (stored in auth
  metadata); the greeting renders only when it exists.
- The app has no password-reset flow yet — `reset-password.html` is authored
  ahead of it so the template is ready when the flow ships.
