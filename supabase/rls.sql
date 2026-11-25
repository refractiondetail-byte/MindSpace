-- MindSpace per-user data isolation (RLS readiness)
-- Run in Supabase SQL editor after creating tables.

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
create policy "items owner read" on public.items for select using (user_id = auth.uid());
create policy "items owner write" on public.items for insert with check (user_id = auth.uid());
create policy "items owner update" on public.items for update using (user_id = auth.uid());
create policy "items owner delete" on public.items for delete using (user_id = auth.uid());

-- Note versions
create table if not exists public.note_versions (
  id text primary key default gen_random_uuid()::text,
  node_id text not null,
  user_id uuid references auth.users(id) on delete cascade,
  version jsonb not null,
  created_at timestamptz default now()
);

alter table public.note_versions enable row level security;
create policy "note_versions owner read" on public.note_versions for select using (user_id = auth.uid());
create policy "note_versions owner write" on public.note_versions for insert with check (user_id = auth.uid());

-- Storage bucket: scope paths by user id (e.g. {user_id}/file.jpg) and add storage policies.