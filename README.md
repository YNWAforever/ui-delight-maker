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
bun run build
git diff --check
```

The build applies and verifies the ClientOps schema before producing the production bundle.

## Production Gates

- Configure `N8N_USER_INVITATION_WEBHOOK_URL` only after an operator explicitly approves the n8n workflow, recipient handling, and secret configuration.
- Set `CLIENTOPS_BOOTSTRAP_SUPER_ADMIN_EMAIL` only for the one-time guarded production bootstrap command, after explicit operator approval. Do not run the bootstrap command as part of a normal deploy.
- Preview deployments must pass the test suite, lint, TypeScript check, build, schema verification, and browser checks before merging.

## Rollback

If the Admin workspace must be disabled, remove Admin navigation and revert the server-function authorization changes together with the migration-compatible application version. Do not drop `admin_audit_logs`, access-request, membership, or other history tables during rollback. Preserve the schema so a later application version can restore the workflow without losing actor references.
