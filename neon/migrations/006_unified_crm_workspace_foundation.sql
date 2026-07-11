create table if not exists workspace_views (
  id uuid primary key default gen_random_uuid(),
  profile_id text not null references profiles(id) on delete cascade,
  object_type text not null check (object_type in ('account', 'relationship')),
  name text not null,
  config jsonb not null default '{}'::jsonb,
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (profile_id, object_type, name)
);

create table if not exists workspace_favorites (
  id uuid primary key default gen_random_uuid(),
  profile_id text not null references profiles(id) on delete cascade,
  kind text not null check (kind in ('view', 'account', 'search')),
  label text not null,
  href text not null,
  view_id uuid references workspace_views(id) on delete cascade,
  account_id uuid references accounts(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (profile_id, kind, href)
);

create index if not exists workspace_views_profile_object_idx
  on workspace_views(profile_id, object_type, updated_at desc);
create index if not exists workspace_favorites_profile_idx
  on workspace_favorites(profile_id, created_at desc);
