# Local test timeout investigation — 2026-09-28

Baseline main: `26860935514a042cc1cea3154fa4f5429ab9ec6a`. Its Checks and Database contract workflows passed; production release remains held.

## Reproduction and cause

The previous Windows runs exceeded the existing dashboard task-deny test's 15-second timeout, including after a fresh schema reset. A new dedicated, unmounted `pgvector/pgvector:pg17` container was bound only to 127.0.0.1:50500. The seven-case test initially passed in 6.25 seconds, confirming timing variability. PostgreSQL slow logging identified the agent-runs subject-visibility SELECT at 1,723.966 ms.

Temporary diagnostic instrumentation then captured EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) through the same real PostgreSQL connection. The query returned zero rows but compiled 160 JIT functions. Measured execution was 10,907.777 ms, of which 10,890.688 ms was JIT. The instrumented test timed out; instrumentation adds an extra execution and is diagnostic evidence, not an independent performance gate.

PostgreSQL autovacuum cannot access temporary tables. Its documentation recommends explicit maintenance where needed; see [PostgreSQL 17 routine vacuuming](https://www.postgresql.org/docs/17/routine-vacuuming.html). This fixture creates and populates eleven temporary tables without ANALYZE, so the optimizer used estimates that produced an unnecessary high-cost plan.

## Minimal correction and measurement

Run ANALYZE on the eleven explicitly named `pg_temp` fixture tables after population. Production queries, JIT configuration, existing assertions, all timeout values and authorization behavior are unchanged.

| Real query-plan metric | Before fixture ANALYZE | After fixture ANALYZE |
| ---------------------- | ---------------------: | --------------------: |
| Estimated total cost   |           2,822,402.38 |                  0.03 |
| Actual rows            |                      0 |                     0 |
| Planning ms            |                  0.897 |                 0.545 |
| Execution ms           |             10,907.777 |                 0.207 |
| JIT total ms           |             10,890.688 |           not invoked |

The after-change instrumented seven-case test passed. Temporary instrumentation was then removed. The [machine-readable measurements](evidence/local-timeout-query-plan-2026-09-28.json) preserve the actual results. These are isolated fixture measurements, not a production or full-route before/after benchmark; T19 remains blocked on authenticated runtime evidence.

## Verification and limits

TypeScript and lint passed (one pre-existing Fast Refresh warning). Full isolated PostgreSQL zero-skip tests and pure Vite build are recorded in the accompanying status checkpoint when complete. The original hook timeouts in other suites are not proven to share this cause. Today's renewal-expansion six-case suite passed during the full run.

This change adds no migration, seed, production maintenance command or deployment. Seven-role UAT, T20 snapshots, production historical reconciliation, provider sandbox and operator release prerequisites remain open. Do not run this fixture maintenance against production or claim production query performance is verified.

## Verification checkpoint

PR #109 code head `36414e37b57320fed2e057a7ec580607850eb5e1` passed GitHub Checks `36432639736` and Database contract `36432639686`: **2,172 tests, zero skipped**, plus isolated two-wrapper seed replay and four rollback cases. Protected preview `dpl_E6qGShqkVLxw7twGaWR622ua9Do1` returned the exact head SHA. Supabase Preview was skipped. The approved production build hold was re-read from Vercel.

The uninstrumented local full run passed the corrected cross-surface seven-case suite, renewal-expansion six-case suite, legacy-domain six-case suite, and all six import cases (the 5,000-row case took 326,614 ms). It also encountered four Quote approval request/setup timeouts. PostgreSQL logged a 67,054.458 ms Quote UPDATE, followed by fixture key collisions after timed-out operations; the original blocking cause was not captured and is not attributed to the temporary-table JIT issue.

The run subsequently stopped advancing for over three minutes. A read-only container inspection returned Docker Desktop Linux engine API HTTP 500. The task's verified Vitest process tree was terminated; unrelated processes and containers were left alone and Docker was not restarted. The local full run is **incomplete/blocked**, not green, and its remaining approval failures are unresolved. No test timeout was increased or test skipped to turn it green. Independent GitHub real-Postgres results remain the successful full-suite evidence.

Disposable container cleanup also exceeded a bounded 20-second wait while the engine was unavailable. The Docker CLI process was stopped; removal of `clientops-timeout-20260928` is unconfirmed. Once Docker is healthy, inspect that exact task-owned container and remove only it. Do not restart or prune unrelated project containers as part of this cleanup.
