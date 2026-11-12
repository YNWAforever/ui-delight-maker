# ClientOps n8n Workflows

Import these JSON files into staging n8n or apply them with `scripts/clientops/apply-n8n-workflows.ts`.
The apply script requires `N8N_TARGET=staging|local` (production is refused), prints the resolved
API host, and is a read-only dry run unless `--apply` is passed.

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
- `clientops-retention-sweep.json`: scheduled retention sweep (no app trigger), writeback `/api/workflows/retention-sweep`
- `clientops-approval-sla.json`: scheduled approval SLA escalation every 15 minutes (no app trigger), calls `/api/workflows/approval-sla` with `{}`; requires the app runtime flags `CLIENTOPS_APPROVAL_SLA_ENABLED=1`, `CLIENTOPS_APPROVAL_SLA_RUNTIME_VERIFIED=1` and `CLIENTOPS_APPROVAL_SLA_MAX_DURATION_SECONDS` (an integer between 30 and 900). The route returns 503 `RUNTIME_NOT_VERIFIED` until an operator verifies the platform duration; the workflow logs that as a clean no-op instead of failing the schedule.

Scheduled workflows (`clientops-retention-sweep.json` and `clientops-approval-sla.json`) have no n8n
webhook trigger: n8n owns the schedule, and a non-2xx response from the app is logged without
failing the execution. Importing or applying these files does not enable the app-side runtime gate.
