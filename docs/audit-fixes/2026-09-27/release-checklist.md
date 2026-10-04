# ClientOps audit release candidate — 2026-09-28

## Current scope override — 2026-10-03 HKT

[User-approved scope](scope-no-supabase-2026-10-03.md) removes Supabase backup/resume/restore and withdraws its pending backup request. Legacy acquisition is no longer an active deliverable. Existing domain compatibility remains unverified; production is NO-GO pending applicable domain, historical, provider, retention/PITR/rollback and human screen-reader evidence. This does not reclassify any blocked CO as verified.


## Current acceptance checkpoint — 2026-10-03 HKT

Use the [current source/CI/UAT, R00–R08 matrix and external owner ledger](../2026-09-29/current-acceptance-2026-10-03.md). PR160 is merged at `08ae873f81de48d46516649d9f64ab4a7ecf1fe4`; exact main Checks and real PostgreSQL CI passed2543 tests/331 files/zero skipped with isolated migration/seed replay. The canonical independent UAT serves runtime `87c5438f015b3bbc632cb935285e64aaa2c557c2`; its runtime/config/schema match that main, with documentation and test setup differences explicitly recorded. Migration022 and seven own-role identity/home UI are verified on this independent target. Production hold/older READY `bed941b` remain unchanged; no production migration, seed or promotion occurred. Historical compatibility, real provider/invitation/worker, operator release and human screen-reader gates remain open. Supabase acquisition/restoration is excluded, and Supabase runtime functions are forbidden.

This continuation also corrects actual SSR capability/scope denials from500 to403 through the supported server entry, without changing authorization or schema. Its own exact-head/main full checks and patched own-role UAT are required. Existing source-specific commercial workflows and performance observations retain their original scope; they are not a fresh full-product run on main08ae873 or the new HTTP correction.

## Historical acceptance checkpoint — PR155 / 2026-10-02 HKT

[Current feature → route/server → migration → test/live evidence map and gate owners](../2026-09-29/final-local-acceptance-2026-10-01.md) supersedes historical blocked-preview cells below. PR155 final97891b9 / merged main100153e required CI **2,475/326/zero skipped**, isolated replay/static/browser/source-only Preview PASS; dedicated independent UAT actually serves97891b9 with app/config/schema/lock equivalent to measured patchedeb53700 and merged main. Seven distinct real upstream/profile/sidebar roles and defined workflows/native background polling PASS. [Actual merge, live GET binding and read-only hold proof](../2026-09-29/evidence/pr155-merge-2026-10-02.json). Supabase Preview SKIPPED/legacy-disabled is not integration acceptance; this docs-only follow-up requires its own exact-head/main checks before merge.

Primary production hold unchanged; main100153e attemptCANCELED/latestREADYbed941b unchanged. **Release NO-GO / 未部署 production** pending historical dispositions/#102 impact, paired legacy/Neon snapshots and cutover parity, provider/invitation/n8n telemetry, approved retention/operator-PITR/rollback rehearsal and human screen-reader evidence. Seven-role availability/native-background acceptance are completed for their recorded scopes, not generic remaining blockers. Actual patched decision p95 is slower4093→4229ms/3779→4144ms; no performance improvement claimed. No new migration/reconciliation or production data/Auth/provider operation.

Current rollback retains official patched Start/Router/core chain and five unknown boundary annotations, P1 version projection, server authorization/transactions/receipts/schema/data; rebuild and verify a reviewed UI revert. Do not point the UAT alias to vulnerable historical pre-patch source. [Module release/rollback runbook](../2026-09-29/approval-review-module-2026-10-01.md). No production release is authorized by this packet.

**Previous checkpoint (2026-10-01 HKT): PR151 merged to main271095d; release NO-GO.** Exact final-head/post-main2,414/zero-skipped PostgreSQL CI/replay/static and actual own-role recovery/original-key/expiry proof PASS. Canonical dedicated UAT remainsfc4a2fd; real production remainsbed941b and this attempt wasCANCELED. CO30 source7dc40fd local/actual hosted criteria PASS with2,424/zero-skipped source CI; final documentation-head checks/merge pending. Historical/snapshot/provider/operator/screen-reader gates remain separately blocked. [Checkpoint](../2026-09-29/checkpoint-2026-09-30.md). Earlier entries below are historical.

**Historical integration checkpoint:** The audited application baseline was main SHA `2904faa502f7494173f48f412875c1d0a3aba674`. PRs #82–#101 landed on `codex/clientops-reviewed-integration`; [PR #103](https://github.com/YNWAforever/ui-delight-maker/pull/103) merged that source into main at `f038919b95ff085190401f64078b78bc8781dd4d`. At that checkpoint, the latest READY Production deployment was `dpl_BubNGhS2HFmmvjcUYfiKiasDwcLU` at the audited SHA. The user-approved Vercel hold canceled automatic main builds; the later READY production identity requires operator reconciliation. The 30 finding states remain in [status](status.md); code CI does not upgrade blocked role, data-parity or provider gates.

## Earlier source checkpoint through PR #116 — 2026-09-29

Main `8b6241376a5ca3f9af5c6a6157a351c83c6b64e4` includes merged PRs #111–#116. PR #116's protected preview `/api/build` matched its exact head `a1741b3b168a908d470c7cbc1e9af2fdb480559b`; its Checks, real isolated PostgreSQL contract (2,188 tests, 0 skipped) and two-run migration/seed replay passed. Post-merge main repeated the same static, 2,188/0-skip database and replay gates. The latest READY Production deployment remains audited `dpl_BubNGhS2HFmmvjcUYfiKiasDwcLU`; the production build hold remains active.

The [2026-09-29 acceptance delta](../2026-09-29/acceptance-delta.md) records the 751-case audit baseline and current proof. Seven-role browser UAT, legacy/Neon snapshot parity, four historical anomaly dispositions, provider sandbox, authenticated full-route before/after and operator rehearsal/PITR are still blocked. Release decision remains **NO-GO**. No migration/seed was run against an unverified target, and no production write, promotion, customer message or paid provider call occurred.

## Earlier application-source checkpoint through PR #120 — 2026-09-29

Main application source `5607b4d06514fe15da892303f0b2f7d7cb2d77a3` includes the merged anonymous password-recovery form and back-navigation fixes plus the 14-ID [source census](../2026-09-29/dynamic-action-census.md). PR #120's protected preview `/api/build` matched exact source head `376d05e` and final docs head `1b999e0`; real Chromium Tab/Enter returned from forgot-password to sign-in at 390px. [Public browser evidence](../2026-09-29/public-auth-browser-evidence.md) covers only the anonymous candidate journey. Post-merge main Checks, 2,190 real isolated PostgreSQL tests with zero skipped, and two-run isolated migration/seed replay passed. No open PR remained at this checkpoint.

The latest READY Production deployment is still audited SHA `2904faa502f7494173f48f412875c1d0a3aba674` under the approved build hold. Seven distinct role sessions, legacy/Neon snapshots, four historical anomaly dispositions, provider sandbox receipts, authenticated full-route performance before/after, 200% zoom/screen-reader UAT and operator/PITR rehearsal are not supplied. Release stays **NO-GO**; no production migration, data mutation, provider send, customer message or promotion was performed.

## Historical source-delivery map

The table below is the historical source-delivery snapshot. Its preview cells are not current acceptance results; use the [current sixteen-case UAT matrix](uat-results.md) and linked exact-source browser/DB evidence for each executed scope.

| Slice / findings | Route or entrypoint | Server owner | Migration | Local proof | Preview |
|---|---|---|---|---|---|
| T00–T02 input and auth / CO-22,30 | workspace shell, all writes | request authorization context and schemas | 001–009 baseline | [T01](t01-evidence.md), [T02](t02-evidence.md) | blocked |
| T03–T04 read/import authorization / CO-01–04 | search, home, approvals, sheets, imports | scoped read models and row authorization | existing | [T03](t03-evidence.md), [T04](t04-evidence.md) | blocked |
| T05–T07 approvals and quote lifecycle / CO-05–08 | approvals, quote detail | decision and quote lifecycle transactions | 010–012 | [T05](t05-evidence.md), [T06](t06-evidence.md), [T07](t07-evidence.md) | blocked |
| T08–T10 finance, dates and risk / CO-09–11,26 | quote, Xero, reports, client success | Xero transitions, accepted period, risk review | 013–014 | [T08](t08-evidence.md), [T09](t09-evidence.md), [T10](t10-evidence.md) | blocked |
| T11 recovery / CO-12–13 | approvals, agent runs, message handoff | scoped claim and supersede | 015 | [T11](t11-evidence.md) | blocked |
| T12 queues and people / CO-14–15,20 | tasks, approvals, Admin picker | keyset pagination and purpose-scoped directory | 016 | [T12](t12-evidence.md) | blocked |
| T13 and T17 bulk / CO-16,20 | Lead, Task, Approval, Team, Job Sheet | preview, item receipts, resumable operation | 017–018 | [T13](t13-evidence.md), [T17](t17-evidence.md) | blocked |
| T14–T15 CSV/import / CO-17–18,29 | Lead, Client, Event import/export | parser and actor-owned import sessions | 019 | [T14](t14-evidence.md), [T15](t15-evidence.md) | blocked |
| T16 Job Sheet / CO-19 | Job Sheet list/detail | handoff and commercial lock | 020 | [T16](t16-evidence.md) | blocked |
| T18 workspace access / CO-21 | signup, invitations, Admin | identity and workspace state | existing | [T18](t18-evidence.md) | blocked |
| T19 performance / CO-23–24 | login, shell, queues | lazy shell and request SQL metrics | 016 indexes | [T19](t19-evidence.md) | blocked full route |
| T20 legacy / CO-25 | deals, projects, customer success, automation, engagement | source guard and read-only parity | no cutover migration | [T20](t20-evidence.md) | blocked snapshot |
| T21 AI / CO-28 | note tidy, n8n callbacks | governed invocation and telemetry | 021 | [T21](t21-evidence.md) | blocked provider |
| T22 docs/CI / CO-27 | GET /api/build, GitHub workflows | public SHA metadata and zero-skip gate | none | [T22](t22-evidence.md) | protected PR #103 preview SHA `cb86721a4e13ffc82710ea7cbe4e9386db6929bd` matched; role UAT blocked |

## Performance evidence

| Measure | Before | Candidate after | Scope |
|---|---:|---:|---|
| Login initial static JS gzip | 222,420 bytes at T18 | 165,482 bytes at T19; 165,496 bytes at this T22 pure build | Actual emitted manifest assets, not browser transfer timing |
| Task list+count SQL p95, 10,000 tasks | unavailable on same baseline | 33.5 ms at T19 | 30 real isolated DB samples; SQL component only |
| Approval list+count SQL p95, 100,000 approvals | unavailable on same baseline | 522.6 ms at T19 | 30 real isolated DB samples; SQL component only |
| Task browser warm readiness p95 |400.687ms |399.744ms |Actual same-machine/data10 cold/30 warm; defined queue PASS, [R06](../2026-09-29/r06-runtime-before-after-2026-09-30.md) |
| Approval browser warm readiness p95 |689.450ms |636.795ms |Actual same-machine/data10 cold/30 warm; cold p95 regressed and remains recorded; [R06](../2026-09-29/r06-runtime-before-after-2026-09-30.md) |
| Agent recovery authenticated SSR warm p50/p95 |7,101/8,009ms |5,820/7,568ms |Actual paired unchanged current dataset, each10 fresh-cookie contexts/30 warm; SSR request time, no full-product/CWV claim; [U11 samples](../2026-09-29/evidence/agent-owner-cache-runtime-2026-10-01.json) |

See [T19 measurements](t19-evidence.md) and its machine-readable artifact. The old fixture formula is synthetic and is excluded from this table.

## Migration and data reconciliation — historical through PR155

The observations below retain their original dates and source. Current candidate migrations are001–022, the five domain repositories are Neon-only, and Supabase backup/resume/restore/source reversal is excluded. Use the current checkpoint and Neon-only runbook above for operations.

- Commit `876ddef` makes Vercel's automatic PR/production build command source-only (`bunx vite build` plus output packaging). The first two PR #100 previews used the former wrapper and failed during seed with `Quote version is immutable`; its database isolation was not verified. Do not use an automatic build to apply migration or seed. Before a future release, rehearse and separately authorize the schema/data operation on an identified target, then deploy the source.
- The linked Neon production ledger already contains migrations 010–021, applied on 2026-09-27; current catalog inspection confirms enabled integrity guards. The old READY application SHA does not imply an unchanged database. Historical preview binding, full schema compatibility and reconciliation remain unverified; see [production read-only findings](preview-database-triage.md).
- Migrations 001–009 predate this remediation. New additive changes are 010 command versions/receipts; 011 immutable quote version guard; 012 one open quote approval; 013 Xero transitions; 014 locked Job Sheet portions; 015 agent recovery metadata; 016 queue indexes; 017–018 bulk receipts and row versions; 019 import sessions/identity keys; 020 handoff fields; 021 AI invocation telemetry.
- The local wrapper now uses a narrowly guarded `pg` adapter only for matching loopback disposable test URLs. The first full wrapper and two direct synthetic seed runs passed on isolated pgvector PostgreSQL; CI passed two full wrapper runs on its own fresh service at checkpoint `69fe0fe`; both had 21 migrations, 3 profiles, 5 Quotes, 1 version and 4 approvals. This does not replace a Neon-compatible disposable-copy rehearsal or operator sign-off.
- The isolated PostgreSQL contract and full suite are recorded in [T22 evidence](t22-evidence.md). The normal `bun run build` wrapper includes migration and seed; do not invoke it on a database whose identity and disposability are unverified.
- Read-only inventory and reconciliation precede any production schema write. The authorized linked-production read-only inspection found 1 Job Sheet missing accepted_at and 1 terminal approval missing decided_at; broader legacy anomalies and historical cause remain unreconciled (see preview-database-triage.md). Preserve them for an operator decision; never manufacture a snapshot or acceptance timestamp.
- [T20](t20-evidence.md) cannot report cross-database row count, ID, owner, task or override parity until the promised isolated legacy and Neon snapshots arrive. All five domains stay on Supabase. There is no backfill, dual-write proof or cutover authorization.
- Before an approved production migration, the operator must provide backup/PITR point, rehearsal against a matching disposable copy, migration duration/locks, anomaly inventory and reconciliation sign-off. No such production gate has been satisfied here.

## Release gates — 2026-09-28 checkpoint

| Gate | Current result | Owner / way to close |
|---|---|---|
| PR/source CI on exact head and main push | PR #103 exact-head Types/lint, 2,172-test contract with zero skipped, isolated replay and Vercel preview passed; main `f038919` Types/lint, 2,172-test contract with zero skipped and isolated replay passed; Supabase Preview failed due the organization free-project limit | engineering monitors source CI; Supabase owner resolves quota without changing release gates |
| Full isolated DB, zero skipped | tested candidate local pass: 306 files / 2,172 tests, 0 skipped; final PR #100 remote contract: 2,172 tests, 0 skipped | engineering verifies any later source change; [T22 evidence](t22-evidence.md) |
| Migration/seed build wrapper rehearsal | local disposable pgvector full wrapper and two direct seed runs passed; two-wrapper CI replay passed again at `c1e3ab3` with stable counts; Neon-compatible snapshot still blocked | operator supplies disposable Neon-compatible copy for target-specific rehearsal |
| TypeScript, lint, pure Vite, bundle | see T22 evidence | engineering |
| Preview GET /api/build equals final PR SHA | protected PR #103 preview returned exact head `cb86721a4e13ffc82710ea7cbe4e9386db6929bd`; main merge SHA `f038919` was not deployed by design | future release operator compares exact 40-hex deployment SHA after approved deployment |
| Seven roles, explicit allow/deny/expired overrides, 390/768/1440 and keyboard | blocked; sessions unavailable | UAT owner supplies disposable identities; [UAT matrix](uat-results.md) |
| Legacy snapshot parity and migration/cutover | blocked; snapshots promised later | data owner supplies complete isolated snapshots; T20 compare and supervised rehearsal |
| Provider/n8n callbacks and actual usage | blocked; sandbox contract/credential unavailable | integration owner supplies sandbox workflow and safe test credential |
| Authenticated full route p95 before/after | blocked; no sessions/local app fixture | performance owner runs same-environment 30 warm/10 cold route and browser samples |
| Backup/PITR, migration rehearsal, change window | blocked; operator evidence unavailable | production operator |
| Release approval | NO-GO: production serves `bed941b`; latest main build was canceled. Deployment provenance and outstanding acceptance gates require reconciliation; see the 2026-09-30 checkpoint | user/owner after all gates, including target-specific migration, UAT and snapshot reconciliation |

## Current rollforward and rollback sequence

1. Before release, freeze candidate SHA and PR dependency order. Verify all required checks and preview SHA. Record schema version, inventory counts, backup/PITR marker and maintenance window without copying secrets into tickets.
2. Rehearse registered migrations001–022 and data checks on a matching, confirmed disposable Neon/Postgres copy. Reconcile counts and immutable histories; resolve anomalies with source evidence and owner disposition. Supabase functions and recovery are excluded. Existing UAT/CI replay is evidence for those targets, not an operator-approved production rehearsal.
3. Deploy only after explicit production authorization and gates above. Observe 403/409 rates, pending approvals, stuck agent runs, bulk/import item status, slow queries, initial JS and route p95 during an agreed window. Record timestamps and source of measurements.
4. If a new operation misbehaves, stop its entrypoint, retain operation receipts and histories, diagnose, then roll forward to a compatible fix. Do not restore the old authorization/transaction bypass. Additive tables and immutable quote/approval history stay intact.
5. If a domain has begun Neon writes, stop affected operations, preserve migration022 tables and compare the delta before a compatible Neon-only repair. Do not restore Supabase access, flip a source toggle, drop history/receipts or discard new writes. Production recovery requires then-current operator approval.
6. Record final disposition and customer-impact decision with the operator. No real customer message was sent; database effects of the failed #102 preview remain unverified.

**Release decision at the 2026-09-28 checkpoint:** NO-GO for production while external gates above remain blocked. Main contains the source at `f038919` but the user-approved production hold remains active; the live READY deployment is still the audited `2904faa` version.

## Integration merge disposition

- GitHub shows all 19 PRs #82–#100 as merged into `codex/clientops-reviewed-integration`, with final merge commit `3c349f76b89e8814a123e767ee7b23bf457b2b3e`. The merged tree `d984a4c7edbe3a963d0dd49dc2887e8d7f55d597` equals the tested #100 head tree.
- At the integration checkpoint, main and the latest GitHub Production deployment both pointed to `2904faa502f7494173f48f412875c1d0a3aba674`. Main later advanced through hold proof #102 and source merge #103; the latest READY Production deployment stayed at that audited SHA.
- After an initial automatic approval rejection, the user explicitly approved a persistent Vercel production-only Ignored Build Step. The setting is `if [ "$VERCEL_ENV" = "production" ]; then exit 0; else exit 1; fi`; it remains active and was verified by canceled production builds for both #102 and #103. Removing this hold is a separate release operation.
- The protected preview matched #100 head `c9d47e2bdc5e82480d569b3b0217711ef00c6f8e`; later PR #103 preview matched its exact head `cb86721a4e13ffc82710ea7cbe4e9386db6929bd`. The main merge SHA was not deployed under the hold. A release requires a fresh final-deployment `/api/build` SHA comparison.

## Main source merge and hold verification

- [PR #102](https://github.com/YNWAforever/ui-delight-maker/pull/102) merged the source-only Vercel build command and hold record into main at `9911e2f3d6643fa2db81b2fa097ab24ae81c5c94`. Its production deployment `dpl_EaVy38Tp8cVH1nwGe2v2kbYricw7` was CANCELED; prior `dpl_BubNGhS2HFmmvjcUYfiKiasDwcLU` remained READY.
- [PR #103](https://github.com/YNWAforever/ui-delight-maker/pull/103) merged the audited source into main at `f038919b95ff085190401f64078b78bc8781dd4d`. Its production deployment `dpl_HCh6p9UMSNwgivUn52VF3NS4XxAW` was CANCELED; the same audited deployment remained the latest READY version. The Vercel hold was read back after the merge.
- Main-push GitHub Types/lint, real PostgreSQL contract (2,172 tests, zero skipped) and isolated migration/seed replay passed. The Supabase Preview check failed because an organization member reached the free-project limit; it is an external blocker, not a passing release gate.
- The first #102 preview used the old `bun run build`, attempted migration and seed on a target of unverified isolation, and failed with `Quote version is immutable`. Database effects of that failed preview are not yet ruled out. Its later preview used the source-only command and passed. No deliberate production migration or customer message was sent.


## Historical evidence delta — independent UAT / R06

[Independent seven-role UAT](../2026-09-29/isolated-uat-environment.md), scoped Quote U03 and billing U07 replace their earlier absence-of-session blockers. [Authenticated runtime comparison](../2026-09-29/r06-runtime-before-after-2026-09-30.md) satisfies the measured Task/Approval queue budgets on real 10k/100k PostgreSQL fixtures. Approval cold p95 regression and unresolved first CI/capture failures remain disclosed. Release is still **NO-GO** for broader UAT, legacy/provider/anomaly/operator gates. No production rollback or promotion was performed; current public build is `bed941b` with the persistent build hold active.

- R02 source `53dc62f` additionally passes actual Task100 response-loss/reload/receipt recovery and mixed-result replay, with 70 once-only writes and 30 failures retained. [U08 report](../2026-09-29/bulk-recovery-uat-2026-09-30.md). Team/other bulk domains, import/export, full U15 and external/operator gates remain unaccepted. No schema change or production release in this slice.

- U10 genuine reader deep-link auto-dialog exposure reproduced; server POST denial/data unchanged confirmed. [Source repair](../2026-09-29/admin-dialog-uat-2026-10-01.md) passes local fresh2,340 zero-skip and static/build gates; hosted repaired roles/reassignment and exact final PR gate pending. No production/schema change.

- PR#146 `ea76d3b`: defined U10 now PASS with exact-source2,340 zero-skip CI and genuine roles/original reassignment/audit. [Report](../2026-09-29/admin-dialog-uat-2026-10-01.md). Admin role/lifecycle initial focus/Tab/Escape actual FAIL remains R03/U15 next; final documentation-headCI required. Full release/external gates unchanged.

- R03 keyboard/narrow repair passes local2,344 zero-skip and21/static/build gates; [report](../2026-09-29/admin-keyboard-uat-2026-10-01.md). Exact-source hosted acceptance/source-finalCI pending; no production release.

## Native queue gate delta — 2026-10-01 HKT

Commit e9f8fc48466f9e16d4a09bd6d50087635d40ec03: [real native polling acceptance](../2026-09-29/native-queue-polling-uat-2026-10-01.md) closes CO15 using four actual35s cases, own Manager and disposable100k approval data, without app/schema changes or mocked visibility. Current finding matrix19 verified_fixed /11 blocked_external, all30 IDs/16 UAT retained. Exact final-head CI/no-skip/replay/preview is still required before merging this evidence slice. Production release remains NO-GO: legacy/history/provider/human screen reader/operator/PITR/rollback inputs remain unresolved. No production action is authorized by this local acceptance delta.

## 2026-10-03 AI GPT-6.1 candidate gate

The reviewed AI candidate adds registered migrations023–025 and is documented in [AI release/rollback](../2026-10-03-ai-gpt61/release-and-rollback.md), [finding matrix](../2026-10-03-ai-gpt61/finding-matrix.md) and [execution ledger](../2026-10-03-ai-gpt61/execution-ledger.md). Historical checkpoints above retain their original source and acceptance limits. This new candidate remains NO-GO: data dispositions, genuine provider/native workers, exact seven-role UAT/accessibility, actual sweep duration and p95 owner review, production backup/PITR/window and release authority are unresolved. Green source CI alone does not authorize release or hold removal. No production migration or deployment occurred in this remediation.

## 2026-10-04 AI candidate follow-up (current; historical checkpoints retained)

The AI candidate now has registered migrations001–026, including026 nullable/no-default actual model telemetry; historical rows are unchanged in isolated replay. See [current AI release/rollback](../2026-10-03-ai-gpt61/release-and-rollback.md), [ledger](../2026-10-03-ai-gpt61/execution-ledger.md) and [manifest](../2026-10-03-ai-gpt61/release-manifest.json) for exact source, fresh CI and locally verified seven-role Note Tidy/decision/cancel evidence. Keep026/unknownNULL/append-only policies/all durable receipts in compatible rollback; no guessed backfill/NOT NULL reversal or Supabase restore. Production migration/ledger compatibility and true provider/cloud worker/maxDuration, manual AT, signed data dispositions, p95 acceptance/PITR/window/release authority remain blocked/not-tested. **NO-GO**, draft PRs unmerged, no production deployment/migration/data mutation or customer/provider message. Historical observations above keep their original dates; they are not current production acceptance.
