-- Runway cloud persistence
-- Run this in the Supabase SQL Editor (Project → SQL → New query).

-- Chartstring friendly names (aliases)
create table if not exists public.funding_source_aliases (
  chartstring_key text primary key,
  alias text not null,
  notes text,
  color text,
  updated_at timestamptz not null default now()
);

-- Editable personnel groups (Settings CRUD)
create table if not exists public.personnel_groups (
  id text primary key,
  label text not null,
  short_label text,
  pill_class text not null,
  dot_class text not null,
  chart_color text not null,
  sort_order int not null default 0,
  updated_at timestamptz not null default now()
);

-- Editable funding source types (Settings CRUD; Accounts "Funding source" pills)
create table if not exists public.funding_source_types (
  id text primary key,
  label text not null,
  pill_class text not null,
  dot_class text not null,
  chart_color text not null,
  sort_order int not null default 0,
  updated_at timestamptz not null default now()
);

-- People roster extras keyed by stable person_key (hr:<id> or name:<normalized>)
create table if not exists public.employee_roster_meta (
  person_key text primary key,
  display_name text,
  photo_url text,
  photo_path text,
  start_date date,
  end_date date,
  personnel_type text,
  planning_scope numeric,
  hidden boolean,
  alumni boolean,
  offer_letter_url text,
  offer_letter_path text,
  offer_letter_file_name text,
  offer_letter_mime_type text,
  offer_letter_uploaded_at timestamptz,
  offer_letter_extracted_start date,
  offer_letter_extracted_end date,
  offer_letter_extracted_salary numeric,
  updated_at timestamptz not null default now()
);

alter table public.employee_roster_meta add column if not exists start_date date;
alter table public.employee_roster_meta add column if not exists end_date date;
alter table public.employee_roster_meta add column if not exists personnel_type text;
alter table public.employee_roster_meta add column if not exists planning_scope numeric;
alter table public.employee_roster_meta add column if not exists hidden boolean;
alter table public.employee_roster_meta add column if not exists alumni boolean;
alter table public.employee_roster_meta add column if not exists offer_letter_url text;
alter table public.employee_roster_meta add column if not exists offer_letter_path text;
alter table public.employee_roster_meta add column if not exists offer_letter_file_name text;
alter table public.employee_roster_meta add column if not exists offer_letter_mime_type text;
alter table public.employee_roster_meta add column if not exists offer_letter_uploaded_at timestamptz;
alter table public.employee_roster_meta add column if not exists offer_letter_extracted_start date;
alter table public.employee_roster_meta add column if not exists offer_letter_extracted_end date;
alter table public.employee_roster_meta add column if not exists offer_letter_extracted_salary numeric;
alter table public.employee_roster_meta add column if not exists photo_path text;

-- Private Storage buckets (signed URLs only; not world-readable)
insert into storage.buckets (id, name, public)
values ('employee-photos', 'employee-photos', false)
on conflict (id) do update set public = excluded.public;

insert into storage.buckets (id, name, public)
values ('employee-offer-letters', 'employee-offer-letters', false)
on conflict (id) do update set public = excluded.public;

insert into storage.buckets (id, name, public)
values ('app-workspace', 'app-workspace', false)
on conflict (id) do update set public = excluded.public;

-- Full planning workspace (payroll, portfolio, timeline, runway, projections)
create table if not exists public.app_workspace (
  id text primary key,
  updated_at timestamptz not null default now()
);

insert into public.app_workspace (id)
values ('default')
on conflict (id) do nothing;

-- Seed built-in catalogs when empty (safe to re-run)
insert into public.personnel_groups (id, label, short_label, pill_class, dot_class, chart_color, sort_order)
values
  ('researchDevelopment', 'Research development', null, 'bg-[#99f6e4] text-[#134e4a] ring-1 ring-[#99f6e4]/50', 'bg-[#0f766e]', '#0f766e', 0),
  ('projectManagementClinical', 'Project management & clinical coordination', 'PM & clinical coord.', 'bg-[#ddd6fe] text-[#4c1d95] ring-1 ring-[#ddd6fe]/50', 'bg-[#5b21b6]', '#5b21b6', 1),
  ('dataManagement', 'Data management', null, 'bg-[#bfdbfe] text-[#1e3a8a] ring-1 ring-[#bfdbfe]/50', 'bg-[#1d4ed8]', '#1d4ed8', 2),
  ('communityManagement', 'Community management', null, 'bg-[#fed7aa] text-[#7c2d12] ring-1 ring-[#fed7aa]/50', 'bg-[#c2410c]', '#c2410c', 3)
on conflict (id) do nothing;

insert into public.funding_source_types (id, label, pill_class, dot_class, chart_color, sort_order)
values
  ('startup', 'Start-up', 'bg-[#0c2340] text-white ring-1 ring-[#0c2340]/30', 'bg-slate-200', '#0c2340', 0),
  ('projects', 'Projects', 'bg-[#f4a89a] text-[#5c2018] ring-1 ring-[#f4a89a]/50', 'bg-[#b42318]', '#b42318', 1),
  ('endowment', 'Endowment', 'bg-[#9ee0c4] text-[#134d32] ring-1 ring-[#9ee0c4]/50', 'bg-[#047857]', '#047857', 2),
  ('institutional', 'Institutional support', 'bg-[#f5d76e] text-[#5c4a0a] ring-1 ring-[#f5d76e]/50', 'bg-[#a16207]', '#a16207', 3),
  ('largeGrants', 'Large grants', 'bg-[#c4b5fd] text-[#3b2667] ring-1 ring-[#c4b5fd]/50', 'bg-[#6d28d9]', '#6d28d9', 4),
  ('researchPlanReviews', 'Research plan reviews', 'bg-[#93c5fd] text-[#1e3a5f] ring-1 ring-[#93c5fd]/50', 'bg-[#1d4ed8]', '#1d4ed8', 5)
on conflict (id) do nothing;

-- Authenticated-only access. Anonymous clients cannot read/write payroll or roster data.
-- Local-only mode in the app continues to work via browser storage without signing in.
alter table public.funding_source_aliases enable row level security;
alter table public.personnel_groups enable row level security;
alter table public.funding_source_types enable row level security;
alter table public.employee_roster_meta enable row level security;
alter table public.app_workspace enable row level security;

drop policy if exists "funding_source_aliases_select" on public.funding_source_aliases;
drop policy if exists "funding_source_aliases_upsert" on public.funding_source_aliases;
drop policy if exists "funding_source_aliases_update" on public.funding_source_aliases;
drop policy if exists "funding_source_aliases_delete" on public.funding_source_aliases;

create policy "funding_source_aliases_select"
  on public.funding_source_aliases for select to authenticated using (true);
create policy "funding_source_aliases_upsert"
  on public.funding_source_aliases for insert to authenticated with check (true);
create policy "funding_source_aliases_update"
  on public.funding_source_aliases for update to authenticated using (true) with check (true);
create policy "funding_source_aliases_delete"
  on public.funding_source_aliases for delete to authenticated using (true);

drop policy if exists "personnel_groups_select" on public.personnel_groups;
drop policy if exists "personnel_groups_upsert" on public.personnel_groups;
drop policy if exists "personnel_groups_update" on public.personnel_groups;
drop policy if exists "personnel_groups_delete" on public.personnel_groups;

create policy "personnel_groups_select"
  on public.personnel_groups for select to authenticated using (true);
create policy "personnel_groups_upsert"
  on public.personnel_groups for insert to authenticated with check (true);
create policy "personnel_groups_update"
  on public.personnel_groups for update to authenticated using (true) with check (true);
create policy "personnel_groups_delete"
  on public.personnel_groups for delete to authenticated using (true);

drop policy if exists "funding_source_types_select" on public.funding_source_types;
drop policy if exists "funding_source_types_upsert" on public.funding_source_types;
drop policy if exists "funding_source_types_update" on public.funding_source_types;
drop policy if exists "funding_source_types_delete" on public.funding_source_types;

create policy "funding_source_types_select"
  on public.funding_source_types for select to authenticated using (true);
create policy "funding_source_types_upsert"
  on public.funding_source_types for insert to authenticated with check (true);
create policy "funding_source_types_update"
  on public.funding_source_types for update to authenticated using (true) with check (true);
create policy "funding_source_types_delete"
  on public.funding_source_types for delete to authenticated using (true);

drop policy if exists "employee_roster_meta_select" on public.employee_roster_meta;
drop policy if exists "employee_roster_meta_upsert" on public.employee_roster_meta;
drop policy if exists "employee_roster_meta_update" on public.employee_roster_meta;
drop policy if exists "employee_roster_meta_delete" on public.employee_roster_meta;

create policy "employee_roster_meta_select"
  on public.employee_roster_meta for select to authenticated using (true);
create policy "employee_roster_meta_upsert"
  on public.employee_roster_meta for insert to authenticated with check (true);
create policy "employee_roster_meta_update"
  on public.employee_roster_meta for update to authenticated using (true) with check (true);
create policy "employee_roster_meta_delete"
  on public.employee_roster_meta for delete to authenticated using (true);

drop policy if exists "app_workspace_select" on public.app_workspace;
drop policy if exists "app_workspace_upsert" on public.app_workspace;
drop policy if exists "app_workspace_update" on public.app_workspace;
drop policy if exists "app_workspace_delete" on public.app_workspace;

create policy "app_workspace_select"
  on public.app_workspace for select to authenticated using (true);
create policy "app_workspace_upsert"
  on public.app_workspace for insert to authenticated with check (true);
create policy "app_workspace_update"
  on public.app_workspace for update to authenticated using (true) with check (true);
create policy "app_workspace_delete"
  on public.app_workspace for delete to authenticated using (true);

-- Storage: authenticated only (drop legacy public/anon policies)
drop policy if exists "employee_photos_public_read" on storage.objects;
drop policy if exists "employee_photos_anon_write" on storage.objects;
drop policy if exists "employee_photos_anon_update" on storage.objects;
drop policy if exists "employee_photos_anon_delete" on storage.objects;
drop policy if exists "employee_photos_auth_read" on storage.objects;
drop policy if exists "employee_photos_auth_write" on storage.objects;
drop policy if exists "employee_photos_auth_update" on storage.objects;
drop policy if exists "employee_photos_auth_delete" on storage.objects;

create policy "employee_photos_auth_read"
  on storage.objects for select to authenticated
  using (bucket_id = 'employee-photos');

create policy "employee_photos_auth_write"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'employee-photos');

create policy "employee_photos_auth_update"
  on storage.objects for update to authenticated
  using (bucket_id = 'employee-photos')
  with check (bucket_id = 'employee-photos');

create policy "employee_photos_auth_delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'employee-photos');

drop policy if exists "employee_offer_letters_public_read" on storage.objects;
drop policy if exists "employee_offer_letters_anon_write" on storage.objects;
drop policy if exists "employee_offer_letters_anon_update" on storage.objects;
drop policy if exists "employee_offer_letters_anon_delete" on storage.objects;
drop policy if exists "employee_offer_letters_auth_read" on storage.objects;
drop policy if exists "employee_offer_letters_auth_write" on storage.objects;
drop policy if exists "employee_offer_letters_auth_update" on storage.objects;
drop policy if exists "employee_offer_letters_auth_delete" on storage.objects;

create policy "employee_offer_letters_auth_read"
  on storage.objects for select to authenticated
  using (bucket_id = 'employee-offer-letters');

create policy "employee_offer_letters_auth_write"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'employee-offer-letters');

create policy "employee_offer_letters_auth_update"
  on storage.objects for update to authenticated
  using (bucket_id = 'employee-offer-letters')
  with check (bucket_id = 'employee-offer-letters');

create policy "employee_offer_letters_auth_delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'employee-offer-letters');

drop policy if exists "app_workspace_public_read" on storage.objects;
drop policy if exists "app_workspace_anon_write" on storage.objects;
drop policy if exists "app_workspace_anon_update" on storage.objects;
drop policy if exists "app_workspace_anon_delete" on storage.objects;
drop policy if exists "app_workspace_auth_read" on storage.objects;
drop policy if exists "app_workspace_auth_write" on storage.objects;
drop policy if exists "app_workspace_auth_update" on storage.objects;
drop policy if exists "app_workspace_auth_delete" on storage.objects;

create policy "app_workspace_auth_read"
  on storage.objects for select to authenticated
  using (bucket_id = 'app-workspace');

create policy "app_workspace_auth_write"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'app-workspace');

create policy "app_workspace_auth_update"
  on storage.objects for update to authenticated
  using (bucket_id = 'app-workspace')
  with check (bucket_id = 'app-workspace');

create policy "app_workspace_auth_delete"
  on storage.objects for delete to authenticated
  using (bucket_id = 'app-workspace');

