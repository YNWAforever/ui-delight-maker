# Supabase recovery removed from the delivery scope — 2026-10-03 HKT

## Human instruction and effect

The user explicitly instructed: "please skip supabase, no need to restore from supabase".

Supabase backup acquisition, dashboard download, project resume, cloud restore and local legacy restore are removed from the active delivery scope. The pending backup-page/file-path request is withdrawn. No further Supabase recovery or source-access action is scheduled by this delivery.

Existing Neon backup/local-copy evidence remains valid for its recorded four-table partial scope. No paired legacy/Neon export or full historical parity is accepted. Existing private source records and backups remain preserved; no credentials or raw rows are published.

## Application boundary

This instruction changes the recovery work scope. Current application source still has five guarded Supabase domains: customer-success, projects, deals, engagement-events and automation-playbooks. The existing selector defaults to legacy and refuses an unverified Neon source. Task reads and ownership checks retain their recorded source boundaries.

The current Neon source is missing eight domain tables listed in the [actual copy evidence](t20-neon-local-restore-2026-10-02.md). This scope update does not establish domain schema, backfill, owner/ID/permission parity or full functional acceptance. CO-25 remains blocked_external with the recovery dependency explicitly excluded by the user; T20 remains in_progress for its unresolved application/domain acceptance. None of the 30 CO IDs is removed or marked fixed by this scope choice.

## Work that remains in scope

| Gate | Evidence still needed |
| --- | --- |
| Historical anomalies / earlier preview impact | Four data-owner source/disposition records, #102 deployment/DB binding and impact, compatibility rehearsal |
| Provider / invitation / n8n telemetry | Independent sandbox and recipient/version configuration, genuine callbacks/receipts/usage, invitation signup/acceptance |
| Retention / PITR / release rollback | Approved target, owner/schedule, backup/PITR marker, compatible rollback rehearsal and release window |
| Human screen reader | Actual assistive-technology acceptance for recorded role/dialog/receipt/invitation scopes |

Seven distinct real UAT role sessions already exist; they remain valid evidence only for the workflows and source binding recorded in the [current acceptance packet](../2026-09-29/final-local-acceptance-2026-10-01.md). New provider or historical results are not inferred from those sessions. Missing external evidence continues to block its corresponding acceptance.

## Verification and release

Baseline main is 932f65a6b232d860c625650902007a2c9ab3f15d, merged PR #158. Its actual database gate passed 2,515 tests with 0 skipped and isolated migration/seed replay; these results belong to that source. This scope slice changes audit documents only. Validate the 30-row matrix (19 verified_fixed / 11 blocked_external), links, secret-shaped-content absence and git diff; exact new-head/main CI remains required for its PR.

Role UI and runtime/performance recapture are N/A to this documentation change. No application code, schema, policy, data source or provider configuration is changed. Production release stays NO-GO; no deployment, source mutation, resume or customer send is authorized by this scope note.

Rollback of this slice reverts only the audit scope documentation. It does not delete backups or restore an unsafe historical application source.
