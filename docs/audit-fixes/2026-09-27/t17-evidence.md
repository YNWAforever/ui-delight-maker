# T17 Admin directory and reassignment evidence

Branch: `codex/clientops-admin-directory`, stacked on T16 commit `06137e1`; [draft PR #95](https://github.com/YNWAforever/ui-delight-maker/pull/95). Implementation commit: `0f0a350`. Refetched `origin/main` on 2026-09-28: `2904faa502f7494173f48f412875c1d0a3aba674`, equal to the audit SHA. No deployment, production data change, or customer message was performed.

## Positive behavior

- Organization lead/deputy/default owner, invitation manager, team member, access-profile and lifecycle-successor controls use the purpose-scoped T12 server search. Search is debounced and paginated; selected off-page profiles resolve by ID. Existing selections can be cleared. Admin access loads an explicitly selected profile by ID instead of assuming it is in the first 100.
- Team membership keeps the T13 preview/commit/resume path. A partial result retains only non-success IDs, and the organization read joins member names/status so an off-page member is still labelled after refresh. The reusable picker retains its original one-argument `onChange(id)` contract.
- Deactivation inventory now counts mutable and historical rows separately. Leads `won/lost`, tasks `done`, approvals outside `pending/escalated`, engagements `ended`, campaigns `completed/archived`, and Job Sheets `accepted/cancelled` remain with their historical assignee. Client and account ownership stays live because those records can still need an active owner. `created_by`, `decided_by`, and audit actor columns are never reassigned. A successor is required only for mutable work; the transaction rechecks counts and rejects inactive successors.
- Effective access shows role baseline, the explicit override's scope and expiry, and "Varies by scope" for a scoped exception. A team-only allow is no longer presented as global access.

## Verification

| Check | Result |
|---|---|
| Red behavior before picker fix | New admin large-directory tests failed because the owner search did not exist and the successor table required a fixed first-page list. The scoped access test failed because a team-only allow appeared as globally "Allowed". |
| Real isolated PostgreSQL | 2/2 new integration tests passed on disposable `clientops_t17_reassignment`: 250-person cursor search and selected hydration, inactive successor exclusion, open/history counts, rollback on inactive successor, historical assignee and audit actor preservation after successful deactivation. These DB tests were added after the red UI tests, so no pre-fix DB failure is claimed. |
| Affected UI/contract reruns | Task owner picker, scoped permission, and membership tests 15/15; admin large-directory and lifecycle tests 8/8; admin account-management flow 7/7; existing admin-users authorization 7/7. Other affected admin repository/route suites passed. |
| Full suite on fresh isolated DB | 294/296 files and 2,113/2,115 tests passed with 2 workers. Two failures were the reusable picker callback arity and the old scoped-allow assertion. Both were corrected; their affected suites passed on rerun. **No green full-suite rerun is claimed.** |
| Static/build | `bunx tsc --noEmit`, changed-file ESLint, staged `git diff --check`, and exact-commit pure `bunx vite build` client/SSR passed. `bun run build` was not run because it includes migration and seed. |

## Remaining gates and reconciliation

- Seven authenticated role sessions were not supplied. Admin, manager, read-only, and successor browser UAT remains **blocked**; a super_admin session was not used to stand in for those roles.
- Closed `assigned_to` records preserve the original person. Any business decision to transfer those historical fields belongs in a separately reviewed reconciliation/migration; T17 performs no migration.
- No production migration, legacy-data reconciliation, or release action was performed. Remote PR checks and preview deployment must be reviewed separately from local verification.
