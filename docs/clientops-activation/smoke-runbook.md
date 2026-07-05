# ClientOps Staging Smoke Runbook

## Preflight

- [ ] Staging Neon migration is applied.
- [ ] Vercel preview/staging has Neon Auth env vars.
- [ ] Vercel preview/staging has the four n8n webhook URLs.
- [ ] Vercel preview/staging and n8n share the same `N8N_WORKFLOW_TOKEN`.
- [ ] n8n staging has `APP_BASE_URL` pointed to the app staging URL.
- [ ] OpenRouter env is either configured for live-path smoke or intentionally absent for fallback smoke.

## Seed

```bash
CLIENTOPS_ALLOW_STAGING_SEED=1 \
CLIENTOPS_SEED_MODE=staging-smoke \
CLIENTOPS_SEED_TARGET=staging \
DATABASE_URL="$STAGING_DATABASE_URL" \
CLIENTOPS_SMOKE_PROFILE_ID="$STAGING_NEON_AUTH_USER_ID" \
CLIENTOPS_SMOKE_PROFILE_EMAIL="clientops-smoke@example.com" \
CLIENTOPS_SMOKE_PROFILE_NAME="ClientOps Smoke User" \
bun scripts/clientops/seed-smoke-data.ts
```

The seed script prints a JSON summary. Record `lead_ids["lead-retail"]` as `SMOKE_LEAD_ID`.

## Staging Demo Data

Use this when the staging or preview app should show the full ClientOps mock dataset. It upserts demo records without truncating existing staging data.

```bash
CLIENTOPS_ALLOW_STAGING_SEED=1 \
CLIENTOPS_SEED_MODE=staging-demo \
CLIENTOPS_SEED_TARGET=staging \
CLIENTOPS_SEED_TODAY=2026-07-05 \
DATABASE_URL="$STAGING_DATABASE_URL" \
bun scripts/clientops/seed-smoke-data.ts
```

Staging demo uses built-in `DEMO_PROFILES`; do not set the staging smoke profile env vars for this mode.

## Local Demo Reset

Use this only against a local or disposable database. It truncates demo-facing CRM tables and rebuilds a full lead-flow plus retention dataset.

```bash
CLIENTOPS_ALLOW_STAGING_SEED=1 \
CLIENTOPS_SEED_MODE=local-demo-reset \
CLIENTOPS_SEED_TARGET=local \
CLIENTOPS_DESTRUCTIVE_RESET=I_UNDERSTAND \
CLIENTOPS_SEED_TODAY=2026-07-05 \
DATABASE_URL="$LOCAL_DATABASE_URL" \
bun scripts/clientops/seed-smoke-data.ts
```

Local demo reset uses built-in `DEMO_PROFILES`; do not set the staging smoke profile env vars for this mode.

After it finishes, open the app locally and inspect Pipeline, Leads, Quotes, Approvals, Tasks, Renewals, Clients, Notifications, Agents, and Settings products.

## App Smoke

- [ ] Signed-out `/` redirects to `/login`.
- [ ] Real staging user signs in with Neon Auth.
- [ ] Pipeline loads.
- [ ] Seeded lead appears in `New`.
- [ ] Move lead stage and refresh; stage persists.
- [ ] Create follow-up task and refresh; task persists.

## AI Workflow Smoke

- [ ] Click Qualify Lead and record the agent run id as `SMOKE_QUALIFY_RUN_ID`.
- [ ] Click Draft Reply and record the agent run id as `SMOKE_REPLY_RUN_ID`.
- [ ] Click Draft Quote and record the agent run id as `SMOKE_QUOTE_RUN_ID`.
- [ ] Repeat Draft Reply once to verify no duplicate `message_send` approval.
- [ ] Repeat Draft Quote once to verify no duplicate quote for the same active run.

The smoke checker scopes approval and quote checks to these run IDs. Quote idempotency is verified through the draft quote run's `output_data.quote_id`, which is the scoped smoke quote artifact.

## Database Smoke

```bash
DATABASE_URL="$STAGING_DATABASE_URL" \
CLIENTOPS_SMOKE_LEAD_ID="$SMOKE_LEAD_ID" \
CLIENTOPS_SMOKE_QUALIFY_RUN_ID="$SMOKE_QUALIFY_RUN_ID" \
CLIENTOPS_SMOKE_REPLY_RUN_ID="$SMOKE_REPLY_RUN_ID" \
CLIENTOPS_SMOKE_QUOTE_RUN_ID="$SMOKE_QUOTE_RUN_ID" \
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
