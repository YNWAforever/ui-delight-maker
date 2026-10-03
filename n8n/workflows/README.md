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
3. Fetch app-owned subject context from the matching `/api/workflows/context/*` endpoint.
4. The strict boolean `Provider Configured?` node calls OpenRouter only when its key is nonblank. Missing, empty or whitespace-only keys go directly to the existing deterministic output resolver.
5. Write back to the matching `/api/workflows/*` endpoint with `x-workflow-token`.

The template guard and its verification scope are documented in the
[2026-10-03 regression report](../../docs/audit-fixes/2026-09-29/n8n-provider-routing-2026-10-03.md).
Importing these repository files is a separate operator action; a source merge does not update a
deployed n8n workflow. Real provider usage, callbacks and delivery require an independent sandbox.

Workflow templates:

- `clientops-qualify-lead.json`: trigger `lead.qualify_requested`, context `/api/workflows/context/lead`, writeback `/api/workflows/qualify-lead`
- `clientops-draft-reply.json`: trigger `lead.reply_draft_requested`, context `/api/workflows/context/lead`, writeback `/api/workflows/draft-reply`
- `clientops-draft-quote.json`: trigger `quote.draft_requested`, context `/api/workflows/context/lead`, writeback `/api/workflows/draft-quote`
- `clientops-score-renewal-risk.json`: trigger `engagement.score_renewal_risk_requested`, context `/api/workflows/context/engagement`, writeback `/api/workflows/score-renewal-risk`
- `clientops-relationship-intelligence.json`: trigger `account.relationship_intelligence_requested`, context `/api/workflows/context/account`, writeback `/api/workflows/relationship-intelligence`
