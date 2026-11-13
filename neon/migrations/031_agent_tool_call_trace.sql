-- B1: unified agent tool-call trace.
--
-- `agent_tool_calls` already exists from migration 001 (agent_run_id, tool_name, input_params,
-- output_result, success, error_message, called_at). This migration adds the correlation evidence
-- the B1 trace writer records: which MCP audit row the call belongs to, how long it took, its
-- status/error code, a digest plus the top-level key names and target ids of its arguments, and
-- which agent surface produced it.
--
-- `input_params`/`output_result` are intentionally left untouched and are never written: the
-- whole point is that arguments and results (client PII) do not land in the trace table. The
-- digest is correlation evidence, not confidentiality: it proves two calls carried the same
-- arguments without storing them, and cannot be reversed.
--
-- Columns are added with `if not exists`, so a replay of this file is a no-op. No link-XOR or
-- not-null constraint is added: MCP calls have an `mcp_tool_call_id` but no agent run, governed
-- AI calls have an `agent_run_id` but no MCP row, and n8n rows may have neither yet.

alter table agent_tool_calls
  add column if not exists mcp_tool_call_id uuid references mcp_tool_calls(id) on delete set null,
  add column if not exists duration_ms integer check (duration_ms is null or duration_ms >= 0),
  add column if not exists status text check (status is null or status in ('ok','error')),
  add column if not exists error_code text
    check (error_code is null or char_length(error_code) <= 64),
  add column if not exists args_digest text
    check (args_digest is null or args_digest ~ '^[0-9a-f]{64}$'),
  add column if not exists args_keys text[],
  add column if not exists target_ids uuid[],
  add column if not exists source text
    check (source is null or source in ('mcp','governed_ai','n8n_dispatch','n8n_writeback'));

-- Per-call lookup (MCP row <-> trace row) and the newest-first incident timeline.
create index if not exists agent_tool_calls_mcp_tool_call_id_idx
  on agent_tool_calls(mcp_tool_call_id);
create index if not exists agent_tool_calls_called_at_idx
  on agent_tool_calls(called_at desc);

-- Match 022/027/028/029: server/operator access only; no browser policies or grants.
alter table agent_tool_calls enable row level security;
revoke all on table agent_tool_calls from public;
