# Failed preview database investigation

Read-only follow-up on 2026-09-28. Status: blocked on historical target identity and database evidence. This report does not clear the production release gate.

## Verified source and deployment state

- Main is 9f37be20efbd764739592d3efed91fe51ad0f855 after PR #104. GitHub Checks and Database contract both passed; the recorded contract result is 2,172 tests with zero skipped, with separate isolated migration/seed replay passing.
- The production hold still reads back as `if [ "$VERCEL_ENV" = "production" ]; then exit 0; else exit 1; fi`.
- Production build dpl_sz1PVLKMHr38PkwDUBEFVJnRziVg at that main SHA is CANCELED. The latest READY production deployment remains dpl_BubNGhS2HFmmvjcUYfiKiasDwcLU at audited SHA 2904faa502f7494173f48f412875c1d0a3aba674.

## Vercel environment scope metadata

The project environment metadata has separate sensitive DATABASE_URL entries for preview and production. Neither entry has a branch-specific override. These separate configuration entries do not prove that their values refer to different database targets. No connection string or secret value was printed or written into this report.

CLIENTOPS_SEED_ON_DEPLOY, CLIENTOPS_SEED_MODE, CLIENTOPS_SEED_TARGET and CLIENTOPS_SEED_TODAY each have preview and production entries. Their existence alone does not establish their values or the seed decision. The previous failed-preview log establishes that seed ran. Current metadata cannot independently establish the historical connection used by that deployment.

## Historical transaction boundaries

Source inspected at failed PR #102 preview commit 3476967923b6357bf2f9d51d96301c3cb8f6c2d9:

- package.json runs migration, schema verification, Vite, then seed-on-deploy as separate commands.
- scripts/clientops/seed-on-deploy.ts imports seed-smoke-data when the deployment seed decision permits it.
- scripts/clientops/seed-smoke-data.ts obtains one client, starts a transaction, calls seedAll, and commits on success. Its error handler attempts rollback and separately reports rollback failure.
- src/server/db/clientops-migrations.ts creates the migration ledger outside each migration transaction, then commits each migration and its ledger row independently.

Therefore a seed error is not proof that all earlier build database work was rolled back. The seed code contains a rollback path, but source inspection alone cannot attest to the database outcome. Earlier migration commits are outside that seed transaction. The scope and persistence of effects remain unverified.

## Evidence needed to close this blocker

1. Operator-confirmed Neon project, branch and database identity used by the failed preview, with the historical Vercel binding and its relationship to production. Supply non-secret IDs or a private local evidence path.
2. Retained database audit/transaction evidence or an isolated before/after copy covering the deployment window, including migration ledger and affected seed records.
3. Reconciliation of schema changes and seeded records on the isolated copy. Record unknowns explicitly if historical evidence is unavailable; do not infer a clean outcome from a failed build.

The initial metadata-only pass could not identify a target. After the user explicitly instructed direct use of production, the existing .neon links supplied the project identity and the connector confirmed the production branch. The read-only results below supersede that initial access blocker. The historical preview binding and before/after evidence remain missing. T20 snapshots, seven-role UAT, provider sandbox, authenticated route timing and operator release gates remain blocked.

## User-authorized production read-only inspection

Target identity: project delicate-cake-75532180 (Fimmick Client Ops), branch br-young-rice-aoyk6gjz (production, primary/default), database neondb. The canonical checkout and audit worktree .neon files identify this project. The Neon control plane confirms the branch and endpoint ep-super-credit-ao95x4zf. This identifies the linked production branch; it does not independently prove the sensitive historical Vercel preview binding.

The inspection used SET TRANSACTION READ ONLY, a 5-second statement timeout and a 1-second lock timeout. The database returned transaction_read_only=on at 2026-09-28T06:44:56.197Z. Subsequent inspections returned only schema metadata and aggregates. No migration, seed, data repair, provider call or customer message was executed.

### Schema already present

The production ledger contains all 21 migrations. Audit migrations 010-021 were already recorded on 2026-09-27, before failed #102 preview (2026-09-28T05:50:56.686Z to 05:52:07.311Z). The ledger attributes timestamps, not the initiating deployment or actor.

| Migration | Applied at (UTC, 2026-09-27) |
|---|---|
| 010 command versions and receipts | 04:03:57.567 |
| 011 quote version integrity | 05:04:36.969 |
| 012 open approval constraint | 06:13:07.273 |
| 013 Xero transitions | 07:26:45.192 |
| 014 locked Job Sheet portions | 07:26:46.130 |
| 015 agent recovery | 10:09:28.005 |
| 016 queue indexes | 11:46:56.298 |
| 017 bulk operations | 13:47:38.962 |
| 018 bulk row versions | 13:47:39.929 |
| 019 import identity | 15:26:51.735 |
| 020 Job Sheet handoff | 17:09:14.422 |
| 021 AI telemetry | 20:20:22.980 |

Catalog inspection also found enabled quote_commercial_integrity_guard, quote_version_integrity_guard and human_approvals_transition_guard triggers. Thus the old READY application SHA must not be interpreted as an unchanged production database. No full schema equivalence, migration provenance or compatibility acceptance is claimed.

### Seed and reconciliation aggregates

| Check | Observed result |
|---|---|
| Demo-labelled profiles | 3; latest updated_at 2026-09-27T03:19:45.780Z |
| Five exact QT-DEMO-001 through QT-DEMO-005 quote numbers | 5; latest updated_at 2026-09-27T03:19:45.780Z |
| Versions belonging to those demo Quotes | 1; latest created_at 2026-07-09T16:59:03.677Z |
| Approvals explicitly marked context_data.demo=true | 4; latest created_at 2026-07-05T08:45:35.098Z |
| Exact JS-DEMO-001 Job Sheet | 1; latest updated_at 2026-09-27T03:19:45.780Z |
| All Quotes: total / accepted | 5 / 1 |
| Accepted Quote missing version / accepted_at | 0 / 0 |
| Issued / accepted version references missing or pointing to another Quote | 0 / 0 |
| All Job Sheets: total / missing accepted_at | 1 / 1 |
| Terminal approved/rejected approvals missing decided_at | 1 of 4 total approvals |

The observed demo update times precede #102 and are consistent with its seed transaction rolling back. They cannot prove the absence of all historical side effects. The migration timestamps show earlier committed schema changes. One Job Sheet acceptance timestamp and one terminal approval decision timestamp require authoritative historical reconciliation; do not manufacture timestamps or rewrite immutable histories. These are current-state anomalies, not proof that #102 caused them. A bounded follow-up found the one Job Sheet and its Quote reference the same accepted version, and the Quote has accepted_at 2026-07-09T16:59:03.677Z. No activity_logs rows were found for that Job Sheet, its Quote or the terminal approval with a missing decision time. The linked Quote timestamp is a reconciliation lead, not independently verified historical authorization to repair either row.

Production release remains NO-GO. Before release, inventory the actual deployed schema and compatibility with the old application, establish the historical preview target, and obtain operator-approved reconciliation evidence. Read-only production results do not replace isolated rollback/idempotency tests, seven-role UAT or the missing legacy/Neon snapshots.
