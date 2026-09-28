# ClientOps audit release candidate — 2026-09-28

**State: reviewable source candidate with a protected preview; not released to production.** Source baseline is main/audit SHA `2904faa502f7494173f48f412875c1d0a3aba674`. T00–T21 are in stacked draft PRs #82–#99. T22 is [cumulative draft PR #100](https://github.com/YNWAforever/ui-delight-maker/pull/100) against main, so all fixes and release gates can be reviewed together. Use its head SHA and compare it to GET `/api/build` on its preview. A null or different response blocks release. The 30 finding states and task commits are in [status](status.md); task-level proof is in `t00`–`t22` evidence files where present. A passing local test never upgrades a blocked browser, data-parity or provider gate.

## Feature status and evidence map

Every preview cell is **blocked** until an authenticated preview at the same candidate SHA is checked. The route labels show the affected entrypoints, not a claim that browser UAT passed.

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
| T22 docs/CI / CO-27 | GET /api/build, GitHub workflows | public SHA metadata and zero-skip gate | none | [T22](t22-evidence.md) | source SHA matched at `69fe0fe`; role UAT blocked |

## Performance evidence

| Measure | Before | Candidate after | Scope |
|---|---:|---:|---|
| Login initial static JS gzip | 222,420 bytes at T18 | 165,482 bytes at T19; 165,496 bytes at this T22 pure build | Actual emitted manifest assets, not browser transfer timing |
| Task list+count SQL p95, 10,000 tasks | unavailable on same baseline | 33.5 ms at T19 | 30 real isolated DB samples; SQL component only |
| Approval list+count SQL p95, 100,000 approvals | unavailable on same baseline | 522.6 ms at T19 | 30 real isolated DB samples; SQL component only |
| Authenticated HTTP/browser route p95 | blocked | blocked | No same-environment before/after or role sessions; cannot claim 800 ms target |

See [T19 measurements](t19-evidence.md) and its machine-readable artifact. The old fixture formula is synthetic and is excluded from this table.

## Migration and data reconciliation

- Commit `876ddef` makes Vercel's automatic PR/production build command source-only (`bunx vite build` plus output packaging). The first two PR #100 previews used the former wrapper and failed during seed with `Quote version is immutable`; its database isolation was not verified. Do not use an automatic build to apply migration or seed. Before a future release, rehearse and separately authorize the schema/data operation on an identified target, then deploy the source.
- Migrations 001–009 predate this remediation. New additive changes are 010 command versions/receipts; 011 immutable quote version guard; 012 one open quote approval; 013 Xero transitions; 014 locked Job Sheet portions; 015 agent recovery metadata; 016 queue indexes; 017–018 bulk receipts and row versions; 019 import sessions/identity keys; 020 handoff fields; 021 AI invocation telemetry.
- The local wrapper now uses a narrowly guarded `pg` adapter only for matching loopback disposable test URLs. The first full wrapper and two direct synthetic seed runs passed on isolated pgvector PostgreSQL; CI passed two full wrapper runs on its own fresh service at checkpoint `69fe0fe`; both had 21 migrations, 3 profiles, 5 Quotes, 1 version and 4 approvals. This does not replace a Neon-compatible disposable-copy rehearsal or operator sign-off.
- The isolated PostgreSQL contract and full suite are recorded in [T22 evidence](t22-evidence.md). The normal `bun run build` wrapper includes migration and seed; do not invoke it on a database whose identity and disposability are unverified.
- Read-only inventory and reconciliation precede any production schema write. Quote legacy anomalies (missing issued versions, conflicting acceptance, unverified Xero notes) remain uncounted on real data. Preserve them for an operator decision; never manufacture a snapshot or acceptance timestamp.
- [T20](t20-evidence.md) cannot report cross-database row count, ID, owner, task or override parity until the promised isolated legacy and Neon snapshots arrive. All five domains stay on Supabase. There is no backfill, dual-write proof or cutover authorization.
- Before an approved production migration, the operator must provide backup/PITR point, rehearsal against a matching disposable copy, migration duration/locks, anomaly inventory and reconciliation sign-off. No such production gate has been satisfied here.

## Release gates

| Gate | Current result | Owner / way to close |
|---|---|---|
| PR/source CI on exact head and main push | Types/lint, Database contract and isolated seed replay passed at checkpoint `69fe0fe375b8fd1d4fb11c3b9890baf711052fee`; recheck later docs-only head | engineering: require `Checks / Types and lint` and `Database contract / contract`; repository admin applies branch protection if desired |
| Full isolated DB, zero skipped | local pass: 304 files / 2,161 tests, 0 skipped at `a4abea7`; remote checkpoint `69fe0fe`: 2,171 tests, 0 skipped | engineering verifies remote final PR CI at document head; [T22 evidence](t22-evidence.md) |
| Migration/seed build wrapper rehearsal | local disposable pgvector full wrapper and two direct seed runs passed; two-wrapper CI replay passed at `69fe0fe` with stable counts; Neon-compatible snapshot still blocked | operator supplies disposable Neon-compatible copy for target-specific rehearsal |
| TypeScript, lint, pure Vite, bundle | see T22 evidence | engineering |
| Preview GET /api/build equals final PR SHA | protected preview matched checkpoint `69fe0fe375b8fd1d4fb11c3b9890baf711052fee`; recheck later docs-only head | preview operator supplies URL; engineering compares exact 40-hex SHA |
| Seven roles, explicit allow/deny/expired overrides, 390/768/1440 and keyboard | blocked; sessions unavailable | UAT owner supplies disposable identities; [UAT matrix](uat-results.md) |
| Legacy snapshot parity and migration/cutover | blocked; snapshots promised later | data owner supplies complete isolated snapshots; T20 compare and supervised rehearsal |
| Provider/n8n callbacks and actual usage | blocked; sandbox contract/credential unavailable | integration owner supplies sandbox workflow and safe test credential |
| Authenticated full route p95 before/after | blocked; no sessions/local app fixture | performance owner runs same-environment 30 warm/10 cold route and browser samples |
| Backup/PITR, migration rehearsal, change window | blocked; operator evidence unavailable | production operator |
| Release approval | conditional source-merge request received; production remains NO-GO and no deployment was performed | user/owner after all gates, including target-specific migration and UAT evidence |

## Rollforward and rollback sequence

1. Before release, freeze candidate SHA and PR dependency order. Verify all required checks and preview SHA. Record schema version, inventory counts, backup/PITR marker and maintenance window without copying secrets into tickets.
2. Rehearse additive migrations 010–021 and data checks on a disposable copy. Reconcile counts and immutable histories; resolve anomalies with source evidence. Keep the five legacy domains on their guarded source.
3. Deploy only after explicit production authorization and gates above. Observe 403/409 rates, pending approvals, stuck agent runs, bulk/import item status, slow queries, initial JS and route p95 during an agreed window. Record timestamps and source of measurements.
4. If a new operation misbehaves, stop its entrypoint, retain operation receipts and histories, diagnose, then roll forward to a compatible fix. Do not restore the old authorization/transaction bypass. Additive tables and immutable quote/approval history stay intact.
5. If a legacy domain has begun Neon writes, freeze writes, compare the delta and obtain a signed reverse-sync plan before any source reversal. A toggle alone is not a safe rollback.
6. Record final disposition and customer-impact decision with the operator. No real customer message or production data operation was performed for this candidate.

**Release decision:** NO-GO for production while external gates above remain blocked. Source is reviewable as a draft stacked PR sequence.
