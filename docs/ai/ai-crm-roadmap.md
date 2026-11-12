# AI CRM roadmap — MCP connector and what comes after

Status: proposed direction for `feat/mcp-connector`  
Companion docs: [`docs/fimmick-total-crm-ai-ops-roadmap.md`](../fimmick-total-crm-ai-ops-roadmap.md) (platform-wide phases 0–4), [`docs/ai/mcp-connector.md`](./mcp-connector.md) (the v1 connector shipped in PR #183).

This document is a **delta**, not a replacement. It assumes the existing roadmap's phases and
adds the agent-native layer: what the MCP connector changes, what has to be true before external
agents are trustworthy, and the order to build it.

## 1. The shift

Today ClientOps is a UI over five fixed n8n pipelines (`qualify_lead`, `draft_reply`,
`draft_quote`, `score_renewal_risk`, `relationship_intelligence`) plus the auxiliary `note_tidy`.
The governance substrate is real: run ledger, append-only policy versions, capability checks,
approval CAS with receipts, recovery commands, subject-aware redaction of AI Ops reads.

What is missing is a **tool surface**. The MCP connector is the first place model-driven tool
selection exists in the product: an agent decides which CRM reads to make, in what order, and
combines them into an answer. That changes the governance question from "did the pipeline run?"
to "what did the agent see, and what did it do with it?"

The connector therefore ships in three layers, each independently useful and independently
governable:

| Layer | What it is | State |
| --- | --- | --- |
| A. Read tool surface | stateless `/api/mcp` + per-user hashed tokens + 10 read tools reusing BFF authorization | **shipped (PR #183)** |
| B. Governed action surface | write tools as proposals or governed dispatches; in-product assistant on the same registry | next |
| C. Intelligence core | semantic search, evals, budgets, incidents, proactive triggers, tool-call traces | after B, on top of roadmap Phase 2 |

## 2. Honest baseline (what the AI layer cannot do yet)

These are the gaps an external agent exposes immediately; several are already listed as roadmap
Phase 1/2 work, so this section only names the delta that must land before agents can be trusted.

1. **Tool calls are never recorded.** `agent_tool_calls` is read by
   `getAgentRunWithCalls` but nothing inserts into it — the current pipelines are fixed chains, not
   tool-using agents. MCP tool calls get their own audit table; the AI Ops read models still show
   no tool trace for n8n runs.
2. **No run-detail trace surface.** `getAgentRunWithCalls` is imported but unused in the BFF; run
   detail (tool calls, callback history, attempts) is not visible to operators.
3. **Prompts, models, and output contracts are not versioned.** They live inline in
   `n8n/workflows/*.json` plus `OPENROUTER_MODEL`; there is no `prompt_versions` /
   `model_policies`, so a model change cannot be attributed or rolled back.
4. **No budgets, evals, incidents, or run attempts.** Cost renders per run but is not enforced
   before dispatch and is not aggregated per outcome.
5. **Policy governs status only.** `human_approval` is displayed but always copied from the
   catalogue; approval behaviour is not yet risk/confidence-driven.
6. **Approval SLA is a chip, not an escalation loop.** Four of seven approval types have no
   decision handler and say so.
7. **No memory by design.** Episodic data in `agent_runs` is unused; timeline summaries are
   deterministic counts, not model summaries.

The connector must not paper over these. A read-only agent that can see accounts, leads, quotes,
job sheets, tasks and approvals is valuable *because* it cannot write; write access without
traces, budgets and escalation would make the gaps dangerous.

## 3. Tranche A — read tool surface (shipped)

Delivered:

- per-user MCP tokens (`fmcp_…`), SHA-256 at rest, prefix-only display, revocable, expiring;
- stateless `POST /api/mcp` (Streamable HTTP, JSON responses, no SSE/session) built on the
  official MCP TypeScript SDK;
- 10 read tools: `whoami`, `search`, `list_accounts`, `get_account`, `list_leads`, `get_lead`,
  `list_job_sheets`, `get_job_sheet`, `list_tasks`, `get_quote`;
- same capability + ownership policy as the UI via `loadAuthorizationForProfile` and the existing
  `RequestAuthorization` context;
- `mcp_tool_calls` audit (tool, status, duration, no arguments/results), a per-profile rate limit, and a bounded number of active tokens per profile.

Exit gates for A:

- MCP Inspector + one real client (Claude Code or Cursor) complete initialize → tools/list →
  tools/call against a preview deployment;
- unauthorized token/profile/expired/revoked all reject before any read;
- a token minted for a `sales` user cannot read a quote outside that user's capability or row
  scope that the UI would deny;
- `bun run typecheck`, `bun run lint`, full test suite, DB contract, and the migration replay job
  pass.

Explicit non-goals in A: quote list (per-row linked-record redaction lives inline in the BFF),
agent-run and approval detail tools (subject-level redaction), writes, browser/CORS clients, OAuth.

## 4. Tranche B — governed action surface (in progress)

### B1. Close the two prerequisites

1. **Tool-call trace writer.** Route every agent tool call (n8n and MCP) through one recorder that
   writes `agent_tool_calls` with `agent_run_id` or `mcp_tool_calls.id`, tool name, duration,
   status, and a redacted argument digest. This is what makes "what did the agent access?" a
   query, not a log dig. **Still open**: MCP calls are audited in `mcp_tool_calls`; n8n calls are
   not yet written to `agent_tool_calls`, which remains an unused table.
2. **Approval SLA escalation.** A scheduled writer that claims overdue approvals (lease pattern
   from `retention_sweeps`) and raises an escalation notification; the existing 4h chip becomes a
   measured queue. **Still open**; the first proposal slice reuses the existing approval queue and
   owner assignment rather than adding escalation.

### B2. Write tools as proposals (first slice implemented in `feat/mcp-write-proposals`)

Agents never write directly. A write tool validates the target, records a normal `human_approvals`
row with `approval_type='agent_action'`, and a person with `approvals.decide` decides it on
`/approvals`. Approval executes the existing command inside the decision transaction, under the
**approver's** authorization, with command receipts, CAS and audit already applied. The tool result
is always "pending approval" with the approval id — never a silent success.

- first action: `record_manual_message_sent` → existing `recordManualMessageSentCommand` (records
  a send reference on an approved message request; the platform sends nothing);
- `tidy_touchpoint_note` was evaluated and rejected as the first action: note tidy is an
  untethered AI text transform with no supervised write target and no note-update path. The next
  candidate is `propose_touchpoint_note` (insert-only, approver's `engagements.create`);
- next: `propose_agent_dispatch` (`agents.run`), then `propose_approval_decision` only after an
  explicit requester ≠ decider rule exists;
- tokens default to read-only; the Agent connector UI can mint "read + propose writes" tokens.
  Write scope gates the tool, `approvals.view` on the target gates proposal creation, and execution
  re-checks the approver's capability;
- design, data model and threat model: [mcp-write-proposals.md](mcp-write-proposals.md).

### B3. In-product assistant on the same registry

- `/assistant` route + `/api/assistant` streaming endpoint; the model calls the same tool registry
  as MCP through `invokeGovernedAI`/the n8n dispatch layer;
- register the assistant as a governed workflow type so every turn lands in `agent_runs` with
  policy version, model, cost and trace;
- guardrails: tool-loop cap, fixed data context, tool results treated as untrusted data, and
  writes only as proposals;
- measurable outcome: the assistant reduces time-to-brief and time-to-quote without adding
  ungoverned writes.

## 5. Tranche C — intelligence core

Sequence after B, reusing roadmap Phase 2 tables:

1. **Semantic search** — pgvector is already enabled but unused; add `embeddings`
   (entity_type/id, account_id, content hash, model, vector) + HNSW; MCP `search_crm` applies the
   caller's visibility in SQL before ranking; measure recall@10 on an eval set.
2. **Budgets and dispatch gate** — `agent_budgets` enforced at the same point as the policy gate
   before any external dispatch; cost attribution per run/outcome/account.
3. **Evaluations** — `agent_evaluations` / `evaluation_cases` seeded from production runs; run in
   CI with thresholds; block prompt/model release below threshold.
4. **Incidents and drift** — `agent_incidents` with severity/owner and postmortem; alert on
   failure-rate and quality regressions.
5. **Proactive triggers** — a generic scheduled-trigger table using the retention-sweep lease
   pattern; agents create tasks/proposals from signals (renewal risk, stale accounts, unanswered
   quotes), never send externally without approval.
6. **Memory (optional, governed)** — only after evals exist; episodic summaries stored with
   provenance and subject capability checks, never free-text memory of another user's records.

## 6. Prioritised backlog

| Priority | Item | Why now |
| --- | --- | --- |
| P0 | MCP read connector (shipped) | first agent-native surface; no write risk |
| P0 | Tool-call trace writer for n8n + MCP | prerequisite for agent observability and incident review |
| P0 | Approval SLA escalation writer | prerequisite for trustworthy proposals |
| P1 | `mcp_write` proposals + first governed write (`record_manual_message_sent`) — in progress | proves the governed write path without adding an ungoverned write |
| P1 | In-product assistant on the shared registry | user-facing value; uses same guardrails |
| P1 | OAuth 2.1 via Neon Auth OAuth server + CIMD | web/desktop clients without long-lived tokens |
| P1 | Prompt/model versioning + eval harness | makes AI changes attributable and reversible |
| P2 | Semantic search + `search_crm` tool | better recall for agents and UI |
| P2 | Budgets, incidents, proactive triggers | scale-out of governance |

## 7. Risk register

| Risk | v1 (read connector) | v2 (writes + assistant) |
| --- | --- | --- |
| Prompt injection via CRM text | read-only tools; no instruction execution from record content; strict token/tool allowlists | writes only as proposals; human decision; tool results framed as data |
| Over-broad tokens | per-user tokens, current role/overrides at call time, revocable, expiring, rate-limited, audited | per-tool scopes; optional OAuth; no service tokens |
| PII egress | only fields the user can see; audit stores no arguments/results | PII scope for contact fields; provider routing/no-training terms; demo-provenance filter |
| Stale/cached data | direct Neon reads, `no-store`, `asOf` in envelope | `expected_version` CAS on proposals (approvals already CAS) |
| Cost/abuse | 60 req/min per token, bounded limits, audit | budgets before dispatch, loop caps, cost attribution |

## 8. Metrics

- adoption: users with an active token, distinct agents/clients, tool calls per day;
- reliability: p95 latency per tool, error rate, rate-limit events;
- safety: unauthorised-access audit hits (target 0), tokens revoked after incident (target 0),
  proposals without a decision (target 0);
- business: briefs produced without the UI, quotes followed up faster, approval decision time,
  time saved per account review;
- cost: tokens/cost per tool call and per accepted outcome.

## 9. Definition of done for any agent-facing capability

An agent-facing feature (tool, proposal, assistant turn) is done only when it has: a typed
input/output, a capability + row-scope gate, a tool-call trace, an audit event, bounded limits,
a safe error contract, a documented failure mode, and a measurable business outcome. Read-only
tools may skip the approval gate; they may not skip the trace.
