-- Per-user MCP connector tokens. Only a SHA-256 hash is stored; the raw `fmcp_...` value is
-- shown once at creation and never persisted, so a database read cannot mint a working token.
-- Tokens are personal: every MCP read reuses the owner's capability and row scope, so a token
-- can never widen what the signed-in user can already see.
create table if not exists mcp_access_tokens (
  id uuid primary key default gen_random_uuid(),
  profile_id text not null references profiles(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  token_prefix text not null check (token_prefix ~ '^fmcp_[0-9a-f]{8}$'),
  token_hash text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  scopes text[] not null default '{read}' check (
    scopes <@ array['read','write']::text[] and cardinality(scopes) > 0
  ),
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  expires_at timestamptz,
  revoked_at timestamptz,
  constraint mcp_access_tokens_expires_at_check check (expires_at is null or expires_at > created_at)
);
create unique index if not exists mcp_access_tokens_token_hash_uidx
  on mcp_access_tokens(token_hash);
create index if not exists mcp_access_tokens_profile_idx
  on mcp_access_tokens(profile_id, created_at desc);

-- Tool-call audit trail: which tool ran for whom, with what outcome and how long it took. Tool
-- arguments and results are deliberately absent because they carry client PII. `profile_id` is
-- nullable on purpose: the audit row outlives the profile and the token, so deleting either
-- must not erase the record of what the connector did.
create table if not exists mcp_tool_calls (
  id uuid primary key default gen_random_uuid(),
  token_id uuid references mcp_access_tokens(id) on delete set null,
  profile_id text references profiles(id) on delete set null,
  tool text not null check (char_length(tool) between 1 and 80),
  status text not null check (status in ('ok','error')),
  error_code text,
  duration_ms integer check (duration_ms >= 0),
  created_at timestamptz not null default now()
);
create index if not exists mcp_tool_calls_profile_idx on mcp_tool_calls(profile_id, created_at desc);
create index if not exists mcp_tool_calls_token_idx on mcp_tool_calls(token_id, created_at desc);

-- Match 022/027/028: server/operator access only; no browser policies or grants.
alter table mcp_access_tokens enable row level security;
revoke all on table mcp_access_tokens from public;
alter table mcp_tool_calls enable row level security;
revoke all on table mcp_tool_calls from public;
