# U11 local recovery authorization — 2026-10-01

## Confirmed baseline

PR [#150](https://github.com/YNWAforever/ui-delight-maker/pull/150) merged at `2026-10-01T02:42:09Z`, final head `ff4c0151bf70bcd802780beb9349dfe45701b2d2`, main `9e96bc5973406d8645d49a4b5de7807488caefc8`. Final-head and post-main checks each pass 2,397 actual PostgreSQL tests with zero skipped, migration/seed replay, types/lint and browser collection. [Merge proof](evidence/pr150-merge-2026-10-01.json). Production attempt is **CANCELED** and public build still `bed941b37d18d214d0e7658ebce2116a2fc33eb9`; [read-only hold proof](evidence/production-hold-after-150-2026-10-01.json). No production DB access or promotion.

The protected dedicated UAT source `8b9479f` reproduces a recovery affordance defect with seven actual independent Auth users. Reader sees Cancel/Expire/Prepare retry; Sales and Client Success see Cancel/Expire on a waiting run whose linked approval requires `approvals.decide`. The actual Reader POST denies; the original two synthetic runs, linked approval, receipts and audits remain unchanged. [Actual characterization](evidence/agent-recovery-before-8b9479f-2026-10-01.json). A fixture setup attempt hit the existing one-active-run uniqueness constraint and rolled back; a subsequent observer had a shadowed variable. Neither is product defect evidence. The corrected observer continues the same retained two-run fixture.

## Focused repair

- History returns per-run Cancel/Expire/Retry hints from current persisted subject ownership, existing role grants, scoped overrides and linked approval ownership. Unknown/unowned subjects, inactive actors, manager outsiders and inconsistent linked reviews fail closed. The original recovery command rechecks under its transaction locks.
- The existing page authorization accepts an already loaded server context, so history uses one context load. Ownership is batched by resource type and linked open approvals by the bounded page. A real 25-row regression proves one ownership query plus one linked-review query, rather than a query for every row.
- Readable rows without recovery permission retain their input display and omit recovery writes. The one-hour threshold is evaluated on the server. Recovery confirmations send an explicit key; an unchanged request keeps that key after response loss, and changing the reason rotates it.
- Expanded history labels cost **unrecorded**. There is no persisted cost value in this read contract and no inferred zero or token-price formula.

No new role grant, schema migration, external cancellation, automatic dispatch or customer message is introduced. Existing cancel/expiry/retry transaction, audit, receipt and late-callback rules remain authoritative.

## Local evidence

Two positive UI regressions first fail against the previous source; the other five pass. The new PostgreSQL helper initially fails module collection before implementation; that collection failure is not an assertion proving a pre-existing DB defect. Existing deterministic compatibility fixtures were updated for the explicit command key and single context load; none were replaced with release mocks.

Actual isolated PostgreSQL 17.10 on `127.0.0.1:56489`: recovery suite **22/22**, including seven roles, current/expired deny, persisted assignee, unknown ownership, young threshold, 25-row batch, existing claim race, SQL rollback, idempotency and late callback regressions. Related UI/read/handler suite **48/48**. Fresh full migrated DB `clientops_agent_recovery_final_20261001_1112`: **2,410 tests /323 files /zero failed, skipped or todo**, measured 440,756ms. Types, lint (one existing Fast Refresh warning), pure `bunx vite build`, bundle gate and diff check pass. [Local proof](evidence/agent-recovery-local-2026-10-01.json).

## Acceptance and remaining gates

Exact committed-source CI and protected hosted seven-role recapture are pending for this repair. U11 local recovery remains pending until those actual controls/POSTs, original response-loss/key replay, current scoped deny and expired allow are verified. Previous actual claim and manual-message evidence remains valid within its recorded scope.

Provider timeout/callback/new-attempt delivery requires the missing provider sandbox; real provider cancellation or customer delivery is not inferred from a local terminal marker. Legacy/Neon reconciliation snapshots, four historical anomaly dispositions, operator/PITR/retention evidence and screen-reader acceptance retain their own blockers. Release **NO-GO**. Rollback for this slice is a source revert; there is no migration or historical backfill.
