# T13 — resumable bulk operations evidence

## Scope and commits

- Branch: codex/clientops-bulk-resume, stacked on draft PR #91.
- 2854c36: durable operation/item receipts, actor-owned preview and resume, migrations 017 and 018, allowlisted Task/Lead/Approval/Team adapters, real PostgreSQL regressions.
- 4183121: Lead, Approval, Task and both Team entrypoints use preview, progress, resume, failed-result export and retained selection; outdated direct-write Lead assertions replaced with positive UI regressions.
- 38efee1: a lost commit response keeps the same idempotency key across reload; a persisted running lease exposes Check or resume.
- 11383e3: existing workload-age integration fixture now derives its exact 40-day boundary from the same PostgreSQL clock used by the report. Production SQL was unchanged.

## Behavior and safety

- Each request accepts explicit distinct IDs, at most 100. Preview fixes IDs, action, versions, actor and a ten-minute token. The server rechecks capability, record state and version for each committed item.
- A request processes at most 20 items with at most four concurrent item transactions. Processing returns at an item boundary after roughly five seconds; remaining leases are released, and a crashed request can recover after lease expiry.
- Business writes and their success receipts share one transaction. Failure rolls back to an item savepoint before recording its status. Only known transient PostgreSQL failures or explicit retryable item failures can be resumed. Stale and forbidden items require a new preview or access resolution.
- Approval bulk decisions require one approval type and one decision; quote acceptance is not a bulk action. Job Sheet assignment and invoice target date remain T16 work because that task defines the accounting handoff and commercial lock rules. The T13 public schema does not advertise those unfinished actions.
- Failed-result CSV uses the T14 typed text writer. Browser state stores the operation ID, and only while a commit response is ambiguous, its preview token and original idempotency key. The server supplies actor-owned receipts on reload. A confirmed result reduces browser state to the operation ID. The UI does not promise background processing.

## Verification

- Red phase: the new bulk database and result UI tests failed before implementation; first full-suite run exposed eight old Lead direct-write expectations, one exact migration-list expectation, one source-level authorization registration, and a 39-versus-40-day fixture clock boundary.
- Green focused run on isolated PostgreSQL: six files, 51/51 tests before the final browser recovery additions; final Lead and result UI suites 12/12, including 100 items with 70 success / 10 forbidden / 10 stale / 10 missing; exactly one successful write after resume; two workers claiming one item; owner swap and preview expiry; rollback and retry; one-type Approval decision; Task version conflict; Team partial eligibility; a 5.2-second injected delay with item-boundary pause and lease release. The injected delay verifies control flow and is not a performance measurement.
- TypeScript noEmit: pass. Changed-file ESLint: pass. Pure Vite client and SSR build: pass. The repository's build wrapper was not run because it includes migration and seed.
- Final exact-head full suite: running against a fresh isolated database at time this evidence was written. Update this line with result before PR handoff.
- Role UI: no authenticated seven-role sessions are available. Browser UAT for role-specific selection, permission revocation and error download remains blocked. No super_admin proxy acceptance is claimed.
- Production data, messages, deployment and secrets: untouched.

## Migration and rollback notes

- Migration 017 adds bulk_operations and bulk_operation_items with owner, token, hash, idempotency key, state, item status and leases.
- Migration 018 adds default-zero row versions and update triggers to Tasks and Leads. Existing rows keep their business fields; version zero is an initial concurrency value, not evidence of an earlier write.
- Reconciliation on a disposable or approved target database: compare operation counts by state, item counts by status, successful receipt counts against business rows, and rows with expired leases. Do not infer a successful business write from a pending receipt.
- Application rollback can disable the bulk UI and endpoints while retaining the additive tables and version triggers; receipts must be kept for investigation. Destructive schema rollback needs a separately reviewed data-retention decision.
