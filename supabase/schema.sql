-- Runway cloud persistence (per-user isolation)
-- Re-run this entire script in the Supabase SQL Editor after pulling.
--
-- Each signed-in user gets their own workspace, aliases, catalogs, roster, and files.
-- Rows/files from the old shared "default" lab model are not visible under the new RLS;
-- re-upload or rely on browser local data if you still need them.

-- ---------------------------------------------------------------------------
-- Tables (create if missing — fresh installs)
-- ---------------------------------------------------------------------------

create table if not exists public.funding_source_aliases (
  user_id uuid not null references auth.users (id) on delete cascade,
  chartstring_key text not null,
  alias text not null,
  notes text,
  color text,
  updated_at timestamptz not null default now(),
  primary key (user_id, chartstring_key)
);

create table if not exists public.personnel_groups (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  label text not null,
  short_label text,
  pill_class text not null,
  dot_class text not null,
  chart_color text not null,
  sort_order int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.funding_source_types (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  label text not null,
  pill_class text not null,
  dot_class text not null,
  chart_color text not null,
  sort_order int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.employee_roster_meta (
  user_id uuid not null references auth.users (id) on delete cascade,
  person_key text not null,
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
  updated_at timestamptz not null default now(),
  primary key (user_id, person_key)
);

create table if not exists public.app_workspace (
  user_id uuid not null references auth.users (id) on delete cascade primary key,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Migrate legacy shared tables → per-user shape
-- (no-ops when tables already have the new primary keys)
-- ---------------------------------------------------------------------------

do $$
begin
  -- funding_source_aliases
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'funding_source_aliases'
      and column_name = 'chartstring_key'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'funding_source_aliases'
      and column_name = 'user_id'
  ) then
    alter table public.funding_source_aliases
      add column user_id uuid references auth.users (id) on delete cascade;
    delete from public.funding_source_aliases where user_id is null;
    alter table public.funding_source_aliases alter column user_id set not null;
    alter table public.funding_source_aliases drop constraint if exists funding_source_aliases_pkey;
    alter table public.funding_source_aliases
      add primary key (user_id, chartstring_key);
  end if;

  -- personnel_groups
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'personnel_groups'
      and column_name = 'id'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'personnel_groups'
      and column_name = 'user_id'
  ) then
    alter table public.personnel_groups
      add column user_id uuid references auth.users (id) on delete cascade;
    delete from public.personnel_groups where user_id is null;
    alter table public.personnel_groups alter column user_id set not null;
    alter table public.personnel_groups drop constraint if exists personnel_groups_pkey;
    alter table public.personnel_groups add primary key (user_id, id);
  end if;

  -- funding_source_types
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'funding_source_types'
      and column_name = 'id'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'funding_source_types'
      and column_name = 'user_id'
  ) then
    alter table public.funding_source_types
      add column user_id uuid references auth.users (id) on delete cascade;
    delete from public.funding_source_types where user_id is null;
    alter table public.funding_source_types alter column user_id set not null;
    alter table public.funding_source_types drop constraint if exists funding_source_types_pkey;
    alter table public.funding_source_types add primary key (user_id, id);
  end if;

  -- employee_roster_meta
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'employee_roster_meta'
      and column_name = 'person_key'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'employee_roster_meta'
      and column_name = 'user_id'
  ) then
    alter table public.employee_roster_meta
      add column user_id uuid references auth.users (id) on delete cascade;
    delete from public.employee_roster_meta where user_id is null;
    alter table public.employee_roster_meta alter column user_id set not null;
    alter table public.employee_roster_meta drop constraint if exists employee_roster_meta_pkey;
    alter table public.employee_roster_meta add primary key (user_id, person_key);
  end if;

  -- app_workspace: id text 'default' → user_id uuid PK
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'app_workspace'
      and column_name = 'id'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'app_workspace'
      and column_name = 'user_id'
  ) then
    delete from public.app_workspace;
    alter table public.app_workspace drop constraint if exists app_workspace_pkey;
    alter table public.app_workspace drop column id;
    alter table public.app_workspace
      add column user_id uuid not null references auth.users (id) on delete cascade primary key;
  end if;
end $$;

alter table public.employee_roster_meta add column if not exists photo_path text;
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

-- Private Storage buckets
insert into storage.buckets (id, name, public)
values ('employee-photos', 'employee-photos', false)
on conflict (id) do update set public = excluded.public;

insert into storage.buckets (id, name, public)
values ('employee-offer-letters', 'employee-offer-letters', false)
on conflict (id) do update set public = excluded.public;

insert into storage.buckets (id, name, public)
values ('app-workspace', 'app-workspace', false)
on conflict (id) do update set public = excluded.public;

-- ---------------------------------------------------------------------------
-- RLS: owner-only (auth.uid() = user_id)
-- ---------------------------------------------------------------------------

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
  on public.funding_source_aliases for select to authenticated
  using (user_id = auth.uid());
create policy "funding_source_aliases_upsert"
  on public.funding_source_aliases for insert to authenticated
  with check (user_id = auth.uid());
create policy "funding_source_aliases_update"
  on public.funding_source_aliases for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "funding_source_aliases_delete"
  on public.funding_source_aliases for delete to authenticated
  using (user_id = auth.uid());

drop policy if exists "personnel_groups_select" on public.personnel_groups;
drop policy if exists "personnel_groups_upsert" on public.personnel_groups;
drop policy if exists "personnel_groups_update" on public.personnel_groups;
drop policy if exists "personnel_groups_delete" on public.personnel_groups;

create policy "personnel_groups_select"
  on public.personnel_groups for select to authenticated
  using (user_id = auth.uid());
create policy "personnel_groups_upsert"
  on public.personnel_groups for insert to authenticated
  with check (user_id = auth.uid());
create policy "personnel_groups_update"
  on public.personnel_groups for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "personnel_groups_delete"
  on public.personnel_groups for delete to authenticated
  using (user_id = auth.uid());

drop policy if exists "funding_source_types_select" on public.funding_source_types;
drop policy if exists "funding_source_types_upsert" on public.funding_source_types;
drop policy if exists "funding_source_types_update" on public.funding_source_types;
drop policy if exists "funding_source_types_delete" on public.funding_source_types;

create policy "funding_source_types_select"
  on public.funding_source_types for select to authenticated
  using (user_id = auth.uid());
create policy "funding_source_types_upsert"
  on public.funding_source_types for insert to authenticated
  with check (user_id = auth.uid());
create policy "funding_source_types_update"
  on public.funding_source_types for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "funding_source_types_delete"
  on public.funding_source_types for delete to authenticated
  using (user_id = auth.uid());

drop policy if exists "employee_roster_meta_select" on public.employee_roster_meta;
drop policy if exists "employee_roster_meta_upsert" on public.employee_roster_meta;
drop policy if exists "employee_roster_meta_update" on public.employee_roster_meta;
drop policy if exists "employee_roster_meta_delete" on public.employee_roster_meta;

create policy "employee_roster_meta_select"
  on public.employee_roster_meta for select to authenticated
  using (user_id = auth.uid());
create policy "employee_roster_meta_upsert"
  on public.employee_roster_meta for insert to authenticated
  with check (user_id = auth.uid());
create policy "employee_roster_meta_update"
  on public.employee_roster_meta for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "employee_roster_meta_delete"
  on public.employee_roster_meta for delete to authenticated
  using (user_id = auth.uid());

drop policy if exists "app_workspace_select" on public.app_workspace;
drop policy if exists "app_workspace_upsert" on public.app_workspace;
drop policy if exists "app_workspace_update" on public.app_workspace;
drop policy if exists "app_workspace_delete" on public.app_workspace;

create policy "app_workspace_select"
  on public.app_workspace for select to authenticated
  using (user_id = auth.uid());
create policy "app_workspace_upsert"
  on public.app_workspace for insert to authenticated
  with check (user_id = auth.uid());
create policy "app_workspace_update"
  on public.app_workspace for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "app_workspace_delete"
  on public.app_workspace for delete to authenticated
  using (user_id = auth.uid());

-- Storage: first path folder must be the user's uuid
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
  using (
    bucket_id = 'employee-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "employee_photos_auth_write"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'employee-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "employee_photos_auth_update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'employee-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'employee-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "employee_photos_auth_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'employee-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

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
  using (
    bucket_id = 'employee-offer-letters'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "employee_offer_letters_auth_write"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'employee-offer-letters'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "employee_offer_letters_auth_update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'employee-offer-letters'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'employee-offer-letters'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "employee_offer_letters_auth_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'employee-offer-letters'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

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
  using (
    bucket_id = 'app-workspace'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "app_workspace_auth_write"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'app-workspace'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "app_workspace_auth_update"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'app-workspace'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'app-workspace'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
create policy "app_workspace_auth_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'app-workspace'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Lab owner may claim pre-auth shared files once (then remove them)
drop policy if exists "app_workspace_claim_legacy_read" on storage.objects;
drop policy if exists "app_workspace_claim_legacy_delete" on storage.objects;

create policy "app_workspace_claim_legacy_read"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'app-workspace'
    and name in ('default.json', 'workspace.json')
    and lower(coalesce(auth.jwt() ->> 'email', '')) = 'vincent.chan@ucsf.edu'
  );

create policy "app_workspace_claim_legacy_delete"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'app-workspace'
    and name in ('default.json', 'workspace.json')
    and lower(coalesce(auth.jwt() ->> 'email', '')) = 'vincent.chan@ucsf.edu'
  );
