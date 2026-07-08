## Task 6 Fix Report - Reviewer finding: persist quote document fields on create

### Timestamp
- 2026-07-09T03:51:14.2361973+08:00

### Scope
- Fix the critical create-quote regression where document-builder fields submitted by `src/routes/quotes.new.tsx` were dropped before persistence.

### What changed
- Extended `CreateQuoteInput` in `src/server-functions/quotes.ts` to accept:
  - `quote_template_id`
  - `document_sections`
  - `cover_text`
  - `assumptions`
  - `payment_terms`
- Extended repository `CreateQuoteInput` in `src/server/repositories/quotes.ts` with the same fields.
- Updated `src/server/repositories/quotes.ts#createQuote` to insert all five document fields during quote creation.
- Preserved the existing JSON serialization pattern by serializing `document_sections` with `JSON.stringify(...)`, matching the update path behavior.

### Tests added or updated
- `src/server/repositories/__tests__/quotes.test.ts`
  - Added a regression test asserting the insert SQL includes the quote document columns and that the exact query parameters contain serialized `document_sections`.
- `src/server-functions/__tests__/quotes.test.ts`
  - Added a regression test asserting the server function forwards the full document payload plus auth-derived `created_by` into the repository create call.

### Verification run
- Red phase:
  - `bun run vitest run src/server/repositories/__tests__/quotes.test.ts src/server-functions/__tests__/quotes.test.ts`
  - Result: failed as expected in the repository create-path test because the insert statement omitted the document fields.
- Green/focused:
  - `bun run vitest run src/server/repositories/__tests__/quotes.test.ts src/server-functions/__tests__/quotes.test.ts`
  - Result: passed (`2` files, `17` tests).
- Required coverage:
  - `bun run vitest run src/server/repositories/__tests__/quotes.test.ts src/server-functions/__tests__/quotes.test.ts src/lib/__tests__/quote-to-cash.test.ts`
  - Result: passed (`3` files, `29` tests).
- Required build:
  - `bun run build`
  - Result: succeeded.
  - Notes:
    - Pre-build schema step reported `{ "ok": true, "skipped": true, "reason": "DATABASE_URL is not set" }`
    - Seed step reported `{ "ok": true, "skipped": true, "reason": "CLIENTOPS_SEED_ON_DEPLOY is not 1" }`
    - Vite emitted existing chunk-size/unused-import warnings, but the build completed successfully.

### Files changed
- `src/server-functions/quotes.ts`
- `src/server/repositories/quotes.ts`
- `src/server/repositories/__tests__/quotes.test.ts`
- `src/server-functions/__tests__/quotes.test.ts`

### Self-review
- The fix is narrowly scoped to the create pipeline identified in the reviewer finding.
- `document_sections` now uses the same JSON serialization strategy on create that the repository already used on update.
- Tests assert real forwarded arguments and actual query parameters instead of only checking generic happy-path behavior.
- No unrelated files were edited or reverted.
