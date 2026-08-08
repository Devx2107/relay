-- Corsair 0.1.x persistence tables.
-- These shapes mirror the installed Corsair SDK row contract.

create table if not exists public.corsair_integrations (
  id text primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  name text not null unique,
  config jsonb not null default '{}'::jsonb,
  dek text
);

create table if not exists public.corsair_accounts (
  id text primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  tenant_id text not null,
  integration_id text not null references public.corsair_integrations(id) on delete cascade,
  config jsonb not null default '{}'::jsonb,
  dek text,
  unique (tenant_id, integration_id)
);

create table if not exists public.corsair_entities (
  id text primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  account_id text not null references public.corsair_accounts(id) on delete cascade,
  entity_id text not null,
  entity_type text not null,
  version text not null,
  data jsonb not null default '{}'::jsonb,
  unique (account_id, entity_type, entity_id)
);

create table if not exists public.corsair_events (
  id text primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  account_id text not null references public.corsair_accounts(id) on delete cascade,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  status text check (status in ('pending', 'processing', 'completed', 'failed'))
);

create table if not exists public.corsair_permissions (
  id text primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  token text not null unique,
  plugin text not null,
  endpoint text not null,
  args text not null,
  tenant_id text not null default 'default',
  status text not null default 'pending' check (status in ('pending', 'approved', 'executing', 'completed', 'denied', 'expired', 'failed')),
  -- Corsair's SDK contract declares this field as an ISO string.
  expires_at text not null,
  error text
);

create index if not exists corsair_accounts_tenant_id_idx
  on public.corsair_accounts (tenant_id);

create index if not exists corsair_entities_account_scope_idx
  on public.corsair_entities (account_id, entity_type);

create index if not exists corsair_events_account_status_idx
  on public.corsair_events (account_id, status);

create index if not exists corsair_permissions_tenant_status_idx
  on public.corsair_permissions (tenant_id, status);

-- Corsair credentials and cached integration data are server-managed. Keep the
-- tables inaccessible through the Supabase client API until authenticated,
-- user-scoped access policies are designed in a later foundation task.
alter table public.corsair_integrations enable row level security;
alter table public.corsair_accounts enable row level security;
alter table public.corsair_entities enable row level security;
alter table public.corsair_events enable row level security;
alter table public.corsair_permissions enable row level security;
