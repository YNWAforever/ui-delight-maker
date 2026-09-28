# T15 — resumable CSV import evidence

## Scope and commits

- Branch: `codex/clientops-import-resume`; [draft PR #93](https://github.com/YNWAforever/ui-delight-maker/pull/93) stacked on T13 draft PR #92.
- `d2a3c1e`: additive migration 019, durable session/row/identity receipts, production Lead/Client/Event adapters, and real PostgreSQL behavior tests.
- `413f194`: authenticated session API and shared Lead/Client/Event upload, preview, commit, resume, recovery and issues export; old whole-file commit endpoints reject writes.
- `17bf56d`: explicit expired-row cleanup command, read-only identity inventory SQL, and migration/authorization contract updates.

## Behavior and safety

- CSV limit is 5 MiB and 5,000 records. The shared T14 parser preserves source record and line numbers. Preview records every row, including invalid, forbidden, ambiguous and skipped outcomes, with a hash and 24-hour preview expiry.
- A committed session persists actor ownership, rows, row versions, idempotency key and per-row receipts. Each call claims at most 20 rows and uses at most four concurrent row transactions. A failed row rolls back its business writes before a failure receipt is stored. The server rechecks the current actor and row capability when applying each row; inactive actors cannot write.
- Exact source-scoped external IDs map to a single resource. Event attendee IDs are scoped to their campaign. Company names and emails are hints only; a candidate without an explicit identity or selected existing ID is marked ambiguous rather than merged. Multiple same-name customers with different external IDs remain distinct.
- The browser saves only session ID, preview hash, expiry and commit idempotency key. It saves the key before the request so a lost response can replay safely. Closing the page pauses work; it does not claim background processing. Results and error CSV are actor-owned and contain status/line/ID, not raw CSV fields.
- After seven days, expired session row payloads are scrubbed while minimal status and identity receipts remain. Reads scrub their own expired session, new previews perform a bounded sweep, and `bun scripts/clientops/cleanup-import-sessions.ts --execute` is an explicit maintenance entry point. No production schedule has been configured or run.

## Verification

- Red phase: the new real PostgreSQL import-session test could not load the absent service before implementation. The first full-suite run on fresh disposable PostgreSQL produced 2,095 passes and three expected manifest/authorization-contract mismatches; no product behavior test failed. Those three contracts were updated and their focused rerun passed 29/29.
- Real PostgreSQL focused tests on the isolated local container: 11/11 for 5,000-row reconciliation, chunk bound, replay, concurrent same-key create, rollback and retry, owner/expiry, same-name distinct customers, inactive actor and contact transaction rollback. An additional bounded retention sweep test passed 1/1.
- UI and retired-endpoint focused tests passed 35/35. TypeScript noEmit, changed-file ESLint and `git diff --check` passed. Pure `bunx vite build` completed client and SSR bundles. The migration-and-seed `bun run build` wrapper was not run.
- Final fresh isolated-DB full suite at implementation head: 291/291 files and 2,098/2,098 tests passed with two thread workers, 0 skipped, 429.32 seconds. This includes the 5,000-row, concurrency, rollback, idempotency, cleanup, role revocation and adapter integration tests. The duration is test-suite wall time, not application performance.
- Remote draft PR #93: at first check, Vercel preview failed; GitHub contract and Types/lint were pending. This is a remote gate, not evidence of local build failure. The underlying Vercel failure has not been attributed.
- Authenticated Lead/Client/Event browser upload, close/resume, role revocation and issues-download UAT is blocked by absent role sessions. No super_admin proxy was used.
- No production database, customer message, provider call, deployment or secret was touched.

## Migration, inventory and rollback

- Migration 019 adds `import_sessions`, `import_session_rows`, `import_identity_keys`, and default-zero row versions for Clients and Accounts with update triggers. Existing business fields are not rewritten.
- `scripts/clientops/import-key-inventory.sql` is read-only and reports aggregate duplicate-name groups and mapped identity-key count without names or emails. On the isolated fixture database it returned 0 duplicate groups for leads, clients and accounts and 0 identity keys after test cleanup. This is not evidence about real customer data; production identity inventory and any approved legacy-key backfill remain blocked.
- On an approved target, reconcile each session's `total` with grouped row statuses, successful receipts with created/updated resource IDs, and identity-key mappings with existing resources. A pending or failed receipt must not be interpreted as a successful write.
- Application rollback can disable the new import routes and session endpoints while retaining receipt and identity tables for investigation. Destructive schema rollback would remove audit and dedupe records and requires a separate data-retention decision. A paused session should be explicitly resolved before switching to an older direct-write importer.
