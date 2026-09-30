# Source and environment checkpoint — 2026-09-30 HKT

## Source delivery

[PR #123](https://github.com/YNWAforever/ui-delight-maker/pull/123) merged the R06 Chromium collector to main at `82d8ad7de342c673b08887325f9b46fd3caa2803`. Source commit: `2c14f0b50567910e6597d68e6b0a3621585bc5b9`; final PR head: `48f6b2a8fdbaa2f9145f2d75656409eaa34355e7`. Its protected preview `/api/build` returned that exact head.

- [PR Checks](https://github.com/YNWAforever/ui-delight-maker/actions/runs/36595294621): app/runtime types, lint, pure Vite build, bundles and real Chromium collector integration passed.
- [PR Database contract](https://github.com/YNWAforever/ui-delight-maker/actions/runs/36595294544): 2,198 real isolated PostgreSQL tests, zero skipped, and two-run migration/seed replay passed.
- Post-merge main `82d8ad7`: [Checks](https://github.com/YNWAforever/ui-delight-maker/actions/runs/36595958575) and [Database contract](https://github.com/YNWAforever/ui-delight-maker/actions/runs/36595958541) passed again: Chromium, app/runtime types, lint, pure build, bundles, 2,198 real isolated PostgreSQL tests with zero skipped and two-run migration/seed replay.
- The [collector runbook](r06-browser-collector.md) describes 10-cold/30-warm capture. Synthetic HTTP integration verifies the collector, not authenticated ClientOps performance or seven-role UAT.

## Production identity changed independently of this merge

Read-only checks on 2026-09-30 HKT found deployment `dpl_2XjJ6dX9xPT4uT2LCtQt2GujiDEY` READY with target `production`, SHA `bed941b37d18d214d0e7658ebce2116a2fc33eb9` and ref `codex/clientops-r06-route-js-evidence-20260929`. Its creation timestamp is 2026-09-29 15:40:38 UTC, not proof of alias-switch time.

The public [production build endpoint](https://ui-delight-maker.vercel.app/api/build) returned that same SHA. This supersedes earlier statements that production still served audited SHA `2904faa`. Deployment metadata retains alias names on the old READY deployment too; READY status alone does not identify the currently served version.

The production attempt for main `82d8ad7`, deployment `dpl_BPcdjmT5TCqk6JwzoUE6E4sy3Wwk`, is CANCELED. This task did not promote or roll back either version. Available evidence does not establish the actor, authorization, promotion mechanism, schema changes, or business acceptance of the separate READY deployment. The build-log connector was unavailable; no build-time data-operation claim is made.

Release acceptance remains **NO-GO**. Reconcile the release record and build-hold coverage with the responsible operator before any further promotion or rollback.

## Isolation and missing inputs

The supplied `C:\Users\laich\Documents\FIMMICK ClientOps` folder still contains two repository directories; no new acceptance package was identified. Earlier filename-only inventory found no identifiable role-session, legacy/Neon snapshot, provider sandbox or anomaly-disposition package.

Read-only Neon branch inventory for project `delicate-cake-75532180` returned only:

| Branch | State | Isolation disposition |
| --- | --- | --- |
| `br-young-rice-aoyk6gjz` / production | ready | Production; excluded from disposable tests. |
| `br-morning-truth-ao7csp1s` / staging | archived | Created from production data; name alone proves neither de-identification nor disposable role fixtures. |

No branch was created or resumed, no connection string was retrieved, and no database was queried or changed by this inventory.

## Remaining acceptance by backlog

| Backlog | Required proof still blocked |
| --- | --- |
| R00 | Seven distinct isolated role sessions, same-record fixtures, app/auth/DB binding and worker/flag identity. |
| R01 | Four historical anomaly owner dispositions/provenance and disposable compatibility rehearsal. |
| R02 | Authenticated bulk retry, offline/reconnect and independent receipt read. |
| R03 | Authenticated dialog/shell keyboard, required widths, 200% zoom and screen reader; public anonymous proof remains separate. |
| R04 | Seven-role same-record workflow, handoff, visibility and state UAT. |
| R05 | Authenticated import/export lifecycle, source identity inventory and retention dry run/owner. |
| R06 | Same-data/machine authenticated before/after, 10 cold + 30 warm navigations, 10k tasks/100k approvals and DB binding. |
| R07 | De-identified legacy and Neon snapshots for five-domain parity; provider/n8n sandbox callbacks and delivery receipts. |
| R08 | Those gates, deployment provenance, operator/PITR/compatibility and release/rollback rehearsal. |

All 30 CO IDs remain tracked in [status](../2026-09-27/status.md). Missing role, snapshot, provider or runtime proof is not promoted to PASS by source CI. The [release and rollback checklist](../2026-09-27/release-checklist.md), [UAT results](../2026-09-27/uat-results.md) and [migration/reconciliation disposition](../2026-09-27/production-reconciliation-disposition.md) remain the operational handoff.


## Current acceptance delta after independent UAT and R06

The earlier missing-role/environment/runtime statements describe that checkpoint. [Independent UAT](isolated-uat-environment.md) now has seven genuine role sessions. Scoped quote U03 and billing U07 pass; [real R06 before/after](r06-runtime-before-after-2026-09-30.md) passes Task/Approval queue budgets with 10 cold/30 warm and 10k/100k real PostgreSQL data. Wider UAT, import/bulk/offline, zoom/screen-reader, legacy/provider/anomaly provenance and operator release rehearsal remain incomplete. No production promotion; public build remains `bed941b` under the approved hold.

## Latest approval slice

Source `fac59c9` / PR #134: U05 actual manager/admin opposed decisions, conflict, one terminal audit/receipt/version, refreshed UIs and unchanged replay PASS. Seven distinct role decision/notes/selection boundaries and four scope cases PASS; U12 scoped CS manual statement/replay PASS with no delivery/provider claim. Final actual R06 40-navigation gate PASS (warm p95 506.768ms), both intermediate failed runs retained. Local and source CI **2,279 / 0 skips**. [Case evidence](approval-role-uat-2026-09-30.md). Final evidence-head CI/merge pending. All 30 CO/16 UAT rows retained; bulk/import/risk, other full UAT, legacy/provider/anomaly/operator release gates remain open; production held.

## R02 Task recovery acceptance delta

[PR #135](https://github.com/YNWAforever/ui-delight-maker/pull/135), source `53dc62f`: exact source local/CI full suite **2,282 / zero skipped**, empty-schema queue fixture16/16, unchanged real queue runtime budgets, same-fixture preview68.0s→14.4s single observed pair, actual U08 100 mixed loss/reload/key replay/resume PASS and reader receipt denial. [Complete report](bulk-recovery-uat-2026-09-30.md). Documentation-head CI/merge remains required. CO-16 member/other bulk, R05 and wider/external acceptance stay open; production hold retained.

## R05 continuation after merged #135

- PR #135 merged at f378fdf0f7c726238dabc03516fd6477d07612a6 after exact head 01421723c9916cef72ba540034b660c4db733d0a passed Checks 36693744669 / DB 36693744842 (2,282 / zero skipped), replay/browser/Vercel. Post-main Checks 36694591177 / DB 36694591172 passed. Production read-only hold proof after #135: canceled main attempt, public bed941b unchanged; no promotion.
- R05 production preview defects reproduced at source53dc62f: unhydrated file selection sends no POST; hydrated 5,000-row request returns HTTP504 at301,568ms. No commit/business writes. Request-local batched lookup candidate reduces the executed 9,992 lookup queries to at most three on the mixed Lead fixture, retaining validation/duplicates/source lines. Hydration controls are gated through ClientOnly. 21 focused true PostgreSQL/UI cases pass, including all-kind matching equivalence, namespace isolation, owner-change refusal, concurrency/rollback/idempotency/resume. Full fresh suite, hosted fixed-SHA runtime/lifecycle and CI remain pending; U09 not accepted. [R05 report](import-preview-uat-2026-09-30.md). All30/16 retained; remaining external/production gates unchanged.

- PR#136 recovery source a18aa46273b10edc9cc75dbb11188ad9d49c98e6 exact Checks36702543051 / DB36702542944 passed2,294/0skips, replay/browser/Vercel. Actual original paused import read-recovery PASS:8 earlier writes and exact key retained, Retry reads only, replacement disabled. Fresh5000Lead preview9688msPOST accepted; full loss/replay/resume/role reads/export running. No fullU09 PASS inferred; Client/Event/source inventory/retention and remaining broader/external gates open. [R05](import-preview-uat-2026-09-30.md). Final docs-headCI required, production held.

- 2026-09-30 PR #136 merged at `1b48265d913c82d1d476fe2e701682cd88ff7af4` (2026-09-30 10:56:15Z), after exact final head `f6126d762d66ecfe5cf7a51aaf79424a6deaf88f` passed Checks `36704661537` / DB `36704661510`, **2,294 real PostgreSQL tests / zero skipped**, replay/browser/Vercel. Post-main Checks `36705446703` and DB `36705446706` also passed **2,294 / zero skipped**. [Production hold proof](../2026-09-29/evidence/production-hold-after-136-2026-09-30.json): canceled merge deployment, public build bed941b unchanged, no promotion. Full U09 lifecycle remains running.

- 2026-09-30 R03 / U10 actual own-admin baseline: 250th eligible profile pagination/selection/name retention and invitation focus/Tab/Shift+Tab/Escape/invalid-input passed. 390px dialog passed; **768px document overflow FAIL (800px vs768px)**, so the complete run remains success=false and later cases are not accepted. People grid now stacks below xl; existing controls retained. **26 focused tests**, types, touched lint, pure Vite and bundles passed; exact-SHA hosted recapture pending while R05 continues. [Evidence](../2026-09-29/admin-directory-uat-2026-09-30.md). No real invitation, schema change or production operation. All30 CO/16 UAT retained.
