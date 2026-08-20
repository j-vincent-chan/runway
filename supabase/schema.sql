-- Runway / payroll-funding-planner cloud persistence
-- Run this in the Supabase SQL Editor (Project → SQL → New query).

-- Chartstring friendly names (aliases)
create table if not exists public.funding_source_aliases (
  chartstring_key text primary key,
  alias text not null,
  notes text,
  color text,
  updated_at timestamptz not null default now()
);

-- People roster extras keyed by stable person_key (hr:<id> or name:<normalized>)
create table if not exists public.employee_roster_meta (
  person_key text primary key,
  display_name text,
  photo_url text,
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

-- Optional files for employee photos and offer letters
insert into storage.buckets (id, name, public)
values ('employee-photos', 'employee-photos', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('employee-offer-letters', 'employee-offer-letters', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('app-workspace', 'app-workspace', true)
on conflict (id) do nothing;

-- Full planning workspace (payroll, portfolio, timeline, runway, projections)
create table if not exists public.app_workspace (
  id text primary key,
  updated_at timestamptz not null default now()
);

insert into public.app_workspace (id)
values ('default')
on conflict (id) do nothing;

-- Lab tool defaults: allow anon read/write. Tighten with auth later if needed.
alter table public.funding_source_aliases enable row level security;
alter table public.employee_roster_meta enable row level security;
alter table public.app_workspace enable row level security;

drop policy if exists "funding_source_aliases_select" on public.funding_source_aliases;
drop policy if exists "funding_source_aliases_upsert" on public.funding_source_aliases;
drop policy if exists "funding_source_aliases_update" on public.funding_source_aliases;
drop policy if exists "funding_source_aliases_delete" on public.funding_source_aliases;

create policy "funding_source_aliases_select"
  on public.funding_source_aliases for select to anon, authenticated using (true);
create policy "funding_source_aliases_upsert"
  on public.funding_source_aliases for insert to anon, authenticated with check (true);
create policy "funding_source_aliases_update"
  on public.funding_source_aliases for update to anon, authenticated using (true) with check (true);
create policy "funding_source_aliases_delete"
  on public.funding_source_aliases for delete to anon, authenticated using (true);

drop policy if exists "employee_roster_meta_select" on public.employee_roster_meta;
drop policy if exists "employee_roster_meta_upsert" on public.employee_roster_meta;
drop policy if exists "employee_roster_meta_update" on public.employee_roster_meta;
drop policy if exists "employee_roster_meta_delete" on public.employee_roster_meta;

create policy "employee_roster_meta_select"
  on public.employee_roster_meta for select to anon, authenticated using (true);
create policy "employee_roster_meta_upsert"
  on public.employee_roster_meta for insert to anon, authenticated with check (true);
create policy "employee_roster_meta_update"
  on public.employee_roster_meta for update to anon, authenticated using (true) with check (true);
create policy "employee_roster_meta_delete"
  on public.employee_roster_meta for delete to anon, authenticated using (true);

drop policy if exists "app_workspace_select" on public.app_workspace;
drop policy if exists "app_workspace_upsert" on public.app_workspace;
drop policy if exists "app_workspace_update" on public.app_workspace;
drop policy if exists "app_workspace_delete" on public.app_workspace;

create policy "app_workspace_select"
  on public.app_workspace for select to anon, authenticated using (true);
create policy "app_workspace_upsert"
  on public.app_workspace for insert to anon, authenticated with check (true);
create policy "app_workspace_update"
  on public.app_workspace for update to anon, authenticated using (true) with check (true);
create policy "app_workspace_delete"
  on public.app_workspace for delete to anon, authenticated using (true);

drop policy if exists "employee_photos_public_read" on storage.objects;
drop policy if exists "employee_photos_anon_write" on storage.objects;
drop policy if exists "employee_photos_anon_update" on storage.objects;
drop policy if exists "employee_photos_anon_delete" on storage.objects;

create policy "employee_photos_public_read"
  on storage.objects for select to public
  using (bucket_id = 'employee-photos');

create policy "employee_photos_anon_write"
  on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'employee-photos');

create policy "employee_photos_anon_update"
  on storage.objects for update to anon, authenticated
  using (bucket_id = 'employee-photos')
  with check (bucket_id = 'employee-photos');

create policy "employee_photos_anon_delete"
  on storage.objects for delete to anon, authenticated
  using (bucket_id = 'employee-photos');

drop policy if exists "employee_offer_letters_public_read" on storage.objects;
drop policy if exists "employee_offer_letters_anon_write" on storage.objects;
drop policy if exists "employee_offer_letters_anon_update" on storage.objects;
drop policy if exists "employee_offer_letters_anon_delete" on storage.objects;

create policy "employee_offer_letters_public_read"
  on storage.objects for select to public
  using (bucket_id = 'employee-offer-letters');

create policy "employee_offer_letters_anon_write"
  on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'employee-offer-letters');

create policy "employee_offer_letters_anon_update"
  on storage.objects for update to anon, authenticated
  using (bucket_id = 'employee-offer-letters')
  with check (bucket_id = 'employee-offer-letters');

create policy "employee_offer_letters_anon_delete"
  on storage.objects for delete to anon, authenticated
  using (bucket_id = 'employee-offer-letters');

drop policy if exists "app_workspace_public_read" on storage.objects;
drop policy if exists "app_workspace_anon_write" on storage.objects;
drop policy if exists "app_workspace_anon_update" on storage.objects;
drop policy if exists "app_workspace_anon_delete" on storage.objects;

create policy "app_workspace_public_read"
  on storage.objects for select to public
  using (bucket_id = 'app-workspace');

create policy "app_workspace_anon_write"
  on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'app-workspace');

create policy "app_workspace_anon_update"
  on storage.objects for update to anon, authenticated
  using (bucket_id = 'app-workspace')
  with check (bucket_id = 'app-workspace');

create policy "app_workspace_anon_delete"
  on storage.objects for delete to anon, authenticated
  using (bucket_id = 'app-workspace');
