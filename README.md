# Runway

**Academic Finance Copilot** — ingest a **Payroll Funding Report** Excel file and explore an interactive personnel funding timeline (actual payroll + future distributions).

## Quick start

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

1. Go to **Upload**.
2. Drop your Payroll Funding Report `.xlsx` from `financial-reports/` (kept local — gitignored).
3. Open **Timeline** to explore funding by person and month.

## Persist data (Supabase)

When configured, planning data syncs to Supabase (this browser’s localStorage / IndexedDB remain a cache):

- Payroll Funding Report snapshot and Timeline edits
- Net Position Report balances
- Runway overrides and Projections rules / planned accounts
- Chartstring aliases and account types
- Employee photos, roster extras (personnel type, dates, scope, hidden/alumni)
- Offer letter files (Storage bucket `employee-offer-letters`)

1. Create a free project at [supabase.com](https://supabase.com).
2. In **SQL Editor**, run the script in `supabase/schema.sql` (re-run it to pick up new columns/buckets).
3. Copy `.env.local.example` → `.env.local` and fill in **Project URL** + **Publishable key** (`sb_publishable_...`) from **Project Settings → API Keys** (not the legacy anon key).
4. Restart `npm run dev`.

Edits save locally immediately and push to cloud about a second later. Reloads use the newer of this browser vs cloud. Dedicated alias/roster tables still overlay the workspace file.

The workspace JSON lives in Storage bucket `app-workspace` under `{userId}/workspace.json`. The lab owner account (`vincent.chan@ucsf.edu`) inherits any pre-auth `default.json` / browser data on first sign-in; every other login gets a blank private workspace.

## What gets parsed

From sheets like **Payroll Funding Report**:

- Employees (HR ID, name, appointment %)
- Funding sources (chartstrings)
- Monthly percent effort and salary/benefits
- Future distribution rows

## Routes

| Route | Purpose |
|-------|---------|
| `/timeline` | Interactive funding grid + KPIs |
| `/runway` | Months of payroll remaining by account |
| `/accounts` | Redirects to Settings → Accounts |
| `/employees` | Roster, coverage, org structure |
| `/upload` | Import payroll, Net Position, and salary reports |
| `/settings` | Fiscal year, cliffs, aliases |

Planning and interpretation layer only — not the official payroll system of record. Confirm allowability with your finance/post-award analyst.
