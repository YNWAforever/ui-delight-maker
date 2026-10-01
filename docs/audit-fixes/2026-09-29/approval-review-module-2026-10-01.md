# Approval Review module — execution evidence, 2026-10-01

Approved design/plan: planning repo commit `d8e0c71`; user approved execution in this chat. App branch `codex/approval-review-20261001`; observed main baseline `ac7a1edb7b1553269f6a89bc3f5a00d7e24ef506`. Native sequential execution; no agents/model switches.

## Fix matrix

| Task | Implementation / verification | Role UI / runtime | Blocker |
| --- | --- | --- | --- |
| P1 real AI version projection | Minimal SELECT column added. Real PG RED3 failed/1 passed -> GREEN4/4, zero skipped. Identity stripping, denied/orphan redaction and two composed reads retained. | Independent pre-change capture in progress; actual fixture version7 test above. | Browser/runtime evidence pending; no broad release claim. |
| P2 controller | pending | pending | none identified |
| P3 Approvals adapter | pending | pending | none identified |
| P4 AI confirmed adapter | pending | pending | none identified |
| P5 transaction / full gate | pending | not role UAT | none identified |
| P6 own-role UAT / runtime | pending | pending | existing external audit dependencies retained |
| P7 PR / green merge | pending | exact final source required | P2-P6 acceptance pending |

## P1 evidence

- Dedicated newly created Docker container `clientops-approval-review-pg-20261001`, `pgvector/pgvector:pg17`, PostgreSQL17.10, loopback64409, database `clientops_approval_review_20261001`. Empty public schema confirmed before baseline suite. Independent of retained performance fixture and Neon UAT.
- Baseline full suite324 files/2424 passed/zero skipped,656.57s. This is source/test evidence, not seven-role acceptance.
- New real-DB projection test: readable linked approval, denied linked approval, orphan approval each persist version7. Baseline fails all three because row_version is absent; fourth identity/two-query assertion passes. One-column repair passes4/4 with zero skips.
- Existing production authorization/transactions/schema untouched. Controlled RowAuthorizer exercises projection; not a substitute for true ownership or login tests.
- Private raw test reports and connection material remain ignored under `.clientops-perf/approval-review/`.
- Pre-change UAT observed source `7dc40fde8aba4c7033efaa67494fe31f70726926` has application/config/schema equivalent to baseline. Observer failures are retained: desktop AI queue rows omit context summary; selected inline panel contains it; accounting correctly sees restricted content. These are observer findings, not reasons to widen read grants.

## Migration / reconciliation and release

No new migration, schema/seed operation or reconciliation required for this refactor. Historical snapshot parity and anomaly dispositions remain external audit blockers. All30 CO IDs remain in the existing status matrix (19 verified_fixed /11 blocked_external); this refactor does not relabel them without evidence.

Production hold retained. No production DB/Auth/provider operations or deployment performed. Before merge: same-head real PG zero-skip suite, lint/tsc/pure Vite, GitHub checks/isolated replay and independent seven-role candidate UAT/runtime. Runbook/rollback detail will be finalized with P7 evidence.
