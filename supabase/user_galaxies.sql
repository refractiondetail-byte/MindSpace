create table if not exists public.user_galaxies (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_galaxies enable row level security;

create policy "Users can read their own galaxy"
  on public.user_galaxies for select
  using (auth.uid() = user_id);

create policy "Users can insert their own galaxy"
  on public.user_galaxies for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own galaxy"
  on public.user_galaxies for update
  using (auth.uid() = user_id);
