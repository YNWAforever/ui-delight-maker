# n8n Apply Notes

## Direct Apply

```bash
N8N_API_BASE_URL=https://YOUR_N8N_HOST \
N8N_API_KEY=YOUR_N8N_PUBLIC_API_KEY \
bun scripts/clientops/apply-n8n-workflows.ts
```

The script uses `X-N8N-API-KEY` and creates or updates workflows by name.

## Manual Import

1. Open n8n staging.
2. Import each file from `n8n/workflows/`.
3. Confirm n8n env contains `APP_BASE_URL` and `N8N_WORKFLOW_TOKEN`.
4. Keep workflows inactive until app staging env webhook URLs are configured.
5. Activate one workflow at a time during smoke.
