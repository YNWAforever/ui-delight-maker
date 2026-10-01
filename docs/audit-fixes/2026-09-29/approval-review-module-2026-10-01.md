# Approval Review module — execution evidence, 2026-10-01

Approved design/plan: planning repo commit `d8e0c71`; user approved execution in this chat. App branch `codex/approval-review-20261001`; observed main baseline `ac7a1edb7b1553269f6a89bc3f5a00d7e24ef506`. Native sequential execution; no agents/model switches.

## Fix matrix

| Task                       | Commit / verification                                                                               | Own-role UI / runtime                                                                 | Status / blocker                             |
| -------------------------- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- | -------------------------------------------- |
| P1 AI version projection   | 6e30193: real PG RED3/1 -> GREEN4/4; actual version7                                                | Both candidate routes persist7 ->8                                                    | verified                                     |
| P2 shared controller       | 01f70cc: 34 public-interface tests                                                                  | Native latch/retry/race/scoped cases                                                  | verified                                     |
| P3 Approvals adapter       | 7d19783: 25 route tests                                                                             | Seven own-role controls; optimistic timing preserved                                  | verified                                     |
| P4 AI confirmed adapter    | e462096: 22 route tests; combined81/81                                                              | Seven own-role controls; confirmed timing/advisory preserved                          | verified                                     |
| P5 transactions/full suite | 23d04dd:71 PG cases; fresh2475/326/zero skips; static/pure build                                    | Two actual PostgreSQL backends in quote race                                          | verified                                     |
| P6 isolated UAT/runtime    | 804b163 measured app; observer corrections through a2a942c                                          | 14 own-role cases;24 boundaries;3 neighbors;60 before+60 after;4 native polling cases | verified; external audit gates remain        |
| P7 delivery                | [PR155](https://github.com/YNWAforever/ui-delight-maker/pull/155) published/attached; runbook below | Final application-tree equivalence and served-source checks required                  | Final-head CI/merge pending; production held |

## P1 evidence

- Dedicated newly created Docker container `clientops-approval-review-pg-20261001`, `pgvector/pgvector:pg17`, PostgreSQL17.10, loopback64409, database `clientops_approval_review_20261001`. Empty public schema confirmed before baseline suite. Independent of retained performance fixture and Neon UAT.
- Baseline full suite324 files/2424 passed/zero skipped,656.57s. This is source/test evidence, not seven-role acceptance.
- New real-DB projection test: readable linked approval, denied linked approval, orphan approval each persist version7. Baseline fails all three because row_version is absent; fourth identity/two-query assertion passes. One-column repair passes4/4 with zero skips.
- Existing production authorization/transactions/schema untouched. Controlled RowAuthorizer exercises projection; not a substitute for true ownership or login tests.
- Private raw test reports and connection material remain ignored under `.clientops-perf/approval-review/`.
- Pre-change UAT observed source `7dc40fde8aba4c7033efaa67494fe31f70726926` has application/config/schema equivalent to baseline. Observer failures are retained: desktop AI queue rows omit context summary; selected inline panel contains it; accounting is denied the entire AI Review read route. These are observer findings, not reasons to widen read grants.

## Migration / reconciliation and release

No new migration, schema/seed operation or reconciliation required for this refactor. Historical snapshot parity and anomaly dispositions remain external audit blockers. All30 CO IDs remain in the existing status matrix (19 verified_fixed /11 blocked_external); this refactor does not relabel them without evidence.

Production hold retained. No production DB/Auth/provider operations or deployment performed. Before merge: same-head real PG zero-skip suite, lint/tsc/pure Vite, GitHub checks/isolated replay and independent seven-role candidate UAT/runtime. Final runbook/rollback detail is below; live final delivery results are recorded in PR155.

## P2 evidence

Public controller interface tested with real QueryClient and BFF latency/shape doubles only, not authorization/DB substitutes. Prepare/cancel zero writes; synchronous latch; frozen version7/notes; quote approve/reject/escalate metadata; malformed quote blocked; submitted notes and already-visible content allowlist; restricted reply null content; exact original replay payload; newer assignment/refetch and captured filter isolation; success survives failed refresh; unmount has no extra write. Unknown errors remain unconfirmed, typed business rejection is not recorded. 34/34 PASS, TypeScript exit0. Real role and transaction acceptance remain P5/P6.

## P3 evidence

P2 commit `01f70cc`. 25 route tests retain irreversible copy/cancel, server false/absent flags, independent permitted selection, assignment/unassign, scoped claim, approved manual draft and original durable bulk receipt/key/resume. New reject version7/key/trimmed notes and missing-version refresh tests reproduce old defects then pass; optimistic target-only/count preservation and newer assignment survive failure. Combined59/59 and final route25/25 PASS; TypeScript exit0. Route now presents confirmation/outcomes and retains safe confirmed rows; shared module owns command selection, attempt key and guarded rollback. No grant/schema/bulk behavior change.

Baseline runtime capture is complete on independent pre-change7dc40fd:30 decisions per route, each onePOST; Approvals2GET, AI1GET. Actual confirm-to-final-UI p50/p95: Approvals3631/4093ms; AI3578/3779ms. Actual POST p50/p95:3310/3779ms and3266/3404ms. Every synthetic row read back approved/version1. Seven distinct persisted roles/upstream users/live sessions produce14 control cases, including accounting AI read denied. Candidate comparison and actual gates are recorded in P6 below.

## P4 evidence

P3 commit `7d19783`. AI decisions now use the same frozen version/key/notes and quote/generic command routing without optimistic status/notes writes. Existing ordering, next selection, empty/last-reviewed, Advanced disclosure and role-baseline/profile-null advisory retained. Actual query refresh tests prove missing version blocks POST until version7 arrives; restricted mutation raw content and later restricted authorized read cannot reintroduce content. Successful write + rejected invalidation remains recorded with stale hint/onePOST. Quote-only reply cannot supply approval metadata; authorized detail timestamp is rendered.22 AI route +25 Approvals +34 hook =81/81 PASS; TypeScript exit0. No role/grant/schema change.

## P5 transaction and whole-branch evidence

P4 commit `e462096`. Added only three coverage gaps in the existing quote atomic suite: persisted version7 rejection exact replay/payload conflict with unchanged full quote/approval/audit/receipt; real assignment7->8 followed by stale reject7 with no changes; opposed quote decisions on two distinct actual pg_backend_pid values, one terminal success/audit/receipt, no issuance.71/71 real PG cases pass, zero skipped, preserving existing generic race/audit rollback/parked recovery/risk/immutable issuance cases. No server command changes required.

Initial test harness errors retained: direct UPDATE cannot seed arbitrary7 because the real version trigger increments by1; seed starting7 by INSERT and assert persisted7. Quotes have no row_version; compare their actual full rows, and approval version separately. These are fixture corrections, not server fixes.

First full run reused the baseline DB and failed an existing invitation beforeAll on its fixed leftover profile;2473 pass/2 skipped was rejected. New database `clientops_approval_review_final_20261001` in the same task-only PG17.10 container was verified empty before the final run:2475 tests/326 files pass, zero skips,411.75s. Failed run reports retained privately.

Root package lint also scanned ignored historical deployment exports:11930 style errors including one own test formatting error. After formatting the own file, all774 tracked code/config/test files pass the same ESLint config. Actual `bun run lint` in a clean source export also exits0, with one existing warning in data-table-shell.tsx:82. TypeScript and pure Vite exit0; actual route bundle budget command exit0. No lint policy changed, migration/seed wrapper not run locally.

Whole-branch self-review traced both adapters and the shared controller against frozen intent, optimistic/confirmed timing, allowed metadata, original replay payload, newer/refreshed/restricted precedence and neighboring workflow retention. No new grant/count formula/raw server content spread/schema/production operation. User forbids agents/model switches, so no separate-agent review is claimed. Actual hosted acceptance is recorded in P6 below; exact final-head CI/delivery remains P7.

## P6 source-bound isolated UAT — 2026-10-02 HKT

**PASS:** [allowlisted runtime/UAT JSON](evidence/approval-review-2026-10-02/runtime-and-uat.json). Actual served and measured candidate source is **804b16348af5484ded4404a2d9e4cf319e3fb837**; before source is **7dc40fde8aba4c7033efaa67494fe31f70726926**, application/config/schema equivalent to main baseline ac7a1ed. Observer-only commits preserve the application tree. Final served metadata must identify its actual head separately.

Isolation: dedicated UAT [test URL](https://clientops-uat-20260930.vercel.app), Vercel project prj_jlIsv7mLYGpZR4XEV4njX05jAZYJ, independent Neon polished-forest-15724329 / br-solitary-butterfly-b3883kwo / clientops_uat, separate Auth origin hash97b089a053f3c9844ea598a8f061b6c5b5abec7c6d64e0700644f6daec1901f1. Seven distinct upstream users and active persisted role profiles each use their own current session; no copied SuperAdmin state. No provider configured and no production operation. Raw requests, credentials/sessions and diagnostics remain ignored.

### Own-role UI evidence

| Actual own account role | Approvals                                                                     | AI Review                                                                     |
| ----------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| super_admin             | [Approvals](evidence/approval-review-2026-10-02/super_admin-approvals.png)    | [AI Review](evidence/approval-review-2026-10-02/super_admin-ai-review.png)    |
| admin                   | [Approvals](evidence/approval-review-2026-10-02/admin-approvals.png)          | [AI Review](evidence/approval-review-2026-10-02/admin-ai-review.png)          |
| manager                 | [Approvals](evidence/approval-review-2026-10-02/manager-approvals.png)        | [AI Review](evidence/approval-review-2026-10-02/manager-ai-review.png)        |
| sales                   | [Approvals](evidence/approval-review-2026-10-02/sales-approvals.png)          | [AI Review](evidence/approval-review-2026-10-02/sales-ai-review.png)          |
| client_success          | [Approvals](evidence/approval-review-2026-10-02/client_success-approvals.png) | [AI Review](evidence/approval-review-2026-10-02/client_success-ai-review.png) |
| accounting              | [Approvals](evidence/approval-review-2026-10-02/accounting-approvals.png)     | [AI Review](evidence/approval-review-2026-10-02/accounting-ai-review.png)     |
| read_only               | [Approvals](evidence/approval-review-2026-10-02/read_only-approvals.png)      | [AI Review](evidence/approval-review-2026-10-02/read_only-ai-review.png)      |

SuperAdmin/Admin/Manager confirm persisted version7 ->8 on both routes, one audit/receipt and completed linked run. Sales/CS/accounting/Reader native unavailable controls plus eight actual same-origin server denials retain all DB rows/audits/receipts unchanged; accounting AI read denial remains expected.

24 actual boundary cases pass: six permitted version7 writes; eight own-role server denials; scoped Reader allow on Approvals with existing AI role advisory still disabled; scoped Manager deny; expired/outside Reader allow denied; grant withdrawn after dialog denied; native double-click onePOST on each route; explicitly aborted first POST then byte-identical original payload/key retry/replay on each route; opposed permitted Manager/Admin decisions released together yield exactly one terminal write/audit/receipt and unchanged winner replay. Only task-owned synthetic grants were revoked in finally. Server authorization remains authoritative.

### Retained workflows

- [Claim/assignment](evidence/approval-review-2026-10-02/retained-claim-assignment.png): Manager claim7->8; fresh authorized Admin detail then assignment8->9. Existing Manager directory scope (self/direct reports) retained; Admin uses its own eligible picker. Claim's existing queue-only invalidation is unchanged, so the separate assignment reads fresh detail.
- [Manual handoff](evidence/approval-review-2026-10-02/retained-manual.png): approved fake draft has enabled Copy; synthetic manual statement recorded by own Manager; original payload/key native replay preserves the full handoff row. It is an operator statement, never provider delivery evidence.
- [Original durable bulk resume](evidence/approval-review-2026-10-02/retained-original-bulk-resume.png):21 fake rows complete actual8+8+5 chunks after reload/Resume, same operation/commit key, all approved/version1. Actual click-to-response durations12,619/12,550/15,759ms. Original terminal commit replay leaves every approval/run/audit/receipt plus full operation/item rows unchanged, including timestamps/attempts/leases. Each actual chunk advances1–20; existing5-second soft work budget may stop below20 and does not promise total HTTP response under5seconds.

### Real runtime before / after

| Route      | Real decisions before + after | UI p50 / p95 before ms | UI p50 / p95 after ms | POST p50 / p95 before ms | POST p50 / p95 after ms | GET per decision before -> after |
| ---------- | ----------------------------- | ---------------------- | --------------------- | ------------------------ | ----------------------- | -------------------------------- |
| /approvals | 30 + 30                       | 3,631 / 4,093          | 3,547 / 3,651         | 3,310 / 3,779            | 3,252 / 3,340           | 2 -> 3                           |
| /ai-review | 30 + 30                       | 3,578 / 3,779          | 3,600 / 3,658         | 3,266 / 3,404            | 3,301 / 3,351           | 1 -> 1                           |

Every sample has exactly1POST and real DB approved/version1. Chromium153.0.8010.12 / Node24.18.0 / viewport1440x900; fresh qualification_review rows/version0, same Manager owner and Auth/DB/provider-off config. Actual wall durations, nearest-rank percentiles. Approvals adds one authorized detail GET (2->3); AI UI median increases22ms while p95 decreases121ms. Sequential network variation and growing retained fake datasets prevent a causal speed guarantee; these are decision runtime measurements, not Core Web Vitals or fixture formulas. Counts/both medians and tails are retained without hiding regressions.

The original candidate run completed60 valid actual samples before an observer failure. Strict continuation compares all60 samples exactly against that retained report and hashes it; subsequent current14-role refresh and validated24 boundary/neighbor continuations are identified by their own hashes. The failed overall run is not labeled a passed gate. Final report1790875860389 passes; raw earlier failure reports remain private.

### Native polling on retained 10k /100k fixture

Same candidate pure Vite source, own Manager, headed native Chromium with no clock/visibility mocks: actual35-second windows visible1pending/0history, background0all, foreground1pending/0history, minimized0all. One-off stale focus catch-up is separately recorded. Pending50-row minimal list, zeroPOST and complete fixture hashes unchanged. [Actual native UI](evidence/approval-review-2026-10-02/manager-native-queue.png). Owned browser/runtime closed; no DB cleanup touches this preserved fixture.

### Retained observer failures

Actual TanStack request is a typed k/v AST; initial plain-JSON assumption was rejected. Missing Origin caused CSRF403 before capability authorization; those false-negative probes were discarded and same-origin positive/negative controls rerun. Claim snapshot had preceded its asynchronous response; wait actual response and authorized fresh detail. Manager-to-Admin picker returned no eligible user under existing scope; use Admin's own real picker. Replay now runs original body/key via actual own-page fetch with browser-created Origin/cookies. Fixed20-item first-step assertion was invalid under real soft time budget; bounded8+8+5 run passes. No application grant/server/time-budget changes were made to satisfy observers.

## Spec / acceptance mapping

| Approved design sections          | Owning tasks / evidence                                                                |
| --------------------------------- | -------------------------------------------------------------------------------------- |
| 1–4,11 module/interface/ownership | P2–P4; commits01f70cc/7d19783/e462096;81 interface/route cases                         |
| 5 frozen intent/latch             | P2/P3 tests; P6 actual double-click/retry                                              |
| 6 authorization/transactions      | P1 real projection; P5 actual PG races; P6 own/scoped/revoked roles                    |
| 7–8 safe outcomes/cache/retry     | P2–P4 restricted/newer/failing-refresh regressions; P6 actual replay/opposed actors    |
| 9 persisted projection            | P1 RED3/1 ->4/4; P6 actual version7->8                                                 |
| 10 validation/performance         | P5 fresh2475/zero skips; P6 measured table/native polling/neighbor receipt proofs      |
| 12 release/rollback               | P7 exact-head CI/merge gates; runbook below                                            |
| 13 tracking                       | Every task's status checkpoint; all30 CO19 verified_fixed/11 blocked_external retained |

## Release / rollback checklist and remaining gates

- [x] P1–P6 local/real-PG/own-role/runtime acceptance and sanitization review complete.
- [x] Migration/reconciliation for this refactor: no new operation required. Historical snapshot/anomaly gates remain blocked separately.
- [x] Sequential whole-branch self-review; no independent agent review claimed under user's no-agent instruction.
- [x] Reviewable PR155 attached; final live merge/check/hold proof is maintained in its body.
- [ ] Exact final-head static/browser/real-PG zero-skip/isolated migration+seed replay green, latest main reconciled, UAT head application-tree equivalence verified before merge.
- [ ] Authorized green-only merge; fresh main CI and production hold/unchanged READY deployment read back.
- [ ] Production release: held, not deployed. Eleven external CO gates retain product release NO-GO; provider/legacy/history/PITR/operator/screen-reader acceptance is not waived.

## Reproduction, release and rollback runbook

1. Confirm checkout/full SHA, dedicated UAT Vercel project `prj_jlIsv7mLYGpZR4XEV4njX05jAZYJ`, independent Neon project/branch `polished-forest-15724329/br-solitary-butterfly-b3883kwo`, database `clientops_uat`, Auth origin hash and each own account binding before synthetic writes. Keep private config/session files ignored.
2. Run full serial Vitest against a fresh disposable PostgreSQL DB and the zero-skip verifier. Run pure `bunx vite build`, TypeScript/runtime types, clean-source lint and bundle budgets. Migration/seed package build is restricted to the fresh isolated CI PostgreSQL service.
3. Deploy a clean git export only to the dedicated UAT project, seed off; verify source-only build and actual `/api/build` before/after. Change only UAT alias with no in-flight tests.
4. Run pinned before/after collectors, seven own identities, 30 confirmed decisions per route, version7, real capability denials, scoped/expired/revoked grants, original payload/key replay and opposed permitted actors. Revoke only task-owned synthetic overrides after capture.
5. Run native GET/HEAD-only runtime and native polling observer on preserved 10k Tasks/100k Approvals. Zero POST; before/after hashes match. Close only task-owned browser/runtime.
6. Publish exact-head PR; static/browser/real-PG zero-skip/isolated replay green. Refresh main, reconcile if moved, review entire diff sequentially. Merge under existing authorization only after P1-P6 acceptance.
7. Read back merged main checks and served UAT SHA. Docs/observer follow-up proves unchanged application/config/schema tree and rebinds final UAT metadata; measured source reported separately. Read back production hold and cancelled production attempt; no production promotion.

Rollback: prepare reviewed UI-only changes restoring routes and corresponding controller/route tests from baseline ac7a1ed, or reverse P4 e462096, P3 7d19783, P2 01f70cc on a new review branch while resolving task documentation. Keep P1 6e30193 version projection, P5 PG coverage, server authorization, transactions, durable command/bulk receipts, schema and data. Repeat isolated gates. UAT-only rollback requires no active tests; alias previous dedicated deployment and record actual served SHA. No schema rollback/reconciliation is needed. Production release/rollback remains under then-current authorization; none performed here.

Known limits: AI retains role advisory where explicit scoped allow enables Approvals. Unconfirmed attempts retain original keys only within mounted controller; after navigation/reload refresh authorized server state before acting. Legacy snapshot/provider/operator/human-screen-reader blockers retain release NO-GO.

## P7 reproduced provider security gate — 2026-10-02 HKT

Final documentation headc0eb168 passed GitHub static/browser/real PostgreSQL2475 zero-skips/isolated migration+seed replay, but primary Preview deploymentdpl_BWmPFv6qZCRUNZjgWvgE6sF1vW1c and dedicated UAT metadata rebind were rejected with BLOCKED_PACKAGE. Existing @tanstack/react-start1.168.25 is affected by [official CVE-2026-102989/GHSA-qx66-fv34-fjm8](https://github.com/TanStack/router/security/advisories/GHSA-qx66-fv34-fjm8), an unauthenticated reflected XSS in server-function responses. No risk-bypass flag or green status override was applied.

Official first patched Start1.168.60 resolves core1.169.39; existing root Router1.170.41/plugin1.168.42 are aligned with that chain, pinned exactly. The repo's86400-second minimum release age and existing exclusions remain unchanged: npm publication times for all16 exact TanStack dependency nodes were verified and installation waited until the last relevant release became24hours old at2026-10-01T17:51:06.661Z. Ignore-scripts installation succeeded, lockfile resolves only patched core1.169.39.

Actual upgrade TypeScript failure (62 diagnostics) traced to five existing boundaries declaring error:Error, whereas the patched Router accepts unknown. Five one-token type-only edits now accept unknown; bodies retain existing safe message normalization/retry. TypeScript/runtime types/pure Vite/bundle gates pass; generated route output was proven identical modulo ordering then restored, with no manual routing change. Fresh whole-suite PG and exact patched hosted/native/CI gates are pending.

This necessary existing-dependency security prerequisite changes the runtime chain, so application/lock equivalence to measured804b163 no longer holds. Its completed evidence remains valid for that source only; final patched source will recapture60 actual samples, all14 own-role/24 boundary/three neighbor gates and native polling from scratch. Final preview/merge stays blocked until those gates pass. Primary production hold remains; its existing served deployment is not patched by this local change and no production deployment is claimed.

## Final patched-source acceptance / delivery checkpoint — 2026-10-02 HKT

**PASS:** [patched-source evidence](evidence/approval-review-patched-2026-10-02/runtime-and-uat.json), [official release-age/integrity chain](evidence/approval-review-patched-2026-10-02/official-patch-chain.json). Measured/served application source **eb53700165e13098190fcf0079aaf1d99e3a8510**. All14 own-role,60 new actual runtime samples,24 boundaries and all three neighboring workflows recaptured from scratch with no continuation. All21 bulk rows complete actual8+8+5 after reload under original operation/key; full terminal replay unchanged. Seven-role screenshots and neighbor/native screenshots are in the same evidence folder; each role uses its own validated upstream/profile/session.

Fresh newly empty clientops_approval_review_security_20261002 in task-only PG17.10/loopback64409: **2475 tests/326 files/zero skipped**,494.81s; aligned dependency installation completed before suite startup. Five boundary edits are type-only; final exact-head CI covers them. Patched head eb53700 exact Checks36903512326 / Database36903512314 pass **2475/326/zero skips**, isolated migration+seed replay, clean lint/types/pure Vite/bundles/browser. Primary source-only preview READY, dedicated UAT READY. Latest documentation/observer follow-up requires its own exact-head CI and UAT application-tree equivalence before green-only merge.

### Final patched runtime vs actual original baseline

| Route      | UI p50/p95 before ms | Patched UI p50/p95 ms | POST p50/p95 before ms | Patched POST p50/p95 ms | GET before -> patched |
| ---------- | -------------------- | --------------------- | ---------------------- | ----------------------- | --------------------- |
| /approvals | 3,631 / 4,093        | 3,707 / 4,229         | 3,310 / 3,779          | 3,344 / 3,849           | 2 -> 3                |
| /ai-review | 3,578 / 3,779        | 3,724 / 4,144         | 3,266 / 3,404          | 3,417 / 3,620           | 1 -> 1                |

30 real decisions per route/phase,1POST each, every actual DB approved/version1. The patched measurements are slower: UI p95 Approvals+136ms/3.3%, AI+365ms/9.6%; medians+76ms/+146ms. Growing retained synthetic datasets, sequential remote network runs and overlapping native diagnosis prevent assigning causality to the refactor/dependency patch. No performance improvement or whole-product performance PASS is claimed. Counts, tails and exact source are reported; Approvals retains its intentional additional authorized detail GET. Existing route bundle/zero-hidden/pending-only/minimal50-row budgets pass.

### Strict native polling recovery and acceptance

Native four actual35-second windows pass at the patched pure-Vite source on installed Chrome154.0.8037.58, its own fresh native profile, noDefaults=true and default sandbox; **1/0/1/0 pending requests**, history0 throughout periodic windows, no POST and all10k Tasks/100k Approvals/profile/receipt/audit hashes unchanged. Browser version differs from original Chromium153; it is stated separately, not substituted into the hosted timing samples. Native window established visible/focused before app mount.

Earlier downloaded-Chromium startup/heading timeouts and two installed-Chrome visible-response timeouts retained. The diagnostic proved actual visible/focused/online Query interval30s became **hidden / intervalfalse** during overlapping shell work, with zero requests. This invalidated the foreground test window; it did not establish a polling app regression. Running the final native observer without concurrent shell activity yields all four strict cases, without changing timeout/35s/visibility/no-write gates or any app polling source. Optional known installed chrome channel makes this reproducible without disabling sandbox or granting filesystem ACLs. Private diagnostic is not acceptance. Owned runtime/browser closed after unchanged-hash verification.

### Final release / rollback disposition

P1–P6 implementation and original + patched isolated acceptance complete. P7 matrix/runbook/PR155/source-bound proofs are ready; exact final-head merge/main/production-hold results are maintained in [PR155's delivery record](https://github.com/YNWAforever/ui-delight-maker/pull/155). This source checkpoint precedes that final merge; it does not invent future SHAs/checks. Full sequential self-review repeated for the official dependency pins, five type-only boundaries and native observer; no independent agent review claimed.

Rollback **must retain security commit eb53700** (patched packages/lock and unknown boundary type compatibility) together with P1 projection and P5 transaction coverage. Revert only P2–P4 UI/controller orchestration on a reviewed branch; preserve authorization, receipts, schema and data. The old vulnerable804b163 deployment is not an eligible UAT rollback target: rebuild a reviewed rollback with the patched chain, validate isolated gates, then bind only the dedicated UAT alias. No new migration/reconciliation; historical parity remains separately blocked.

All30 CO statuses19 verified_fixed/11 blocked_external remain. Production held, not deployed; no production DB/Auth/provider operation or real customer message. Existing production is not patched by a local/UAT update. Separate external release NO-GO is unchanged.
