# ClientOps operations runbook

This describes the candidate UI and server behavior; production rollout is **not complete**. Use [release gates](release-checklist.md) before treating this as live procedure. Ask an Admin for the correct role or scope; never borrow a super_admin account to work around a denial.

## Daily role workflow

| Role | Routine | When blocked |
|---|---|---|
| Sales | Open visible Leads and Tasks, confirm owner, create draft Quote, request approval; after approval use the explicit manual handoff when required. | A 403 means scope/capability denial. A 409 means refresh and compare current version/state. Do not retry with a different identity. |
| Manager | Review only assigned/scoped approvals; decide once; an approved Quote awaiting issue goes to an issuer. | A concurrent terminal decision returns conflict; refresh history. Do not resubmit with a new key to reverse it. |
| Accounting/issuer | Issue the approved version if authorized; reconcile PO, owner, portions and Xero entry; record correction reason. | Notes are evidence only and never mark Xero entered. Locked accepted commercial fields require a new authorized version, not direct editing. |
| Client Success | Review scoped signal and risk recommendation, apply the single transactional action. | Failed apply must leave approval, engagement, run and audit unchanged; escalate for investigation. |
| Admin | Search the full eligible directory, manage teams and invitations, handle scoped recovery. | Suspended/no-profile users cannot access CRM. Keep historical audit actors; do not reassign history merely to hide departed users. |
| Read-only | Inspect allowed records and reports. | Mutations should be denied server-side even if a control is hidden. |

## Bulk progress and resume

1. Select at most **100 distinct items** and check the preview scope, count, action and per-item blockers. The preview expires after **10 minutes**.
2. Confirm once. The server handles at most **20 items per call**, at most **4 concurrent item transactions**, and returns item-level outcomes. The browser may need repeated Continue actions; closing it does not promise background work.
3. If the response is lost, reopen the operation or use Check/resume with its saved operation ID. The same original idempotency key is reused until the server confirms the operation. Do not create a new operation simply because the spinner stopped.
4. A successful receipt is final. Failed items remain visible and selectable. Retry only explicitly retryable items; forbidden and stale require access correction or a fresh preview, respectively. Export the failure summary if needed.
5. Admin support checks operation state and item counts, stalled leases, actor ownership and receipts. Preserve rows for reconciliation; never delete an operation to make the queue appear clear.

## CSV import progress and resume

1. Upload at most **5 MiB / 5,000 records**. Preview whole-file records, including BOM, multiline text and every invalid/forbidden/ambiguous row. Check source line numbers before commit.
2. Exact source-scoped external IDs identify a record. A company name or email alone is only a hint; resolve ambiguity explicitly. Preview expires after **24 hours**.
3. Commit with the displayed session and idempotency key. Each call claims at most **20 rows**, with at most **4 concurrent row transactions**. Close/reopen to resume the actor-owned session; no background completion is promised.
4. Compare total rows with success, invalid, forbidden, ambiguous, skipped, retryable and pending status counts. Download the issues CSV if needed; it contains status/line/ID, not the raw upload. Do not reimport with a new identity key to force a duplicate through.
5. After **7 days**, expired row payloads may be scrubbed while minimal receipts remain. A production cleanup schedule has not been enabled. The explicit maintenance command is `bun scripts/clientops/cleanup-import-sessions.ts --execute` only on an approved target after checking DB identity and retention expectations.

## Approval, agent and AI recovery

- An unassigned approval is claimable only when its subject scope is established. Two operators claiming concurrently yield one owner. A terminal decision is immutable; refresh and review audit history on conflict.
- Agent history exposes local recovery only for the current subject/approval permissions. Cancel closes an active local record with a reason; expiry and Prepare retry require at least60 minutes. Prepare retry marks the old run retry_requested and does not create or dispatch a new attempt. After response loss, keep the form reason/key unchanged and retry the same command. Editing the reason creates a new key. If permissions expire, the command denies and the next read removes the control. Preserve original rows, linked approvals, audits and receipts; an ambiguous external outcome still needs provider confirmation.
- Note tidy is governed and keyed for same-note retry. A timeout/failure is not a zero-cost or zero-token run. Usage absent from the provider remains **unrecorded**. Provider sandbox and deployed n8n contract still require verification.
- Manual message handoff means copy and send outside ClientOps by an authorized person, then record the reference. A handoff record is not a delivery receipt. This candidate never sends a real customer message.

## Data-source and release support

- The five legacy domains (automation, customer success, deals, engagement events, projects) still read Supabase. The account/deal/project task-read Neon rehearsal is restricted to explicit local disposable DBs. Do not set a production switch.
- Once complete isolated snapshots arrive, run the read-only `scripts/clientops/reconcile-legacy-domains.ts` tool as described in [T20](t20-evidence.md). Investigate count, ID, hash, owner, task and override differences before planning migration or cutover.
- For incident rollback, stop affected new bulk/import actions, preserve receipts and immutable financial history, and roll forward a compatible fix. Do not restore the old unsafe write handler or drop additive history tables. Any domain with new Neon writes needs delta reconciliation before source reversal.
- On-call observations after an approved release: scoped 403/409 trends, pending approvals, stuck runs, bulk/import failure rate, slow SQL, route p95, initial JS transfer, and duplicate notifications. Record the source and window; do not claim a metric from a synthetic formula.
