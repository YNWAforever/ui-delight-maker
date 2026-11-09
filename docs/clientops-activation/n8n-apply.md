# n8n Apply Notes

## Direct Apply

The script refuses to run without an explicit target and is read-only unless `--apply` is
passed. `N8N_TARGET` must be `staging` or `local`; production is refused. The resolved API
host is printed before any request is made.

```bash
# 1. Dry run: lists what would be created or updated. No writes.
N8N_TARGET=staging \
N8N_API_BASE_URL=https://YOUR_N8N_HOST \
N8N_API_KEY=YOUR_N8N_PUBLIC_API_KEY \
bun scripts/clientops/apply-n8n-workflows.ts

# 2. Apply, after reviewing the dry-run output.
N8N_TARGET=staging \
N8N_API_BASE_URL=https://YOUR_N8N_HOST \
N8N_API_KEY=YOUR_N8N_PUBLIC_API_KEY \
bun scripts/clientops/apply-n8n-workflows.ts --apply
```

The script uses `X-N8N-API-KEY` and creates or updates workflows by name.

## Manual Import

1. Open n8n staging.
2. Import each file from `n8n/workflows/`.
3. Confirm n8n env contains `APP_BASE_URL` and `N8N_WORKFLOW_TOKEN`.
4. Keep workflows inactive until app staging env webhook URLs are configured.
5. Activate one workflow at a time during smoke.
