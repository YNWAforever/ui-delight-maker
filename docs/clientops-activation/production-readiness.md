# ClientOps Production Readiness Checklist

## Required Green Checks

- [ ] `bun run test` passes.
- [ ] `bun run build` passes.
- [ ] Changed files pass focused ESLint.
- [ ] n8n workflow templates pass validation test.
- [ ] Staging seed script has been run only against staging Neon with `CLIENTOPS_SEED_TARGET=staging`.
- [ ] Staging app smoke passes with a real Neon Auth user.
- [ ] Staging fallback workflow smoke passes without `OPENROUTER_API_KEY`.
- [ ] Staging OpenRouter workflow smoke passes when `OPENROUTER_API_KEY` is configured.
- [ ] Retry/idempotency smoke passes for reply and quote writebacks.
- [ ] Direct n8n apply succeeded or manual import was documented.

## Environment Confirmation

- [ ] Production `DATABASE_URL` points to Neon production.
- [ ] Production `NEON_AUTH_URL` points to the production Neon Auth integration; browser auth uses the same-origin `/api/auth` proxy.
- [ ] Production `APP_BASE_URL` is the production Vercel URL/custom domain.
- [ ] Production n8n workflows are separate from staging workflows or have production-safe webhook paths.
- [ ] Production `N8N_WORKFLOW_TOKEN` is different from staging.
- [ ] Production OpenRouter key/model owner is documented.
- [ ] No secret value appears in git history, docs, screenshots, or PR text.

## Client Relationship 360 Readiness

- [ ] `DATABASE_URL` points to a database with `003_client_relationship_360.sql` applied.
- [ ] Existing clients have been linked to accounts.
- [ ] Relationship signal generation has been run at least once.
- [ ] The n8n `clientops-relationship-intelligence` workflow is imported and has the same `x-workflow-token` as the app.
- [ ] The Relationship Command Center shows open signals without leaking secrets or raw model prompts.

## Rollback

- [ ] Disable AI buttons by removing the relevant `N8N_*_WEBHOOK_URL` env vars and redeploying.
- [ ] Deactivate production n8n workflows.
- [ ] Rotate `N8N_WORKFLOW_TOKEN` if a token leak is suspected.
- [ ] Keep Neon migration rollback manual because the runtime migration is non-destructive.

## Production Go/No-Go

Production cutover is approved only after the staging smoke report is attached to the PR or release notes and a real Fimmick user has completed manual sign-in.
