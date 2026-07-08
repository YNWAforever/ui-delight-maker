# Task 8 Report

- Commit: recorded in git history for `feat: surface job sheets in client and account views`

- Scope: surfaced job sheet summaries on client and account detail pages with links to `/job-sheets/$id`.
- TDD: added a focused repository test for `listJobSheets({ client_id, account_id })` before route edits; it passed immediately because Task 4 had already wired the filters.
- Implementation:
  - Added a `Job Sheets` tab to `src/routes/clients.$id.tsx` backed by `getJobSheets({ data: { client_id: params.id } })`.
  - Added an `Accounting handoff` section to the `Quotes & revenue` card in `src/routes/accounts.$id.tsx` backed by `getJobSheets({ data: { account_id: params.id } })`.
  - Used existing `formatCurrencyAmount`, `Link`, and `JobSheetStatusBadge` patterns.
  - Added a lightweight source test at `src/routes/__tests__/-client-account-job-sheets-source.test.ts`.
- Verification:
  - `bun run vitest run src/server/repositories/__tests__/job-sheets.test.ts` -> PASS (12 tests)
  - `bun run vitest run src/routes/__tests__/-client-account-job-sheets-source.test.ts` -> PASS (2 tests)
  - `bun run build` -> PASS
  - `bunx tsc --noEmit` -> FAIL on existing baseline issues in `src/components/quotes/quote-pdf-preview*`, `src/lib/__tests__/pipeline.test.ts`, `src/lib/__tests__/sales-workspace.test.ts`, `src/routes/quotes.new.tsx`, and `src/server-functions/automation-playbooks.ts`; no Task 8 files appeared in the output
