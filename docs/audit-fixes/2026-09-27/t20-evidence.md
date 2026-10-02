# T20 — legacy data-source reconciliation

## Current scope override — 2026-10-03 HKT

The user has removed Supabase recovery from active delivery. Earlier backup/download/resume requests and restore plans are superseded; see [scope](scope-no-supabase-2026-10-03.md). The verified Neon partial local copy is retained. No paired parity, domain migration or CO25 completion is claimed, and existing source guards remain unchanged.


Code commit: `27bbb00`. Review PR: [draft #98](https://github.com/YNWAforever/ui-delight-maker/pull/98). No production migration, backfill, read cutover, write cutover or deployment occurred.

## Reachable source inventory

| Domain | Reachable caller | Current source | T20 disposition |
|---|---|---|---|
| Automation playbooks and runs | `server-functions/automation-playbooks.ts` | legacy Supabase | Central source guard; Neon table absent, cutover blocked |
| Customer-success profiles and touchpoints | `server-functions/customer-success.ts` | legacy Supabase | Central source guard; account workspace task read can rehearse Neon only on disposable local DB |
| Deals | `server-functions/deals.ts` | legacy Supabase | Central source guard; deal workspace task read can rehearse Neon only on disposable local DB |
| Engagement events and channel identities | `server-functions/engagement-events.ts` | legacy Supabase | Central source guard; Neon table absent, cutover blocked |
| Projects | `server-functions/projects.ts` | legacy Supabase | Central source guard; project workspace task read can rehearse Neon only on disposable local DB |
| Task list and writes | `server-functions/tasks.ts` → `repositories/tasks.ts` | Neon | Existing write/read path retained |
| Legacy ownership | `auth/resource-ownership.ts` | Supabase for the five domains | Checks the same source guard before resolving owner |

Ruling: the plan's per-domain Neon switch and migrations cannot be enabled without the legacy schema and an isolated, complete snapshot of rows, ID relationships and overrides. The five repositories retain their public APIs and legacy source. A request to switch an unverified domain fails closed. Workspace task reads default to legacy; an explicit `neon` rehearsal requires `CLIENTOPS_LEGACY_TASK_REHEARSAL=1`, non-production mode and a local database named `clientops_t20_*`. Production is always denied. For CI test mode only, the same local `clientops_*` database may be named by matching `DATABASE_URL` and `DATABASE_TEST_URL`; remote hosts, mismatched URLs and production are denied. This keeps an unverified partial Neon task copy from silently replacing legacy data. The cost is that CO-25 remains open until parity and write cutover can be proved.

## Read-only reconciliation contract

`bun scripts/clientops/reconcile-legacy-domains.ts --legacy=<local-legacy.json> --neon=<local-neon.json> --out=<new-report.json>`

Each JSON file has `{"tables":{"tasks":[{"id":"..."}],"...":[]}}`. The tool compares the ten named domain/override tables by count, exact ID mapping, canonical SHA-256, owner and scope fields. It checks task and override foreign keys against supplied `profiles`, `accounts` and `projects`. Missing tables or references are `missing_snapshot`; a supplied empty table is not a substitute for an absent export. Reports include counts and hashes but no row contents or IDs. It never connects to a database or mutates either store. A full report is only snapshot parity evidence; it does not prove RLS completeness, write freeze, incremental catch-up or role UI acceptance.

No legacy or corresponding Neon snapshot is available yet; the user said they will provide them later. No real cross-database counts, mapping, normalized hashes, FK, owner or permission override parity can be reported. Domain migrations, backfill rehearsal, incremental write capture and reversal are blocked. Do not enable a production switch or flip back after Neon writes without reverse delta reconciliation.

## Verification

- RED: `legacy-domain-parity.integration.test.ts` failed before implementation because `legacy-domain-source.server` did not exist.
- GREEN: 4 affected test files, 35 affected tests passed with disposable local PostgreSQL `clientops_t20_legacy_parity`. Two new cases use real PostgreSQL; five new cases in total cover exact task ID/owner/status across main and workspace reads, legacy outage, production/unsupported source denial, owner/scope/override drift and missing snapshot blocking.
- CLI missing legacy snapshot exits blocked; synthetic partial snapshots return exit 2 with `projects=missing_snapshot`. These are tool checks, not release parity evidence.
- `bunx tsc --noEmit`, changed-file ESLint, `bunx vite build` and staged diff check passed. `bun run build` was not run because it includes migration and seed.
- Authenticated seven-role workspace UI evidence: blocked by absent sessions. No `super_admin` proxy result is claimed.

## Stacked PR CI contract repair

At PR #98's prior head, the GitHub contract job used its disposable local PostgreSQL database `clientops_test`, while the rehearsal selector required `clientops_t20_*`. The existing real database parity case failed before its assertion. A new guard test reproduced this failure (1 failed, 2 database cases skipped with no DB). Commit `7ef6b65` permits the matching CI test URL only when `NODE_ENV=test`, both database URLs are identical, host is local and database name begins `clientops_`; explicit rehearsal and non-production restrictions still apply. The guard test also verifies mismatched URL, remote host and production denial. With a newly created disposable pgvector PostgreSQL container named `clientops_test`, all 6/6 T20 tests passed, including the two database cases; the container was removed. Deploy-safety 1/1, TypeScript and touched-file lint passed. No legacy snapshots or authenticated sessions were available, so reconciliation and role UI remain blocked. Exact-head remote checks were pending at this evidence commit.

## Current missing-input boundary — 2026-10-02 HKT

Seven distinct core UAT role sessions are now available and verified; earlier missing-session statements describe the original T20 checkpoint. Legacy-domain role acceptance remains blocked by absent independent legacy dataset/configuration and complete paired legacy/Neon snapshots/schema/ID-owner-task-override inventory. Rechecking the supplied local directory identified repositories/plans, not acceptance exports. Existing read-only reconciliation CLI/JSON contract above remains ready; no empty/synthetic partial fixture is accepted as real parity. The five source guards remain on Supabase, with no migration/backfill/write capture/cutover or production data query. [Current source/gates](../2026-09-29/final-local-acceptance-2026-10-01.md).

## Local export preparation — 2026-10-02 HKT

User confirmed the pair is not exported and reports independent local copies now exist; their config and provenance-record paths have not been supplied. [Runnable tool, private template/path steps and rollback](t20-snapshot-export-2026-10-02.md), implementation `1cd638d`, [PR157](https://github.com/YNWAforever/ui-delight-maker/pull/157). Final fresh real PostgreSQL2,515/329/zero skips, focused40/zero skips, types/full lint/pure Vite/bundles pass; [allowlisted proof with actual synthetic runtime](evidence/t20-snapshot-tool-2026-10-02.json). Row relationships and drift survive pair-scoped HMAC, numeric precision is preserved, read-only/rollback/MVCC/RLS incomplete exports are exercised on real PG. No actual source pair is exported; benchmark datasets are not legacy parity, masked IDs are not backfill IDs. Production/source guards/migrations and all CO25/cutover/release external requirements remain unchanged.

## Approved source backup and real local copy — 2026-10-02 HKT

Earlier absent-path/no-production-query statements are historical. User explicitly approved read-only backup and local restore. [Real Neon source/copy receipt](t20-neon-local-restore-2026-10-02.md): four actual allowlist tables/23rows copied with same snapshot and count/hash parity; native local copy plus SELECT-only reader/refused writes/ROLLBACK/original exporter verified. Actual Neon lacks eight domain tables, local full schema/role policies are not restored, and legacy is still INACTIVE with conditional safe-resume prerequisite unverified. Private Neon config/sourceRecord now ready; no real paired snapshot or cross-database reconciliation accepted. CO25/cutover/release remain blocked; no source writes or production deployment.
