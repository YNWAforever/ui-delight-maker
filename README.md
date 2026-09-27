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

`bunx vite build` is the local, source-only build. `bun run build` also applies
migrations, verifies the database, and runs the deploy seed script; run it only
against a verified disposable database or in an explicitly approved deployment.
Vercel's configured build uses only `bunx vite build` and the static output packager;
migration and seed require a separate, verified database operation before release.
The GitHub `Checks` and `Database contract` workflows run for PRs and
pushes to `main`. The database gate requires every test to execute with zero skips.

The audit remediation is tracked in [status](docs/audit-fixes/2026-09-27/status.md),
with [release checklist](docs/audit-fixes/2026-09-27/release-checklist.md),
[operator runbook](docs/audit-fixes/2026-09-27/operations-runbook.md),
and [role UAT results](docs/audit-fixes/2026-09-27/uat-results.md).
Migrations `001`–`021` are registered in the ClientOps migration contract.
Five legacy Supabase domains still require snapshot parity before any Neon cutover;
see the [T20 evidence](docs/audit-fixes/2026-09-27/t20-evidence.md).
The read-only `/api/build` endpoint exposes only the deployment commit SHA,
or `null` if the platform supplied no valid SHA.

## Production Gates

- Configure `N8N_USER_INVITATION_WEBHOOK_URL` only after an operator explicitly approves the n8n workflow, recipient handling, and secret configuration.
- Set `CLIENTOPS_BOOTSTRAP_SUPER_ADMIN_EMAIL` only for the one-time guarded production bootstrap command, after explicit operator approval. Do not run the bootstrap command as part of a normal deploy.
- A preview must expose `/api/build` with the candidate commit SHA and pass role browser UAT before merging. Missing preview or role sessions remain an open gate; local tests do not substitute for them.

## Rollback

Follow the [release and rollback checklist](docs/audit-fixes/2026-09-27/release-checklist.md). Stop affected new operations and roll forward from a compatible application version. Do not restore an authorization or transaction bypass, drop receipt/history tables, or reverse a legacy data-source cutover without reconciling new writes.
