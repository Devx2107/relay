create table if not exists public.user_settings (
  user_id uuid primary key references public.users(id) on delete cascade,
  vip_contacts text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_settings enable row level security;

create policy "Users can read own settings"
  on public.user_settings for select
  using ( auth.uid() = user_id );

create policy "Users can insert own settings"
  on public.user_settings for insert
  with check ( auth.uid() = user_id );

create policy "Users can update own settings"
  on public.user_settings for update
  using ( auth.uid() = user_id )
  with check ( auth.uid() = user_id );
