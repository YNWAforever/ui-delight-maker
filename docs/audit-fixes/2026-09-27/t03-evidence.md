# T03 read surface visibility — implementation evidence

Code commits: `8f9d672` (search), `1db2945` (job sheet list/workspace), `e0c92b2` (approval queue), `8b8d65e` (dashboard/reports), `e70ca82` (legacy fixture alignment). `b8aa418` formats T03 list paths.

- Search: before the fix, real isolated PostgreSQL returned a lead on accounting's lead-only token and a task after an explicit task deny. The six UNION branches now apply resource scope before text matching, ordering and LIMIT. Accounting still finds a visible quote and an allowed task.
- Job sheets: before the fix, direct list and count returned unscoped rows. Both now require request authorization context and apply SQL scope before filter/count/page. Company/client workspace server functions pass that context. Queue uses a minimal DTO.
- Approvals: before the fix, the list included three rows, including forbidden records and raw context. It now returns only the authorized row and allowlisted quote reference context.
- Dashboard: before the fix, accounting's home returned a hidden lead and a visible quote exposed its hidden linked lead ID. The read model now scopes each section and total in SQL, redacts that ID, and gives accounting a job sheet operations desk. An explicit task deny removes both rows and totals.
- Reports/export: before the fix, an accounting pipeline report counted one inaccessible lead. The report dataset now denies that resource and scopes rows before GROUP BY; summary aggregates are scoped and inaccessible metrics hidden. CSV export uses the same authorized dataset.
- Green gates on disposable PostgreSQL: cross-surface 7/7; report/CSV 60/60; migrated route-loader 35/35; complete suite 276 files, 1,970 tests, zero skipped. `bunx tsc --noEmit`, ESLint, and pure `bunx vite build` exited 0. ESLint retains one existing Fast Refresh warning in `src/components/sales/data-table-shell.tsx`. `git diff --check` clean. The eight supplied defect probes were characterization evidence only, never treated as release gates.

CO-01–03 remain `in_progress` until authenticated seven-role UI/network evidence is available. CO-03 queue pagination is owned by T12. The production build wrapper includes migrations/seed and was not run because its Neon WebSocket migration path is incompatible with the disposable local PostgreSQL; no production database or customer messaging was touched.
