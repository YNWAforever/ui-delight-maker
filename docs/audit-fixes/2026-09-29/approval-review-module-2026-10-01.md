# Approval Review module — execution evidence, 2026-10-01

Approved design/plan: planning repo commit `d8e0c71`; user approved execution in this chat. App branch `codex/approval-review-20261001`; observed main baseline `ac7a1edb7b1553269f6a89bc3f5a00d7e24ef506`. Native sequential execution; no agents/model switches.

## Fix matrix

| Task                          | Implementation / verification                                                                                                                                                                 | Role UI / runtime                                                                                                                           | Blocker                                        |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| P1 real AI version projection | Minimal SELECT column added. Real PG RED3 failed/1 passed -> GREEN4/4, zero skipped. Identity stripping, denied/orphan redaction and two composed reads retained.                             | Independent pre-change source7dc40fd: 14 own-role route cases and60 actual confirmed UI writes PASS; actual fixture version7 PG test above. | Candidate UAT pending; no broad release claim. |
| P2 controller                 | 34 interface tests PASS; notes allowlist RED -> GREEN; TypeScript PASS. Frozen intent, mount latch, original replay key, guarded cache rollback, quote metadata and authorized read retained. | Route/UI integration P3/P4 and actual role UAT P6 pending.                                                                                  | none identified                                |
| P3 Approvals adapter          | pending                                                                                                                                                                                       | pending                                                                                                                                     | none identified                                |
| P4 AI confirmed adapter       | pending                                                                                                                                                                                       | pending                                                                                                                                     | none identified                                |
| P5 transaction / full gate    | pending                                                                                                                                                                                       | not role UAT                                                                                                                                | none identified                                |
| P6 own-role UAT / runtime     | pending                                                                                                                                                                                       | pending                                                                                                                                     | existing external audit dependencies retained  |
| P7 PR / green merge           | pending                                                                                                                                                                                       | exact final source required                                                                                                                 | P2-P6 acceptance pending                       |

## P1 evidence

- Dedicated newly created Docker container `clientops-approval-review-pg-20261001`, `pgvector/pgvector:pg17`, PostgreSQL17.10, loopback64409, database `clientops_approval_review_20261001`. Empty public schema confirmed before baseline suite. Independent of retained performance fixture and Neon UAT.
- Baseline full suite324 files/2424 passed/zero skipped,656.57s. This is source/test evidence, not seven-role acceptance.
- New real-DB projection test: readable linked approval, denied linked approval, orphan approval each persist version7. Baseline fails all three because row_version is absent; fourth identity/two-query assertion passes. One-column repair passes4/4 with zero skips.
- Existing production authorization/transactions/schema untouched. Controlled RowAuthorizer exercises projection; not a substitute for true ownership or login tests.
- Private raw test reports and connection material remain ignored under `.clientops-perf/approval-review/`.
- Pre-change UAT observed source `7dc40fde8aba4c7033efaa67494fe31f70726926` has application/config/schema equivalent to baseline. Observer failures are retained: desktop AI queue rows omit context summary; selected inline panel contains it; accounting is denied the entire AI Review read route. These are observer findings, not reasons to widen read grants.

## Migration / reconciliation and release

No new migration, schema/seed operation or reconciliation required for this refactor. Historical snapshot parity and anomaly dispositions remain external audit blockers. All30 CO IDs remain in the existing status matrix (19 verified_fixed /11 blocked_external); this refactor does not relabel them without evidence.

Production hold retained. No production DB/Auth/provider operations or deployment performed. Before merge: same-head real PG zero-skip suite, lint/tsc/pure Vite, GitHub checks/isolated replay and independent seven-role candidate UAT/runtime. Runbook/rollback detail will be finalized with P7 evidence.

## P2 evidence

Public controller interface tested with real QueryClient and BFF latency/shape doubles only, not authorization/DB substitutes. Prepare/cancel zero writes; synchronous latch; frozen version7/notes; quote approve/reject/escalate metadata; malformed quote blocked; submitted notes and already-visible content allowlist; restricted reply null content; exact original replay payload; newer assignment/refetch and captured filter isolation; success survives failed refresh; unmount has no extra write. Unknown errors remain unconfirmed, typed business rejection is not recorded. 34/34 PASS, TypeScript exit0. Real role and transaction acceptance remain P5/P6.

## P3 evidence

P2 commit `01f70cc`. 25 route tests retain irreversible copy/cancel, server false/absent flags, independent permitted selection, assignment/unassign, scoped claim, approved manual draft and original durable bulk receipt/key/resume. New reject version7/key/trimmed notes and missing-version refresh tests reproduce old defects then pass; optimistic target-only/count preservation and newer assignment survive failure. Combined59/59 and final route25/25 PASS; TypeScript exit0. Route now presents confirmation/outcomes and retains safe confirmed rows; shared module owns command selection, attempt key and guarded rollback. No grant/schema/bulk behavior change.

Baseline runtime capture is complete on independent pre-change7dc40fd:30 decisions per route, each onePOST; Approvals2GET, AI1GET. Actual confirm-to-final-UI p50/p95: Approvals3631/4093ms; AI3578/3779ms. Actual POST p50/p95:3310/3779ms and3266/3404ms. Every synthetic row read back approved/version1. Seven distinct persisted roles/upstream users/live sessions produce14 control cases, including accounting AI read denied. Candidate comparisons remain P6.

## P4 evidence

P3 commit `7d19783`. AI decisions now use the same frozen version/key/notes and quote/generic command routing without optimistic status/notes writes. Existing ordering, next selection, empty/last-reviewed, Advanced disclosure and role-baseline/profile-null advisory retained. Actual query refresh tests prove missing version blocks POST until version7 arrives; restricted mutation raw content and later restricted authorized read cannot reintroduce content. Successful write + rejected invalidation remains recorded with stale hint/onePOST. Quote-only reply cannot supply approval metadata; authorized detail timestamp is rendered.22 AI route +25 Approvals +34 hook =81/81 PASS; TypeScript exit0. No role/grant/schema change.
