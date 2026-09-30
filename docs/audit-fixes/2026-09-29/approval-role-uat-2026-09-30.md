# R04 approval permissions and isolated UAT — 2026-09-30

## Scope and source

PR [#134](https://github.com/YNWAforever/ui-delight-maker/pull/134), initial source `9ac3090fcd959cb772b04814d9eb7317ae507789`, independent hosted UAT deployment `dpl_6RbyRmfTW7uRr8Gdx3wRiRkUiS1N`. Seven distinct real Neon Auth identities use their own browser cookies. Test data is synthetic on the independent UAT database/auth in [environment record](isolated-uat-environment.md).

The server returns approval action metadata evaluated against persisted row assignment, existing role grants, current overrides and quote ownership. The UI omits unauthorized decisions, routing, manual record controls and selection. No new grants, provider activation or production mutation.

## Actual browser and database evidence

[Role/scope/race capture](evidence/approval-roles-race-9ac3090-2026-09-30.json) retains its original `success:false`: seven roles, four scope scenarios and the race completed, then the manual reader assertion ran before its lazy draft query finished. That incomplete overall run is not a passing release gate. [Separate complete manual recapture](evidence/approval-manual-9ac3090-2026-09-30.json) waited for the real loaded draft and passed. An earlier diagnostic race attempt was interrupted after replay interception also held the replay; it is not acceptance evidence.

| Case | Actual result |
|---|---|
| Same pending record, seven roles | super_admin, admin and in-scope manager offered decisions/selection. Sales, client_success, accounting and read_only omitted them. |
| Positive writes | Manager, admin and super_admin submitted actual UI decisions on synthetic records. |
| Four denied roles | Actual same-origin POST returned a serialized authorization error; record/version unchanged. HTTP 200 is the RPC envelope, not successful mutation. |
| Effective scope | Manager row deny, expired reader allow and unowned manager negative paths denied without writing. Real read_only scoped allow permitted one specified row. Overrides revoked. |
| U05 opposed decisions | Manager Approve and admin Reject POSTs released together. Admin won; manager received conflict. Both reloaded rejected state. Version 1, one audit/receipt; winner same-key replay unchanged. |
| U12 manual statement | Actual manager approval created the handoff. Genuine client_success with one explicit row grant recorded a synthetic operator statement once. Replay unchanged; one manual audit. read_only could read/copy the draft, had no record controls and direct POST was denied. |

Manual recording is an operator statement, not proof of provider/customer delivery. No provider call or real message. Default client_success grants unchanged. Sales handoff, claim/retry, risk, bulk/import, native zoom and screen reader remain open.

## Performance gate and diagnosis

Initial exact-head CI passed: Checks `36677754559`; Database contract `36677754471`, **2,278 tests / 0 skipped**, isolated migration/seed replay, browser collector and Vercel. PR remains draft because the real browser gate failed.

[Original 40-navigation capture](evidence/approval-runtime-failed-9ac3090-2026-09-30.json): 10 cold / 30 warm on unchanged real 10k Task / 100k approval PostgreSQL data. Warm rendered p95 **1,144.803ms**, above **800ms**; payload 107,383 bytes and encoded cold JS 270,106 bytes pass unchanged budgets. Complete metrics, no failed/blocked requests; 44 SQL queries including two added reviewer ownership reads. Failed samples retained; no best-run selection.

Direct PostgreSQL EXPLAIN ANALYZE found manager history expanded the open/unassigned claim ownership branch although terminal history cannot be claimed. Its count compiled 333 JIT functions, **1,529.059ms JIT / 1,589.193ms execution**. Pending count compiled 335 functions, **102.004ms JIT / 148.544ms execution**. This identifies expensive SQL work; it does not explain every browser outlier.

Follow-up limits linked claim scope to pending groups and fences pending lateral ownership so it is evaluated once. Existing ordinary visibility, deny/allow/expiry, linked ownership and paging remain. JIT settings and thresholds unchanged. Reviewer notes input also follows server decision/request-changes flags; readers see persisted text. Follow-up full tests, exact-source runtime and hosted UI must pass before merge.

## Release boundaries

Source review and isolated acceptance only. Production remains held; public build `bed941b37d18d214d0e7658ebce2116a2fc33eb9`. No migration, historical reconciliation, production data write or production deployment. Legacy snapshots, provider sandbox, four historical anomaly dispositions, operator/PITR/release rehearsal and wider backlog remain outstanding.

## Second complete performance capture

Source `97c4d6dac95ba6e97b8e2e715ae1ec6955e92235`, [all 40 samples](evidence/approval-runtime-failed-97c4d6d-2026-09-30.json), warm p95 **1,058.818ms**, p50 **837.257ms**: FAIL. Summed SQL duration p95 fell to **1,124.457ms**, but rendered readiness still exceeds 800ms. Direct pending-count EXPLAIN showed the lateral fence changed planner cost enough to enable expensive JIT optimization: **473.173ms JIT / 557.660ms execution**. That candidate is not accepted.

The next source computes manager claim ownership in a materialized, open/unassigned subset before applying membership to the ordinary scoped count/page. It retains the same persisted subject/view/decide rules, empty/null-owner behavior and row overrides. Added real PostgreSQL assertions confirm a view or decide deny still excludes an otherwise claimable row. No DB JIT setting, fixture size, warm sample count or threshold changed. Full source tests, new fixed-SHA runtime and hosted role recapture follow.

## Final fixed source acceptance

Source `fac59c90eb47be77c4f75554b3cee6e624b26622`, dedicated UAT deployment `dpl_7J8H98mVBo23qrAuLXd8Z3EiDxmJ`; stable alias returned the exact SHA before and after the complete capture.

[Complete final hosted capture](evidence/approval-roles-final-fac59c9-2026-09-30.json) **success:true**: seven distinct role sessions, three default-role positive decision actors, four default-role direct denials with unchanged rows, four scope/override cases, actual opposed manager/admin POST race and refreshed terminal UI, scoped client_success manual record/replay, reader direct denial and revoked overrides. Reviewer notes input is present for the three permitted actors and absent for the other four; persisted notes remain readable. [Seven role and race/manual screenshots](evidence/approval-final-fac59c9/).

Race record `8f803b44-4ddf-4ce4-b19a-c464c668c9b6`: admin Reject won, manager Approve conflicted. One row version, one audit, one command receipt, winner replay unchanged. U05 passes this isolated full case. Manual record `b5948243-382d-465a-be2e-6c2b90d9aa92`: authorized scoped client_success operator statement at 07:33:04Z, one audit and unchanged replay. U12 scoped client_success path passes; sales entry/provider delivery remains outside this capture.

[Final runtime — all 40 samples](evidence/approval-runtime-pass-fac59c9-2026-09-30.json) passes unchanged gates:

| Metric | Initial 9ac3090 | Failed fenced 97c4d6d | Final fac59c9 |
|---|---:|---:|---:|
| Warm rendered p50, ms | 598.193 | 837.257 | 445.594 |
| Warm rendered p95, ms | 1,144.803 FAIL | 1,058.818 FAIL | **506.768 PASS** |
| Cold rendered p95, ms | 2,225.682 | 2,930.570 | 2,617.623 |
| Summed SQL p95, ms | 6,027.947 | 1,124.457 | 629.765 |
| Max document/data bytes | 107,383 | 107,383 | 107,383 |
| Max cold encoded JS bytes | 270,106 | 270,137 | 270,137 |
| Scoped SQL count | 44 | 44 | 44 |

Same real 10k/100k data, machine, real manager session, production SSR, browser 153, collector and 10 cold/30 warm counts. Zero failed/blocked requests and DB errors; complete metrics. Cold p95 increased from the first candidate, so no cold-speed improvement claimed. Query count remains 44; no reduced session-resolution claim. No failed run or sample discarded.

Final local source gate: fresh empty isolated PostgreSQL **2,279 passed / 0 skipped / 0 todo** across 312 files; TypeScript, full tracked-source lint (one existing warning), pure Vite client/SSR, bundles and diff check passed. Exact source GitHub Checks `36683520673` and Database contract `36683520688` passed the same 2,279-test zero-skip suite, isolated migration/seed replay, browser collector and Vercel. The final evidence-only head must also pass before merge.

No schema/migration/env/role-grant changes. Both ordinary and claim-subset view/decide denies are retained, as shown by real PostgreSQL tests. Dedicated UAT can be reverted independently to deployment `dpl_6RbyRmfTW7uRr8Gdx3wRiRkUiS1N`; database rollback is not needed for these source-only changes. Production release remains NO-GO with the existing hold and all documented external gates.
