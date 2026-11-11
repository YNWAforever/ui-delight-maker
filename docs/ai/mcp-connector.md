# MCP connector (v1)

Status: implemented in this branch (`feat/mcp-connector`), behind no feature flag: the endpoint
is inert without a minted token.
Audience: engineering, operations, and any user connecting an AI agent to ClientOps.

## What this is

A remote **MCP (Model Context Protocol) server** at `POST /api/mcp` that lets a user's own AI
agent read the CRM workspace with the same permissions the user has in the product.

Every request is authenticated with a **personal access token** minted from
**Account → Agent connector**. The token is shown once, stored only as a SHA-256 hash, and can be
revoked at any time. The connector is **read-only in v1**; write tools arrive with explicit
scopes and the existing human-approval model (see the roadmap).

Supported clients: any MCP client that can send custom HTTP headers: Claude Code, Cursor,
Claude Desktop (via `mcp-remote`), VS Code / GitHub Copilot MCP, and custom agents built on the
official MCP SDKs.

## Why personal tokens first

The MCP spec's preferred production auth is OAuth 2.1. Neon Auth already supports acting as the
OAuth 2.1 / OIDC authorization server for an MCP server (beta), with CIMD so clients self-register.
That is the phase-2 path (below), but it needs hosted login **and consent** pages, trusted-domain
configuration per branch, a production SMTP provider (the shared sender is verification-only and
rejects link verification), and verification of the beta token flow end-to-end.

Personal hashed tokens deliver the same product outcome today with a much smaller surface:

- no third-party redirect/callback handling in the auth path;
- no new browser-visible credentials;
- revocation is immediate and explicit;
- the token carries the user's **current** role, so role changes and deactivation apply on the
  next tool call without token re-issuance.

The endpoint is designed so OAuth can be added as a second verifier without changing tools.

## Architecture

```
MCP client (Claude Code / Cursor / custom agent)
  |  POST https://<app>/api/mcp
  |  Authorization: Bearer fmcp_<64 hex>
  v
src/routes/api/mcp.ts                 thin route handler
  |
  v
src/server/mcp/protocol.server.ts     MCP lifecycle, JSON-RPC, rate limit, audit
  +- src/server/mcp/transport.server.ts   one Web Request -> one JSON-RPC response (no SSE/session)
  +- src/server/mcp/tokens.server.ts      sha256 lookup, revoked/expired/profile-status checks,
  |                                       last_used_at, mcp_tool_calls audit (no args/PII)
  +- src/server/auth/authorization.server.ts  loadAuthorizationForProfile -> same RequestAuthorization
  |                                           context the authenticated UI uses
  v
src/lib/mcp/tools.server.ts           tool registry (read-only handlers)
  v
src/server/repositories|read-models   the exact queries the BFF uses
  v
Neon Postgres
```

Key properties:

- **Stateless**: the server builds an MCP server + transport per request. No session ids, no SSE
  streams, no server memory between calls; safe on Vercel's serverless runtime.
- **Same authorization as the UI**: capability checks (`requireCapability`,
  `requireAnyCapability`, `requirePageAuthorization`) evaluate the token owner's role and
  permission overrides through the same policy engine; row-level ownership resolution is the same
  code path. Tool arguments never supply the acting identity.
- **Scopes are stored per token** (`read` now, `write` reserved) and enforced on dispatch: every
  v1 tool requires the `read` scope. A future `request:write` tool requires both the scope and the
  user's write capability.
- **Fail closed**: missing/unreadable secret, malformed token, revoked token, expired token, or
  inactive profile all return 401 before any data read.
- Protocol version is negotiated from `initialize.params.protocolVersion` and the connector speaks
  `2025-06-18`, `2025-03-26`, and `2024-11-05`; an unsupported repeated `MCP-Protocol-Version`
  header is rejected with 400.

## Tools (v1, read-only)

| Tool | Grants | Data |
| --- | --- | --- |
| `whoami` | signed-in profile | profile id/name/role, effective capabilities, token name/prefix |
| `search` | any of accounts/contacts/leads/quotes/tasks view | global workspace search (min 3 chars, max 20) |
| `list_accounts` | `accounts.view` | accounts page: query, owner, cs_owner, lifecycle_stage, page/limit |
| `get_account` | `accounts.view` + row scope | one account |
| `list_leads` | `leads.view` | leads page: status, source, assigned_to, account_id, page/limit |
| `get_lead` | `leads.view` + row scope | one lead with latest activity |
| `list_job_sheets` | `job_sheets.view` | visibility-scoped job sheet list |
| `get_job_sheet` | `job_sheets.view` + row scope | one job sheet |
| `list_tasks` | `tasks.view` | visibility-scoped task queue page |
| `get_quote` | `quotes.view` + row scope | one quote |

Deliberately not in v1: quote list (per-row linked-record redaction), agent-run/approval history
(subject-level redaction), and every write. Those are phase-2/3 items, not gaps in the protocol.

## Security model

| Concern | v1 mitigation |
| --- | --- |
| Token theft from DB | 256-bit random token, only SHA-256 stored; prefix stored for identification; raw value shown once |
| Token leakage in logs | never logged; only token id/prefix; request bodies are not written to the audit table |
| Stolen/leaked token | revoke in Account → Agent connector (immediate); expiry 30/90/365 days or never |
| Over-broad access | token acts as its owner with the owner's current role and overrides; deactivation/role change applies next call |
| Prompt injection making the agent exfiltrate data | read-only tools; no write/send/export tools; operator guidance to scope tokens per task; audit trail enables review |
| PII egress | only fields the user can already see in the product; audit stores tool name/status only |
| Cost/abuse | per-profile in-memory limit 60 req/min plus a per-client pre-auth guard (best-effort per serverless instance), max 20 active tokens per profile, bounded tool page sizes, and database audit for after-the-fact analysis |
| Replay | bearer token is a long-lived credential by design; TLS only; rotate/revoke on suspicion |
| Network | no CORS headers: browser-based MCP clients are phase 2 (OAuth) |

Operational queries:

```sql
-- revoke every token of one user
update mcp_access_tokens set revoked_at = clock_timestamp()
where profile_id = $1 and revoked_at is null;

-- trace a token's calls
select tool, status, error_code, created_at from mcp_tool_calls
where token_id = $1 order by created_at desc limit 200;
```

## Connecting a client

Mint a token in **Account → Agent connector**; copy the generated snippet.

Claude Code:

```bash
claude mcp add --transport http fimmick-crm https://<app>/api/mcp \
  --header "Authorization: Bearer <token>"
```

Cursor / Claude Desktop (`claude_desktop_config.json` or `~/.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "fimmick-crm": {
      "url": "https://<app>/api/mcp",
      "headers": { "Authorization": "Bearer <token>" }
    }
  }
}
```

Claude Desktop does not speak remote HTTP natively in every build; use the standard
`npx mcp-remote https://<app>/api/mcp --header "Authorization: Bearer <token>"` bridge when
needed.

Smoke test:

```bash
curl -s https://<app>/api/mcp \
  -H "Authorization: Bearer <token>" \
  -H "content-type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-06-18","capabilities":{},"clientInfo":{"name":"smoke","version":"0"}}}'
```

MCP Inspector:

```bash
npx @modelcontextprotocol/inspector
# Transport: Streamable HTTP - URL: https://<app>/api/mcp
# Header: Authorization: Bearer <token>
```

Example prompts that work with the v1 tools: "Give me a brief on the Acme account before my
call", "Which leads came from the latest campaign and who owns them?", "Summarise open job sheets
for this client", "What quotes are associated with the renewal I am looking at?"

## Phase 2: OAuth 2.1 via Neon Auth

When web/desktop clients must not hold long-lived tokens (ChatGPT connectors, Claude web), add
OAuth as a second verifier:

1. Configure the production branch's auth OAuth server:
   `neon neon-auth config oauth-server update --enabled --login-page https://<app>/login --consent-page https://<app>/auth/consent --mcp-resource https://<app>/api/mcp`
   (`--mcp-resource` enables CIMD so MCP clients identify themselves; leave dynamic registration off).
2. Add `/auth/consent` (shows client name, redirect hosts, requested scope/resource) and treat
   the existing login page as the OAuth login page; both must be trusted domains. Keep
   `Content-Security-Policy: frame-ancestors 'none'`.
3. Verify the access token at the MCP endpoint with `@neon/oauth` (`createMcpAuth` +
   `honoMcp`-style guard or the `jose` JWKS path), checking `iss` (branch auth URL), `aud`
   (exact MCP resource), signature, and using `sub` as the profile id — never a tool argument.
4. Keep personal tokens as the CLI/automation path; users and agents pick one.

Prerequisites to schedule before phase 2: custom SMTP (production checklist), Neon Auth trusted
domains for every origin, and an end-to-end MCP Inspector run against a staging deployment.

## Phase 3: governed write tools

Write tools are the product's differentiator, but they must land on the existing governance
layer, not as unguarded API writes:

- every write tool requires `write` scope **and** the user's write capability;
- risky actions (quote send/issue, approvals, billing) route through the existing
  `commands/` + `human_approvals` + audit model with idempotency keys;
- tool results include the created record id and the audit/approval reference;
- MCP clients get an explicit `requires_approval` result instead of a silent success.

See `docs/ai/ai-crm-roadmap.md` for the ordered plan.
