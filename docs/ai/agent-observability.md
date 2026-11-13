# Agent observability (trace writer and approval SLA)

Status: Tranche B1 shipped in PR #187; n8n boundary tracing is the follow-up on
`feat/n8n-tool-call-traces` (pending review).
Audience: engineering, operations, security review.

This is the B1 half of the governed-action tranche: the evidence layer behind
[governed write proposals](mcp-write-proposals.md). Two independently useful pieces:

1. **A unified agent tool-call trace** — every tool/input the CRM can actually observe is written
   to `agent_tool_calls`, with a redacted argument digest, duration and outcome, linked to the
   MCP audit row or the governed agent run.
2. **An approval SLA escalation writer** — a token-guarded, n8n-scheduled sweep that marks
   overdue approvals and notifies the approver roster, so the existing 4-hour chip becomes a
   measured queue instead of a static countdown.

## Tool-call trace

### What is traced honestly

| Source | What is recorded | Link |
| --- | --- | --- |
| MCP `tools/call` | one row per call: tool name, `ok`/`error`, error code, duration, argument digest/keys/target ids | `mcp_tool_call_id` → `mcp_tool_calls.id` |
| Governed AI invocation (`invokeGovernedAI`: note tidy now, assistant later) | one row per invocation: workflow type, outcome, duration, input digest | `agent_run_id` → `agent_runs.id` |
| n8n dispatch | one row per HTTP dispatch attempt: acceptance or safe failure, duration and routing-metadata digest | `agent_run_id` → `agent_runs.id` |
| n8n writeback | one row per server-bound callback delivery, including replay, invalid-output receipts and transaction failures; no raw model content | `agent_run_id` → `agent_runs.id` |

This is deliberately not a claim that every LLM/tool step inside n8n is audited; it is not. The
roadmap and this document say so.

### Fields added to `agent_tool_calls` (migration 031)

- `mcp_tool_call_id` — FK to the authoritative MCP audit row (`on delete set null`).
- `duration_ms` — non-negative integer.
- `status` (`ok`/`error`) and `error_code` (bounded text) — parity with `mcp_tool_calls`.
- `args_digest` (64 lowercase hex), `args_keys text[]`, `target_ids uuid[]` — redacted argument
  evidence.
- `source` — `mcp`, `governed_ai`, `n8n_dispatch`, `n8n_writeback`.
- Index on `(mcp_tool_call_id)` and `(called_at desc)`; RLS enabled with no policies (server-only,
  same as the MCP tables).

`input_params`/`output_result` remain present but are **never written**: raw arguments and
results are not stored.

### Argument digest policy

`args_digest = sha256("v1|" + source + "|" + toolName + "|" + canonicalJson(args))`, where
canonical JSON sorts object keys recursively and preserves array order. `args_keys` stores up to
20 sanitized top-level key names; `target_ids` extracts UUIDs from `id`/`*_id` keys.

The digest is **correlation evidence, not confidentiality**: identical calls correlate, but small
or enumerable argument values are guessable offline from the hash. If argument secrecy is ever
required, switch to HMAC-SHA256 with a server secret (operator-approved env var) — out of scope
for B1.

### Write semantics

Trace writes are best-effort, awaited, and never change the tool response or the authoritative
audit row. A failed trace insert is logged by error name only. `mcp_tool_calls` remains the
authoritative security audit; `agent_tool_calls` is the cross-source observability index.

For n8n, the digest covers only routing metadata: server-selected workflow/run id and UUID
subject/attempt ids. `args_keys` contains only those allowlisted keys. It does not fingerprint
model text, callback output, token values, webhook URLs or arbitrary payload keys. HTTP success
means the dispatch was accepted; it does not establish that the external workflow completed.

Callbacks are checked against the locked run's workflow and subject before attribution; any
supplied attempt id must also match. Legacy callbacks without an attempt id retain their existing
compatibility and are attributed to the locked run. An unknown run or mismatched identity produces
no attributed trace. Evidence is written after the
business transaction commits or rolls back; invalid-output rejection receipts therefore retain
an error trace. Retries receive another delivery-attempt row, while the existing idempotency
checks still prevent another business effect. A trace count is a count of attempts, not a count
of unique workflow completions. Durations measure CRM HTTP/callback handling, not n8n model
execution time.

All six CRM agent dispatch sites share `dispatchAgentWorkflow`; invitation-email HTTP calls
remain outside agent tracing. For an invocation using `invokeGovernedAI` with `kind='n8n'`,
that invocation owns its dispatch trace and its `execute` callback must use the raw transport,
not the already-traced helper. Policy-denied and duplicate invocations execute nothing and
produce no dispatch trace.

Example queries:

```sql
-- what did this MCP token do recently?
select c.called_at, c.tool_name, c.status, c.duration_ms, c.args_digest
from agent_tool_calls c
join mcp_tool_calls m on m.id = c.mcp_tool_call_id
where m.token_id = $1
order by c.called_at desc
limit 200;

-- every traced step of a governed run
select called_at, source, tool_name, status, duration_ms, args_keys, target_ids
from agent_tool_calls
where agent_run_id = $1
order by called_at;

-- correlation of a suspicious argument set (same digest, any caller)
select source, tool_name, count(*), min(called_at), max(called_at)
from agent_tool_calls
where args_digest = $1
group by 1, 2;
```

## Approval SLA escalation

### Semantics

- Threshold: **4 hours** (`SLA_HOURS` in `src/lib/approval-sla.ts`), measured from
  `human_approvals.created_at`.
- The writer sets `human_approvals.sla_escalated_at` once. It does **not** change `status`:
  `escalated` already means a human requested changes, and auto-changing it would both overload
  that meaning and strand `quote_send`/`agent_action` rows. Pending rows remain decidable by the
  normal path.
- One `activity_logs` row per escalated approval (`actor_type='agent'`, actor `system:approval-sla`)
  and one `notifications` row of type `approval_escalated` per active approver, excluding the
  proposal's own author. Dedupe key `approval_escalated:<approval>:<user>` makes reruns harmless.
- `assigned_to` is never changed: assignment narrows who may decide.
- Rerun-safe by construction: `status='pending' and sla_escalated_at is null` is the claim
  predicate, with `FOR UPDATE SKIP LOCKED` batches in one transaction each.

### Trigger and gates

There is no Vercel cron in this repo. Scheduled work is driven by n8n Schedule Trigger
(`n8n/workflows/clientops-approval-sla.json`, every 15 minutes) posting to the token-guarded
`POST /api/workflows/approval-sla` route with `x-workflow-token`.

The route refuses to run unless an operator has verified the platform duration for this workload:

- `CLIENTOPS_APPROVAL_SLA_ENABLED=1`
- `CLIENTOPS_APPROVAL_SLA_RUNTIME_VERIFIED=1`
- `CLIENTOPS_APPROVAL_SLA_MAX_DURATION_SECONDS` (integer 30–900; the route clamps its budget)

With a valid workflow credential but without these flags, it returns `503 RUNTIME_NOT_VERIFIED`,
like the retention sweep route. Authentication is checked first: an unset `N8N_WORKFLOW_TOKEN`
fails closed with `500`, and a missing/invalid request token with `401`. Ship the workflow and
env flags disabled; enable only after the n8n trigger and duration are verified on a
non-production branch.

### Operations

```sql
-- approvals marked overdue but still pending
select id, approval_type, assigned_to, created_at, sla_escalated_at
from human_approvals
where sla_escalated_at is not null and status = 'pending'
order by created_at;

-- escalation notifications raised
select created_at, title, object_id
from notifications
where type = 'approval_escalated'
order by created_at desc limit 100;
```

Rollback: set `CLIENTOPS_APPROVAL_SLA_ENABLED=0` (or pause the n8n workflow). Already-marked rows
stay marked; no status was changed, so no cleanup is required. To re-arm a single approval,
`update human_approvals set sla_escalated_at = null where id = $1` (operator action only).

## Deployment gate

Migrations **031** and **032** are additive but must be applied out-of-band before deploying code
that verifies the schema, same gate as 029/030 (see README Production Gates). Both are
replay-safe: 031 uses `add column if not exists`/checks and 032 uses `add column if not exists`
plus the notifications type-check drop/re-add.

## Follow-ups

1. Run-detail read path/UI for `agent_tool_calls` (the repository and type already support it; no
   surface exists today).
2. n8n internal steps: export node-level telemetry only if n8n gains a trustworthy per-tool
   instrumentation contract; current traces cover CRM dispatch and callback boundaries only.
3. HMAC argument digest if argument secrecy becomes a requirement.
4. SLA policy depth: per-type thresholds and a real escalation ladder (assign/notify manager
   chain) once there is data from the measured queue.
