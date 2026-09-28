# T01 runtime input contracts — evidence

Implementation commit: `56bee37` (`fix: validate clientops write boundaries`).

- Replaced unchecked write validators in tasks, quotes, approvals, job sheets, and Lead/Client/Event import server functions with strict Zod schemas. The shared error has code `INVALID_INPUT` and field paths. Exported codes for later command state, conflict and authorization errors.
- Rejected unknown fields, malformed IDs, non-finite/negative/over-precision money, impossible dates, unknown enums, notes above 10,000 characters, 5,001 import rows, 101 bulk IDs and duplicate IDs. Explicit null clearing remains distinct from an omitted field.
- Audited actual quote editor payloads: `li-...` is a valid temporary line-item key and copy flow writes `parent_quote_id`; added regressions after these incompatibilities were found. Quote patches now match fields the current repository can persist, so `currency` patches fail rather than silently no-op.
- Red evidence: task, commercial, approval and import boundary tests failed against prior `data as` casts; the field-error test failed against the raw Zod error; quote payload compatibility tests failed against the first strict schema. The final 25 tests pass.
- Existing related server-function tests: 6 files, 44/44 passed against the disposable local PostgreSQL database.
- Full suite at T01 commit: 270 files, 1,945/1,945 tests passed, no skips, `--maxWorkers=4`, dedicated disposable PostgreSQL. Log: `C:\tmp\clientops-t01-full-test.log` (local test artifact).
- `bunx tsc --noEmit`: exit 0. `bun run lint`: exit 0, 1 existing Fast Refresh warning in `src/components/sales/data-table-shell.tsx`. `bunx vite build`: exit 0, client and server bundles built. `git diff --cached --check`: exit 0.
- No authenticated role sessions were provided, so role UI field-error smoke is unverified. The existing Neon WebSocket migration CLI cannot target the plain disposable local PostgreSQL server; the full `bun run build` migration/seed gate was not run. No production DB or provider was contacted.