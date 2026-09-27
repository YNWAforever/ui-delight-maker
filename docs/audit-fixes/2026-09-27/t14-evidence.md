# T14 CSV parsing and spreadsheet-safe export

Scope: CO-17 and CO-29. Branch: codex/clientops-csv-safety, stacked on T12. Code commit: 68daa83. Draft PR: https://github.com/YNWAforever/ui-delight-maker/pull/91. Audit baseline: 2904faa502f7494173f48f412875c1d0a3aba674.

## Baseline and red evidence

The old Lead/Client reader split physical lines before reading quotes. The separate event reader did the same and did not handle doubled quotes. The CSV writer quoted RFC fields but emitted formula-shaped text unchanged. Audit probes 6 and 7 were used only as evidence of old defects; new tests assert corrected behavior.

Before implementation, the three focused files reported 11 expected failures: quoted multiline Lead/Client and event rows fragmented; detailed parser metadata and unclosed-quote error were absent; seven formula-shaped text cases and the typed numeric/text case failed. The old defects were reproduced without using the failing probes as release gates.

## Change

- One whole-file state machine now parses Lead, Client and event imports. It accepts BOM, CRLF, quoted multiline fields, doubled quotes, Chinese text and blank trailing physical lines. Syntax errors stop the plain-row API; the detailed API returns logical record index, source start line and explicit errors for T15's resumable import UI.
- The event importer uses the same parser. Lead/Client upload errors clear previous preview and commit state so malformed replacement files cannot leave stale rows visible.
- Export columns distinguish text, number and date. Text with formula prefixes after leading controls, whitespace or BOM gets an apostrophe before RFC quoting. Numeric columns preserve exact decimal strings such as -12.50 and reject nonnumeric strings. Report and admin audit exports declare column kinds; BOM remains default for Excel.
- Import does not remove the added apostrophe: it cannot distinguish an export safety prefix from a user's original apostrophe. Tests assert the original content is preserved after that prefix. Future bulk-error exports must use the same typed writer.

## Verification

- Focused red run: 11 expected failures, 36 passes across three files.
- Final CSV, event and report tests: 4 files, 75/75 passed.
- TypeScript, changed-file ESLint and pure bunx vite build (client and SSR) exit 0. bun run build was not used; no migration or seed ran.
- No authenticated Lead/Client/event role sessions were available for browser upload UAT. No Excel or LibreOffice executable was available locally for the harmless =1+1 literal-display check. These UI gates remain blocked; unit tests do not stand in for spreadsheet rendering.
- No production database, customer message, provider call or deployment was performed.
