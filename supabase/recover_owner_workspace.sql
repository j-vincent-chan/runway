-- Move root workspace.json → this account's private path.
-- Auth already links vincent.chan@ucsf.edu ↔ d02960a2-e4f3-43f1-9c09-062805e59c91
-- Run this once in Supabase → SQL Editor, then hard-refresh and sign in.

-- Sanity check
select id, email
from auth.users
where id = 'd02960a2-e4f3-43f1-9c09-062805e59c91';

select name, created_at
from storage.objects
where bucket_id = 'app-workspace'
order by name;

-- Move the root file into the user folder (creates the UUID "folder")
update storage.objects
set
  name = 'd02960a2-e4f3-43f1-9c09-062805e59c91/workspace.json',
  owner = 'd02960a2-e4f3-43f1-9c09-062805e59c91',
  owner_id = 'd02960a2-e4f3-43f1-9c09-062805e59c91'
where bucket_id = 'app-workspace'
  and name = 'workspace.json';

-- Workspace metadata row
insert into public.app_workspace (user_id, updated_at)
values ('d02960a2-e4f3-43f1-9c09-062805e59c91', now())
on conflict (user_id) do update set updated_at = excluded.updated_at;

-- Confirm
select name, owner_id, created_at
from storage.objects
where bucket_id = 'app-workspace'
order by name;
