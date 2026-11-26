-- MindSpace per-user data isolation (RLS readiness)
--
-- Idempotent: safe to re-run in the Supabase SQL editor.
-- Earlier revisions were NOT idempotent (`create policy` without a preceding
-- `drop policy if exists` errors with 42710 "policy already exists"), so a
-- second run aborted partway through and left later objects — notably
-- public.note_versions — uncreated. PostgREST then answers the client's
-- `select=version&node_id=eq…&order=created_at.desc` with 400.

-- Items (if you store individual items instead of galaxy JSON state)
create table if not exists public.items (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade,
  title text,
  content text,
  topic text,
  topic_color text,
  summary text,
  distilled_note text,
  extracted_text text,
  entry_type text,
  parent_id text,
  related_ids text[],
  storage_path text,
  created_at timestamptz default now()
);

alter table public.items enable row level security;
drop policy if exists "items owner read" on public.items;
create policy "items owner read" on public.items for select using (user_id = auth.uid());
drop policy if exists "items owner write" on public.items;
create policy "items owner write" on public.items for insert with check (user_id = auth.uid());
drop policy if exists "items owner update" on public.items;
create policy "items owner update" on public.items for update using (user_id = auth.uid());
drop policy if exists "items owner delete" on public.items;
create policy "items owner delete" on public.items for delete using (user_id = auth.uid());

-- Note versions
-- Required by src/lib/noteVersions.ts:
--   insert { id, node_id, user_id, version, created_at }
--   select version where node_id = ? [and user_id = ?] order by created_at desc
create table if not exists public.note_versions (
  id text primary key default gen_random_uuid()::text,
  node_id text not null,
  user_id uuid references auth.users(id) on delete cascade,
  version jsonb not null,
  created_at timestamptz not null default now()
);

-- Heal a table created by an older/partial run. PostgREST rejects a query that
-- references a column the table does not have with 400 (SQLSTATE 42703), so
-- every column the client touches must exist.
alter table public.note_versions add column if not exists id text default gen_random_uuid()::text;
alter table public.note_versions add column if not exists node_id text;
alter table public.note_versions add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.note_versions add column if not exists version jsonb;
alter table public.note_versions add column if not exists created_at timestamptz not null default now();

create index if not exists note_versions_node_created_idx
  on public.note_versions (node_id, created_at desc);

alter table public.note_versions enable row level security;
drop policy if exists "note_versions owner read" on public.note_versions;
create policy "note_versions owner read" on public.note_versions for select using (user_id = auth.uid());
drop policy if exists "note_versions owner write" on public.note_versions;
create policy "note_versions owner write" on public.note_versions for insert with check (user_id = auth.uid());

-- PostgREST runs as the caller's role; without these grants the API answers
-- 401/403 even when RLS policies are correct.
grant select, insert, update, delete on public.note_versions to authenticated;

-- Storage bucket: scope paths by user id (e.g. {user_id}/file.jpg) and add storage policies.
