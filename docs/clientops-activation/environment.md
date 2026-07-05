# ClientOps Activation Environment Matrix

| Surface          | Variable                             |    Required | Owner      | Notes                                                                     |
| ---------------- | ------------------------------------ | ----------: | ---------- | ------------------------------------------------------------------------- |
| App staging      | `APP_BASE_URL`                       |         Yes | App/Vercel | Public app origin n8n calls back into.                                    |
| App staging      | `DATABASE_URL`                       |         Yes | Neon       | Server-only staging branch/database URL.                                  |
| App staging      | `NEON_AUTH_URL`                      |         Yes | Neon Auth  | Server-side Auth URL; browser auth calls are proxied through `/api/auth`. |
| App staging      | `VITE_NEON_AUTH_URL`                 |          No | Neon Auth  | Legacy fallback only; do not use for direct browser auth in the SSR app.  |
| App staging      | `N8N_QUALIFY_LEAD_WEBHOOK_URL`       |         Yes | n8n        | Staging qualify webhook URL.                                              |
| App staging      | `N8N_DRAFT_REPLY_WEBHOOK_URL`        |         Yes | n8n        | Staging reply draft webhook URL.                                          |
| App staging      | `N8N_DRAFT_QUOTE_WEBHOOK_URL`        |         Yes | n8n        | Staging quote draft webhook URL.                                          |
| App staging      | `N8N_SCORE_RENEWAL_RISK_WEBHOOK_URL` |         Yes | n8n        | Staging renewal-risk scoring webhook URL.                                 |
| App staging      | `N8N_WORKFLOW_TOKEN`                 |         Yes | Shared     | Same value configured in n8n env.                                         |
| n8n staging      | `APP_BASE_URL`                       |         Yes | App/Vercel | Used by context and writeback HTTP nodes.                                 |
| n8n staging      | `N8N_WORKFLOW_TOKEN`                 |         Yes | Shared     | Sent as `x-workflow-token`.                                               |
| n8n staging      | `OPENROUTER_API_KEY`                 |          No | AI ops     | Missing key must trigger fallback.                                        |
| n8n staging      | `OPENROUTER_MODEL`                   |          No | AI ops     | Default: `anthropic/claude-sonnet-4-6`.                                   |
| n8n apply script | `N8N_API_BASE_URL`                   |          No | n8n        | Required only for direct apply/update.                                    |
| n8n apply script | `N8N_API_KEY`                        |          No | n8n        | Required only for direct apply/update.                                    |
| Seed script      | `CLIENTOPS_ALLOW_STAGING_SEED`       |         Yes | App ops    | Must be `1` before either seed mode writes data.                          |
| Seed script      | `CLIENTOPS_SEED_ON_DEPLOY`           |          No | App ops    | Set to `1` in Vercel to run the non-destructive seed after each build.    |
| Seed script      | `CLIENTOPS_SEED_MODE`                |         Yes | App ops    | `staging-smoke`, `staging-demo`, or `local-demo-reset`.                   |
| Seed script      | `CLIENTOPS_SEED_TARGET`              |         Yes | App ops    | `staging` for staging modes; `local` for destructive local reset.         |
| Seed script      | `CLIENTOPS_DESTRUCTIVE_RESET`        | Local reset | App ops    | Must be `I_UNDERSTAND` for `local-demo-reset`; leave blank otherwise.     |
| Seed script      | `CLIENTOPS_SEED_TODAY`               |          No | App ops    | Optional `YYYY-MM-DD` override for deterministic local demo dates.        |
| Seed script      | `CLIENTOPS_SMOKE_PROFILE_ID`         |  Smoke only | Neon Auth  | Required for `staging-smoke`; demo modes use built-in demo profiles.      |
| Seed script      | `CLIENTOPS_SMOKE_PROFILE_EMAIL`      |  Smoke only | App ops    | Required for `staging-smoke`; demo modes use built-in demo profiles.      |
| Seed script      | `CLIENTOPS_SMOKE_PROFILE_NAME`       |  Smoke only | App ops    | Required for `staging-smoke`; demo modes use built-in demo profiles.      |

## Rotation

1. Generate a new long random `N8N_WORKFLOW_TOKEN`.
2. Update n8n staging env first.
3. Update Vercel preview/staging env.
4. Run the smoke workflow.
5. Repeat for production only after staging is green.
