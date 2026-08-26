# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## What this app is

Runway ("Academic Finance Copilot") is a Next.js app that ingests a **Payroll Funding Report** Excel file (plus optional Net Position and Position Salary reports) and turns it into an interactive personnel funding timeline, runway projections, and a dashboard. It's a planning/interpretation layer, not a system of record. See [README.md](README.md) for the route list and product framing, and [PRIVACY.md](PRIVACY.md) for the per-user data model before touching auth, storage, or Supabase sync code.

## Commands

```bash
npm run dev            # start dev server
npm run build           # production build
npm run lint             # eslint
npm test                  # vitest run (all tests, once)
npx vitest run path/to/file.test.ts   # single test file
npx vitest path/to/file.test.ts        # watch mode for one file
```

There is no separate typecheck script — `next build` (and the editor's TS server) is the source of truth for type errors.

## Architecture

### Data flow: parse → snapshot → working plan → derived views

1. **Parsers** (`src/lib/parsers/`) read uploaded files (xlsx via `xlsx`, docx via `mammoth`, PDF via `pdfjs-dist`) into typed import records defined in [src/types/index.ts](src/types/index.ts): `PayrollReportSnapshot`, `PortfolioReportImport`, `NetPositionReportImport`, `PositionSalaryReportImport`.
2. Multiple payroll uploads are **folded together** (`src/lib/import/foldPayrollImports.ts`, `mergeSnapshots.ts`) into one working `PayrollReportSnapshot`; removing an import re-folds the rest. Net Position imports collapse into per-account balances (`src/lib/funding/accountBalances.ts`) and position-salary imports are overlaid (`src/lib/employees/positionSalary.ts`). Net Position Reports are the only balance source — they can be run against a chosen set of accounts, so what arrives is the payroll accounts and nothing else.
3. A `WorkingPlan` holds user edits to monthly allocations on top of the imported snapshot (`snapshot.monthlyAllocations` is the imported baseline; `workingPlan.allocations` overlays edits). `getAllocations()` in `src/lib/calculations/index.ts` reconciles the two.
4. Everything else (coverage, funding cliffs, runway, projections, dashboard insights) is **derived** from snapshot + workingPlan + settings via pure functions in `src/lib/calculations/`, `src/lib/runway/`, `src/lib/projections/`, `src/lib/dashboard/`, `src/lib/net-position/` — not stored.

### State: `AppContext` is the app

[src/context/AppContext.tsx](src/context/AppContext.tsx) is the single provider (mounted in `src/app/layout.tsx`) holding snapshot, workingPlan, settings, scenarios, and all imports, plus every mutator. Pages/components read via `useApp()` and call its methods rather than touching storage directly. It also owns:
- Pending-import review flow (`pendingSnapshot`/`pendingPreview`/`pendingMergeInfo` → `confirmImport`/`cancelImport`) shown before an upload is applied.
- Debounced persistence: every state change writes to local storage immediately and, if cloud sync is enabled, to Supabase ~1.5s later (see effect around `cloudSaveTimer`).

`AuthContext` ([src/context/AuthContext.tsx](src/context/AuthContext.tsx)) tracks Supabase auth/session and local-only preference independently of `AppContext`.

### Storage: local-first, optional per-user cloud sync

- `src/lib/storage/localStorage.ts` persists to IndexedDB, keyed per signed-in user or a shared `:local` key when signed out.
- `src/lib/supabase/workspace.ts` + `src/lib/supabase/sync.ts` push/pull the same shape to/from a private Supabase Storage workspace JSON, plus dedicated tables for aliases, roster metadata, catalogs, and files (offer letters, photos).
- `src/lib/supabase/cloudGate.ts` (`canUseCloudSync`) is the single gate: cloud sync only runs when Supabase is configured, the user is signed in, and local-only mode is off.
- On load, `AppContext` reconciles local vs. cloud state by recency (`pickWorkspace`), and a "lab owner" account (`NEXT_PUBLIC_LAB_OWNER_EMAIL`, default `vincent.chan@ucsf.edu`) is the only one that inherits pre-auth shared/local data (`claimLegacyCloudWorkspace`). Every other account starts empty — this is a deliberate privacy boundary, not a bug, when reasoning about missing data.
- Never assume real payroll data belongs in git or public URLs — see [PRIVACY.md](PRIVACY.md).

### Stable identity across re-imports

Funding sources and employees need stable keys across repeated uploads (chartstrings/people don't have durable IDs from the source data):
- `src/lib/funding/sourceKey.ts` (`fundingSourceKey`) and `src/lib/employees/stableKey.ts` (`employeePersonKey`) derive normalized keys used for aliases, categories, roster metadata, and cloud rows, with migration helpers (`migrateAliasKeys`, `migrateCategoryKeys`, `rematchEmployeeProfiles`) run on every load/import to reattach user edits to the right entity after re-parsing.

### Settings-driven catalogs

Personnel groups (called **Teams** in all user-visible copy — the code, settings keys, and `personnel_groups` table keep the old name), funding source types, and account groups are user-editable catalogs (`AppSettings.personnelGroups` / `fundingSourceTypes` / `accountGroups`) rather than hardcoded enums, with legacy built-in IDs still referenced as string literals in a few places (see comments in [src/types/index.ts](src/types/index.ts)). `src/lib/supabase/catalog.ts` syncs these to/from Supabase and applies defaults (`ensureCatalogDefaults`).

### UI structure

- `src/app/*/page.tsx` are route entry points; most business logic lives in `src/components/<feature>/` and `src/lib/<feature>/`, not in the page files.
- `AppShell` / `Header` / `Sidebar` in `src/components/layout/` wrap all routed pages (set in root `layout.tsx`).
- Charts use `recharts` via `src/components/charts/ChartResponsive.tsx`.

### Testing conventions

Tests are colocated `*.test.ts` files next to the module they cover (e.g. `src/lib/dashboard/metrics.test.ts`), run with Vitest in a Node environment (`vitest.config.ts`), and target the pure calculation/parsing/merging logic in `src/lib/` — not components.

## Runway — product context

Runway is a financial planning tool for UCSF faculty who manage research programs. Faculty upload payroll funding reports; Runway turns them into staff funding distribution over time, projections, per-person runway, account balances, and risk signals.

The audience is a principal investigator, not a financial analyst. They open Runway a handful of times a year, between clinic and a lab meeting. Every surface optimizes for the ten-second read.

**Governing objective:** reduce the time and cognitive effort required for a faculty member to understand their financial state and identify anything requiring attention.

@docs/design-system.md

## Non-negotiables

- **Never reimplement a financial calculation.** Balances, burn, runway, and funded-through dates have canonical selectors. Import them. If one doesn't exist for what you need, stop and ask — do not invent a derivation.
- **Never show a count where a name is available.** Risk is always people, dates, and dollar amounts.
- **Never render a projected figure so it could be mistaken for a measured one.** See the projection conventions in the design system.
- **Never add a dependency without asking.**
- **Never fix a data discrepancy by picking whichever number looks right.** Report it with both code paths and stop.

## Working agreement

- Start substantial work in plan mode. Propose the plan, wait for approval, then implement.
- Keep diffs scoped to what was asked. No drive-by refactors, no formatting-only changes to files you aren't otherwise editing.
- Commit per logical unit with a clear message, not one commit at the end.
- After each unit, run the project's build, typecheck, and lint. Don't report done on a red build.
- When you're uncertain whether something is a bug or intentional, ask rather than assume.

## Known open questions

- **Headcount vs. FTE.** The monthly chart's "Headcount" series shows fractional values, so it is probably FTE. Confirm and label accordingly everywhere.

## Resolved

- **Two conflicting cost totals.** Previously: the Dashboard displayed `$188,114` under "By team" (then "By personnel group") and `$128,777` under "Funding type mix" for the same month, both described as the planning roster. The "Funding type mix" donuts were replaced by the funding-exposure band/matrix (`src/lib/dashboard/fundingExposure.ts`), which computes its total via `buildFundingMixForEmployees` — the same per-employee split (`partitionEmployeeMonthCost`) that always satisfies `attributed + unattributed === calculateMonthlyCost(...).total`, the exact figure "By team" (then "By personnel group") sums too. The two totals can no longer structurally diverge for the same employee set and month; not a silent reconciliation, the comparison target was removed and rebuilt on the shared selector.
- **Notification badge.** The bell's alerts (`generateAlerts` — coverage gaps, funding cliffs, stale payroll, unaliased accounts) are a different domain from the Dashboard's own $-runway attention queue, and its "full view" link pointed to Timeline, so the badge had no explanation near the app's landing page. Points to `/dashboard` now (`src/components/alerts/AlertsBell.tsx`); the popup itself already lists every alert inline.
