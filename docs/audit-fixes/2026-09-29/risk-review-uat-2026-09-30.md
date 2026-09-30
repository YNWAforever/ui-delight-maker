# R04 / U13 held risk review — isolated UAT

## Scope and current result
Independent synthetic Neon project `polished-forest-15724329`, empty branch `br-solitary-butterfly-b3883kwo`, independent Auth, genuine role accounts. Detached dedicated UAT source `eaedb659b6aac4559114299c717faa46fb6a436e`; risk source is unchanged in merged main `e2b1a36`. Original import URL remains `a18aa46`. No provider dispatch, real customer message, production DB access, production promotion or migration.

The held risk fixture tests use synthetic persisted `cs_risk_review` proposals and linked `score_renewal_risk` runs. They do not prove a live LLM/provider generated the proposal. Full U13 and provider-generation acceptance remain open.

## Before fix — actual UI defect retained
[Raw observations](evidence/risk-role-before-2026-09-30.json) retain success=false:
- Actual own client_success can read proposal; Approve is absent.
- Actual own manager UI Approve and confirmation reaches a deliberately failing SQL trigger on the exact synthetic engagement. Approval, run, engagement, audits and receipt all remain unchanged; error is visible.
- Own client_success/read_only same real POST is Forbidden; every related state remains unchanged.
- Removing the trigger permits the exact same key/body retry: one approval/version-one, updated engagement score/reasoning/action, completed reviewed run, one approval audit, one engagement audit, one actor-bound receipt. Terminal replay and refresh introduce no duplicate writes.
- Matching `engagements.update` deny still leaves Approve offered, although the actual POST is Forbidden and state is unchanged. This is a UI affordance defect; server transaction authorization already protects the data.
- Actual manager UI Reject retains the whole previous engagement, completes the linked run with rejected outcome, creates one approval audit/receipt and replays unchanged.

Screens: [CS](evidence/risk-before-client-success-before.png), [SQL error](evidence/risk-before-manager-rollback-error.png), [deny](evidence/risk-before-manager-engagement-deny.png), [approved](evidence/risk-before-manager-approved-replay.png), [rejected](evidence/risk-before-manager-rejected.png). Initial deny screenshot shows the selected synthetic record; raw observations include the actual button query and POST result.

Earlier observer failures remain private and recorded: `risk-530c1eaf` assumed a nonexistent `decided_by` column; `risk-f4400db4` reused another record's key, correctly causing an idempotency conflict. Neither is a product regression or passing run. Final observer uses a new key for a different record and preserves exactly the same key/body for retries/replay. All injected triggers removed and temporary overrides revoked.

## Candidate and regression
Use existing `engagements.update` policy on the current persisted linked owner, with one batched lookup per risk page. Missing/malformed targets fail closed; owner columns stay server-local. Decision flags require both independent grants. Assign/request changes retain their existing separate approval authorization, matching the authoritative command's escalation behavior. No grant, command guard, transaction, schema, migration, lease or provider behavior changes.

New actual PostgreSQL regression: **7 failed / 7 passed before fix**; after fix **32/32** across risk action flags, existing quote/approval affordances and risk atomic workflow. Includes each role's existing policy, scoped allow/deny/expiry, both grants for read_only, current owner reassignment, malformed/missing targets, uppercase UUIDs, 100-row bounded deduplicated lookup and no ownership-field leak. PostgreSQL fixture uses migrations 001–021; network adapter executes actual SQL via pg.Pool, not fixture query responses.

Fresh complete isolated PostgreSQL, hosted fixed-source seven-role UI, exact-head CI and merge follow. No full R04/U13/release PASS inferred.

Fresh empty loopback PostgreSQL DB `clientops_risk_flags_final_20260930` passes **2,308 / zero skipped / zero todo**, 314 files, including real concurrency/rollback/idempotency. TypeScript, touched-source ESLint, pure Vite client/SSR, bundle gates and diff check pass. Fixed-source hosted seven-role UAT and exact-head CI remain pending.

## Hosted fixed-source acceptance
Source **0075e198a84e2ea8d1c3a04638dcc11a69db2e96**, dedicated detached deployment **dpl_8gwEbsnmcJCCTP1L7eg25Q8WDTsR**, actual independent DB/Auth. Hosting protection retained, separate own application-role cookies and candidate-only machine cookie; no automatic promotion. [Binding metadata](evidence/risk-detached-deployment-0075e19-2026-09-30.json).

Actual own **all seven roles PASS**: super_admin/admin/manager see Approve/Reject on the authorized held proposal; sales/client_success/accounting/read_only do not. Each identity independently matches Auth. Four denied roles' captured real manager request returns Forbidden with every related state unchanged. Own manager matching engagement deny removes Approve/Reject, bulk selection also excludes the row, while allowed request changes/routing remain. Same request is Forbidden; state unchanged. Real SQL-fault rollback, exact same-key retry, terminal replay, refreshed approved UI and actual UI Reject preserving the entire prior engagement all PASS. All injected triggers removed and temporary overrides revoked.

[Full result](evidence/risk-role-after-0075e19-2026-09-30.json), [effective deny screen](evidence/risk-after-manager-engagement-deny.png), [manager](evidence/risk-after-manager-risk-actions.png), [client_success](evidence/risk-after-client_success-risk-actions.png), [read_only](evidence/risk-after-read_only-risk-actions.png). Every role screen is saved alongside the result. Held-proposal application scope accepted; live provider generation and historical reconciliation remain open.

Exact-source Checks36717151935 / DB36717153132 pass **2,308 real PostgreSQL tests / 0 skipped**, isolated replay, browser collector, types/lint/Vite/bundles/Vercel. The initial local CI-log parser overlooked ANSI formatting; the actual explicit no-skips gate line was verified. No test/gate change.

## Risk-specific actual runtime gate
Same machine/browser/genuine own manager identity, exact same disposable PostgreSQL snapshot:10,000 Tasks/100,000 approvals, with100 synthetic pending risk rows referencing a synthetic engagement. Original all-qualification fixture remains untouched. Both sources use real production SSR, loopback WebSocket/TCP PostgreSQL and strict GET/HEAD-only app transport. Each source has **10 cold + 30 warm actual navigations**, complete scoped SQL metrics, no failed/blocked requests or failed queries. Counts and aggregate versions remain unchanged; actual own Auth identity rechecked.

| Source | Warm rendered p95 | Cold rendered p95 | SQL duration p95 | Max document/data | Max cold encoded JS | Scoped SQL |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Before main e2b1a36 |566.581ms|3,900.521ms|633.241ms|74,832B|270,146B|44|
| Fixed0075e19 |542.842ms|2,091.712ms|604.545ms|74,832B|270,146B|45|

Unchanged gates **PASS**: warm p95≤800ms, document/data≤150KiB, cold encoded JS≤300KiB. One additional bounded risk ownership read is expected and required for effective authorization; there is no N+1. Observed timings do not establish a general speedup or production SLA. [Before samples](evidence/r06-risk-before-e2b1a36-2026-09-30.json), [after samples](evidence/r06-risk-after-0075e19-2026-09-30.json).

The performance fixture preparer initially used SQL + for text concatenation, then cast an actual UUID subject to text in a join. Both preparation errors were corrected before measurement, with original exact synthetic identities reused; no app/schema change or source/gate exemption. All local runtime servers stopped after captures. Provider-generation, historical reconciliation, remaining broader UAT and production release gates remain open.
