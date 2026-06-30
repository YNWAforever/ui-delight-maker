# ClientOps Staging Smoke Runbook

## Preflight

- [ ] Staging Neon migration is applied.
- [ ] Vercel preview/staging has Neon Auth env vars.
- [ ] Vercel preview/staging has the three n8n webhook URLs.
- [ ] Vercel preview/staging and n8n share the same `N8N_WORKFLOW_TOKEN`.
- [ ] n8n staging has `APP_BASE_URL` pointed to the app staging URL.
- [ ] OpenRouter env is either configured for live-path smoke or intentionally absent for fallback smoke.

## Seed

```bash
CLIENTOPS_ALLOW_STAGING_SEED=1 \
CLIENTOPS_SEED_TARGET=staging \
DATABASE_URL="$STAGING_DATABASE_URL" \
CLIENTOPS_SMOKE_PROFILE_ID="$STAGING_NEON_AUTH_USER_ID" \
CLIENTOPS_SMOKE_PROFILE_EMAIL="clientops-smoke@example.com" \
CLIENTOPS_SMOKE_PROFILE_NAME="ClientOps Smoke User" \
bun scripts/clientops/seed-smoke-data.ts
```

Record the returned `lead_id`.

## App Smoke

- [ ] Signed-out `/` redirects to `/login`.
- [ ] Real staging user signs in with Neon Auth.
- [ ] Pipeline loads.
- [ ] Seeded lead appears in `New`.
- [ ] Move lead stage and refresh; stage persists.
- [ ] Create follow-up task and refresh; task persists.

## AI Workflow Smoke

- [ ] Click Qualify Lead.
- [ ] Click Draft Reply.
- [ ] Click Draft Quote.
- [ ] Repeat Draft Reply once to verify no duplicate `message_send` approval.
- [ ] Repeat Draft Quote once to verify no duplicate quote for the same active run.

## Database Smoke

```bash
DATABASE_URL="$STAGING_DATABASE_URL" \
CLIENTOPS_SMOKE_LEAD_ID="$SMOKE_LEAD_ID" \
bun scripts/clientops/smoke-check.ts
```

## Report

Record:

- app staging URL;
- lead id;
- agent run ids;
- n8n execution ids;
- smoke-check table;
- blockers or manual caveats.
