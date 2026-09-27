# T16 Job Sheet handoff evidence

Branch: `codex/clientops-job-sheet-handoff`, stacked on T15 commit `0704197`; [draft PR #94](https://github.com/YNWAforever/ui-delight-maker/pull/94). Refreshed `origin/main` on 2026-09-28 remains audit SHA `2904faa502f7494173f48f412875c1d0a3aba674`.
Commits: `f389485` (migration/repository/bulk/real-DB tests), `d3159ba` (server endpoints and UI), `fc977e3` (status/evidence).
No deployment or production data change was performed.

## Positive behavior

- Migration `020_job_sheet_handoff_fields.sql` adds explicit no-PO reason, Job Sheet row version, and a database guard against editing accepted commercial handoff fields.
- An accounting owner must be active and eligible. Acceptance requires a PO or documented exception, reconciled portions, and an amount/currency match to the accepted quote snapshot. Accepted commercial edits fail; noncommercial billing instructions remain editable and audited.
- Job Sheet detail now returns the accepted quote version, company and owner labels under linked-resource permission checks, complete Xero evidence fields and portion versions. It shows next action and a numeric reconciliation delta.
- URL-backed company, quote number, owner, PO, status, and Hong Kong creation-date filters use PostgreSQL before pagination and count. The list remains visible for sheets with a missing quote relation.
- Persistent bulk actions assign an accounting owner or set date-only target invoice dates. Locked rows are ineligible per item; active-owner and version checks are repeated on apply. The UI uses the T13 preview/commit/result/resume controls and the T14 typed CSV writer for selected rows on the current page.

## Verification

| Check | Result |
|---|---|
| New real-PostgreSQL handoff suite | 11/11 passed on isolated `clientops_t16_final_20260928`; red runs reproduced missing PO gate, inactive owner gate, header endpoint, locked commercial edit, company/quote search, bulk date eligibility, and missing Xero evidence hydration before fixes |
| Affected route and DB tests | 5 files/59 tests passed after updating the old SQL fixture and authorization assertions |
| Final linked-scope, handoff and authorization tests | 3 files/41 tests passed |
| Existing real-PostgreSQL persistent bulk suite with T16 handoff | 2 files/19 tests passed in isolation, including 100 mixed results, concurrency, rollback, and idempotent resume in the T13 suite |
| Fresh isolated-DB full suite | 291 files passed, 1 file failed: 2,108/2,109 tests passed, 0 skipped. The existing 100-item bulk test exceeded its 5-second limit while Vite build ran concurrently; the same bulk file passed 8/8 when rerun without build contention. This is not recorded as a full-suite pass. |
| Static/build | `bunx tsc --noEmit`, changed-file ESLint, `git diff --check`, and pure `bunx vite build` client/SSR passed. `bun run build` was not run because it includes migration and seed. |

## Remaining gates

- No authenticated sales/accounting or seven-role browser sessions were supplied. Sales handoff → accounting completion → accept → billing → manual Xero UI smoke is **blocked**, not passed.
- Migration 020 was applied only to disposable PostgreSQL. Production reconciliation/migration and release were not authorized and were not performed.
- The selected-page CSV export is verified by the T14 serializer contracts and build; a real spreadsheet display check remains open.
- Runtime performance before/after is T19. No fixture-derived number is claimed as a runtime measurement.
