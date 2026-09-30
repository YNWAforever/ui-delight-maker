# Claimable approval detail repair — 2026-09-30

## Actual hosted failure

Own manager, seven-account independent UAT, source `a18aa46`: an unassigned pending quote approval is correctly included in the manager's linked-subject queue. Actual selected-detail **GET** returns HTTP200 with a serialized **Target is outside your management scope** error. UI has no payload/Claim for review. The approval remains unassigned/pending/version0; no mutation occurred. [Raw safe result](evidence/u04-manager-claim-detail-before-a18aa46-2026-09-30.json), [actual screen](evidence/u04-manager-claim-detail-before-a18aa46-2026-09-30.png).

The detail handler required approval ownership from the unassigned reviewer field before evaluating the already-supported persisted linked-subject claim permission. This was the reproduced U04 revision-B blocker; the corrected actual workflow below completes that isolated scenario.

## Focused correction

The selected detail evaluates the existing read-only claim proof from the current persisted linked quote/run subject. That proof requires **both approvals.view and approvals.decide**, including existing effective overrides, current actor scope/status and real ownership. Otherwise the normal assigned-record view guard remains required. A normal assigned or terminal row never uses this claim exception. Missing/unowned/unrelated subjects fail closed.

Claim writes recheck both grants after the existing approval/run locks. Transactions, expected version, unique receipt, claim ownership and original roles/grants are unchanged. Explicit view deny now suppresses the affordance and rolls back a direct claim, including its receipt/audit. No new policy grant, migration or provider integration.

## Actual isolated PostgreSQL regression

After aligning fixture context FK/receipt schema and the existing Forbidden/OutsideScope error codes, the valid pre-fix suite was **3 failed / 9 passed**: claimable detail blocked, view-denied affordance offered, view-denied direct claim persisted. No fixture-scaffold failure is counted as a product regression.

All **12 new real migrated PostgreSQL cases** now pass. Current owner change, expired allow, explicit view/decision deny, inactive actor, terminal/unrelated assignment and unowned target cases are included. Denied command leaves approval/audit/receipt unchanged. Real four-file related suite is **48/48**, retaining the existing two-reviewer concurrency, rollback and same-key replay cases. Only the request-context/server-function boundary and DB driver adaptation are stubbed; the actual authorization evaluator, SQL, migrations and transactions execute against isolated PostgreSQL. These tests do not substitute for genuine-role hosted UAT.

Types, touched lint, pure `bunx vite build`, existing bundle gate and diff check pass. Fresh isolated local full suite and exact-source CI each pass **2,325 tests, 316 files, zero skipped**. Migration/seed replay also passes. [Source gate proof](evidence/claimable-source-gates-8691421-2026-10-01.json). Final documentation-head checks and post-merge verification remain required.

## Isolation and delivery

The stable [UAT](https://clientops-uat-20260930.vercel.app) stays a18aa46 while Client/Event5000 operations run. Repaired source `8691421` uses a separate candidate on the same dedicated independent UAT project, with automatic domain promotion disabled. Keep original import keys/deployment untouched. Production stays held; release **NO-GO**. Rollback is a source revert; no schema or historical data correction.

## Seven genuine roles — 2026-10-01 HKT

[Ten actual hosted cases](evidence/claim-seven-roles-8691421-2026-10-01.json) pass at detached deployment `dpl_JCVzK97MveRif6vBPSyD2JydUbZK`. All seven real Auth user IDs and seven own cookie sets are distinct. SA/admin/manager see Claim for review; sales/client_success/accounting/read_only see the authorized detail without Claim, and their direct real POSTs deny with approval/audit/receipt unchanged.

Matching manager `approvals.view` and `approvals.decide` denies each omit the claimable row, deny direct GET without payload, and deny actual POST without state/audit/receipt writes. All temporary overrides were revoked. After revocation, actual manager UI claim writes one version, one receipt and one audit; same-key replay and reload agree, with no second Claim. [Manager detail](evidence/claim-manager-detail-8691421-2026-10-01.png), [reader](evidence/claim-read_only-detail-8691421-2026-10-01.png), [denied queue](evidence/claim-approvals-view-deny-8691421-2026-10-01.png), [claimed](evidence/claim-manager-claimed-8691421-2026-10-01.png).

Initial observer errors are retained privately: detail was fetched before the wait listener because it was already selected; the serialized denied command initially reused the successful source command key and correctly conflicted. The corrected observer captures the actual early GET and creates fresh keys in the actual serializer. These are observer corrections, not permission exceptions. Genuine-role tests are separate from local DB boundary stubs.

[Six-case immutable A/B workflow](evidence/u04-immutable-a-b-8691421-2026-10-01.json) completes U04 in this isolated synthetic scenario: original A200.50, new B601.50, fixed original acceptance/snapshot/sheet and exact-key replay. Provider-run recovery, historical compatibility/parity and release gates remain open.
