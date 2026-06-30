# ClientOps n8n Workflows

Import these JSON files into staging n8n or apply them with `scripts/clientops/apply-n8n-workflows.ts`.

Required n8n environment variables:

- `APP_BASE_URL`
- `N8N_WORKFLOW_TOKEN`
- `OPENROUTER_API_KEY` optional
- `OPENROUTER_MODEL` optional, defaults to `anthropic/claude-sonnet-4-6`

Every workflow follows:

1. Webhook receives app trigger.
2. Validate `x-workflow-token`.
3. Fetch app-owned lead context from `/api/workflows/context/lead`.
4. Use OpenRouter when configured; otherwise build deterministic fallback.
5. Write back to the matching `/api/workflows/*` endpoint with `x-workflow-token`.
