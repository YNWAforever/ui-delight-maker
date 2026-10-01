# T12 queue pagination and purpose-scoped people search

Scope: CO-14, CO-15 and the shared CO-20 directory search contract. Branch: codex/clientops-queue-pagination, stacked on T11. Code commit: cb038cd. Draft PR: https://github.com/YNWAforever/ui-delight-maker/pull/90. Audit baseline: 2904faa502f7494173f48f412875c1d0a3aba674.

## Baseline and red evidence

The original Tasks route loaded every row, filtered search and priority in the browser, and displayed an owner ID. Approvals loaded every pending and historical row and polled the full list every 12 seconds. The reviewer roster and admin profile helper were capped or unbounded in ways that hid later people. The eight audit probes remain evidence of old defects, not release gates.

The new PostgreSQL pagination test failed because the page functions did not exist. The My tasks preset test failed with 0 rather than 120 scoped rows. The approval page test failed because the new function was absent; the claimable case then failed at 120 rather than 121. The owner-picker UI test failed before the component existed.

## Change

- Tasks list reads 50 rows per page and the board reads 50 per lane, max 100 at the server. Status, priority, owner and text filters run in PostgreSQL before scoped count and keyset limit. URL search parameters retain filters across refresh. A selected owner is shown by an authorized name lookup; a missing name displays a neutral message instead of its ID.
- Purpose-scoped profile search returns only ID, display name, eligibility and reason. Task filter searches only people with visible tasks. Assignment, reviewer, admin access and successor purposes require their matching capability and limited roster scope. Selected IDs resolve independently so search remains usable after choosing another person.
- Approvals pending and history are separate SQL pages; counts are scoped and the list excludes context_data. A selected detail uses an authorized read. Pending refetches every 30 seconds only while the browser page is visible; history does not poll. Manager-claimable unassigned work is counted and paged only when both view and decide scopes permit its linked subject.
- The AI Review empty state reads one scoped latest-decision aggregate. The unused unbounded getApprovals server endpoint was removed. Migration 016 adds idempotent keyset indexes for task and approval queues.

## Verification

- New real PostgreSQL queue tests: 13/13 passed on the disposable audit container, including 120 visible of 150 tasks, page cap 100, cursor traversal, manager claimable approval, list payload redaction, selected detail, 250th-person discovery and scope-limited name resolution.
- Existing and new focused UI/schema tests: 8 files, 66/66 passed. Approval decision tests: 13/13; AI Review tests: 16/16. TypeScript and changed-file ESLint passed.
- Migration 016 was applied to the verified disposable database and rerun; the second application skipped all six existing indexes without error.
- Full suite on a fresh disposable PostgreSQL database with one worker: 287/287 files and 2,064/2,064 tests passed. An earlier parallel run had two failures: the authorization-surface count was updated from 225 to 231 after auditing six new gates; the revenue-currency count shifted under concurrent shared-DB tests, then passed alone and in the fresh serial full suite.
- Pure `bunx vite build` completed client and SSR with exit 0. The client build still warns about chunks above 500 kB; T19 owns representative runtime and bundle before/after measurements. `bun run build` was not used because it also migrates and seeds.
- No authenticated manager, sales, client-success, admin or accounting sessions were available for role UI/network UAT. No production database, customer message, provider call, deploy or seed was performed.

## Remaining gates

CO-14, CO-15 and CO-20 remain in_progress until authenticated role UI and representative runtime measurements. T19 owns the 10k-task/100k-approval before/after performance proof. The standalone Admin directory screen and team management remain T17. The production migration and release remain gated.

## Current defined queue acceptance — 2026-10-01 HKT

[Actual R06](../2026-09-29/r06-runtime-before-after-2026-09-30.md) provides both10k/100k queue scopes and40 navigations/source. Own Manager current foreground35s observation confirms pending30s polling, no history polling,50-row response and no context_data in list. [Partial proof](../2026-09-29/evidence/queue-visible-polling-main22817d4-2026-10-01.json). Native background remains blocked: runner reports visible despite real same-window activation/minimization. No synthetic hidden state is accepted; [resolution](../2026-09-29/final-local-acceptance-2026-10-01.md).
