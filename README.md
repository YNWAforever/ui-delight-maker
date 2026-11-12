# FIMMICK ClientOps

FIMMICK ClientOps is a TanStack Start CRM workspace with invitation-only user management, scoped teams, access requests, audit history, and server-side CRM authorization.

## Local Setup

1. Copy `.env.example` to `.env.local` and fill in the local Neon and Neon Auth values.
2. Install dependencies with `bun install`.
3. Start the app with `bun run dev`.

The existing `.env.local.example` contains the fuller local seed and workflow reference. Invitation email delivery is intentionally optional; without `N8N_USER_INVITATION_WEBHOOK_URL`, the Admin invitation flow returns a copyable activation link.

## Verification

```powershell
bun run test
bun run lint
bunx tsc --noEmit
bunx vite build
git diff --check
```

`bun run test` runs files serially because the integration files share one disposable
PostgreSQL database. Individual tests still exercise real concurrent transactions.
Use an isolated `DATABASE_TEST_URL` and require zero skipped tests.

`bunx vite build` is the local, source-only build. `bun run build` also applies
migrations, verifies the database, and runs the deploy seed script; run it only
against a verified disposable database or in an explicitly approved deployment.
Schema application is guarded: loopback `DATABASE_URL` targets apply without an extra
flag, any non-loopback target requires `CLIENTOPS_ALLOW_SCHEMA_MIGRATION=1`, and
`VERCEL_ENV=production`/`NODE_ENV=production` always refuse (run the approved
migration separately).
Vercel's configured build uses only `bunx vite build` and the static output packager;
migration and seed require a separate, verified database operation before release.
The GitHub `Checks` and `Database contract` workflows run for PRs and
pushes to `main`. The database gate requires every test to execute with zero skips.

The audit remediation is tracked in [status](docs/audit-fixes/2026-09-27/status.md),
with [release checklist](docs/audit-fixes/2026-09-27/release-checklist.md),
[operator runbook](docs/audit-fixes/2026-09-27/operations-runbook.md),
and [role UAT results](docs/audit-fixes/2026-09-27/uat-results.md).
Migrations `001`–`030` are registered in the ClientOps migration contract.
All application storage and authentication use Neon. Supabase runtime/SDK/source switches are forbidden; frozen legacy SQL is historical only. [Neon-only implementation, migration and acceptance limits](docs/audit-fixes/2026-09-27/neon-only-2026-10-03.md).
The read-only `/api/build` endpoint exposes only the deployment commit SHA,
or `null` if the platform supplied no valid SHA.

## MCP connector

Users can connect their own AI agent to ClientOps over the Model Context Protocol.
**Account → Agent connector** mints a personal access token (shown once, stored only as a
SHA-256 hash); the agent then calls the stateless `POST /api/mcp` endpoint. Tokens are read-only
by default; a "read + propose writes" token can call write tools, which only create a normal
human approval in `/approvals` — a person decides it and the decision executes the existing
command under that approver's authorization. Every tool is gated by the token owner's current
capabilities and row ownership, and every `tools/call` is recorded in `mcp_tool_calls` without
arguments or results (audit inserts are best-effort).

Design, tool catalogue, client setup, security model, and the OAuth/write-tool phases:
[docs/ai/mcp-connector.md](docs/ai/mcp-connector.md). Governed write proposals:
[docs/ai/mcp-write-proposals.md](docs/ai/mcp-write-proposals.md). The ordered AI CRM plan after
the connector is [docs/ai/ai-crm-roadmap.md](docs/ai/ai-crm-roadmap.md).

## Independent UAT

The [WorkflowMax history scaffold](docs/workflowmax-history.md) documents fixture dry runs,
isolated migration rehearsal, environment variables, dependency order, and reconciliation.
It remains draft-only under the documented WFM hard stop: no live pulls, OAuth token
use, or UAT/prod apply during scaffold review.

[ClientOps test sign-in](https://clientops-uat-20260930.vercel.app/login/sign-in) uses a separate synthetic database and Auth with seven genuinely distinct role accounts. The [environment and private local account/session paths](docs/audit-fixes/2026-09-29/isolated-uat-environment.md) and [current source/evidence/gates](docs/audit-fixes/2026-09-29/final-local-acceptance-2026-10-01.md) document the verified binding. Test cookies and credentials must remain untracked.

## Production Gates

- The Neon Auth project MUST require email verification. The app refuses to bind a pre-provisioned profile or accept an invitation on an unverified address, and signed-in unverified users get a distinct "Verify your email address" state instead of a workspace, where they enter the verification code Neon Auth emailed them; with verification emails disabled, invitees cannot activate until the code can be sent or an admin provisions them by auth user id.
- Configure `N8N_USER_INVITATION_WEBHOOK_URL` only after an operator explicitly approves the n8n workflow, recipient handling, and secret configuration.
- Set `CLIENTOPS_BOOTSTRAP_SUPER_ADMIN_EMAIL` only for the one-time guarded production bootstrap command, after explicit operator approval. Do not run the bootstrap command as part of a normal deploy.
- A preview must expose `/api/build` with the candidate commit SHA and pass role browser UAT before merging. Missing preview or role sessions remain an open gate; local tests do not substitute for them.
- Apply migration `029` (`mcp_access_tokens`, `mcp_tool_calls`) with the approved out-of-band migration run before deploying code that verifies the schema. Deactivating a profile immediately blocks its MCP tokens (profile status is checked on every call); revoke tokens explicitly on offboarding with the SQL in the [MCP connector doc](docs/ai/mcp-connector.md).
- For the governed write-proposal slice, apply migration `030` (`agent_action` approval type, proposer column and indexes) out of band **before** deploying code that verifies the schema, then mint write-scoped tokens deliberately; rollback is revoking every token with `'write' = any(scopes)` (SQL in the [connector doc](docs/ai/mcp-connector.md)). Approval execution is additive only: existing read-only tokens and approval types are unchanged.

## Rollback

Follow the [release and rollback checklist](docs/audit-fixes/2026-09-27/release-checklist.md). Stop affected new operations and roll forward from a compatible application version. Do not restore an authorization or transaction bypass, drop receipt/history tables, or reverse a legacy data-source cutover without reconciling new writes.
