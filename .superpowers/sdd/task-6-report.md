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

---

## Task 6 Fix Report - Reviewer findings: immutable PDF snapshots and draft preview totals

### Timestamp
- 2026-07-09T04:03:13+08:00

### Scope
- Fix the quote PDF preview resolver so accepted/issued snapshot pointers fail closed when the immutable snapshot is missing or malformed.
- Fix draft detail preview totals so edited line items and footer totals stay in sync.
- Add direct regression coverage for quote preview snapshot resolution.

### What changed
- Updated `src/components/quotes/quote-pdf-preview.tsx`:
  - `resolveQuotePdfSource` now returns an explicit state: `live`, `snapshot`, or `invalid`.
  - Accepted/issued quotes now require the exact referenced version id instead of falling back to mutable live quote data or other versions.
  - Missing immutable snapshots now return an `invalid` state with `missing_immutable_snapshot`.
  - Malformed immutable snapshots now return an `invalid` state with `invalid_immutable_snapshot`.
  - Added `QuotePdfPreviewUnavailable` so UI surfaces show a clear non-PDF fallback instead of rendering live mutable data.
- Updated `src/routes/quotes.$id.tsx`:
  - Draft preview now overrides both `lineItems` and `quote.total_value` when previewing unsaved edits.
  - The preview tab now renders the unavailable-state fallback when immutable snapshot resolution fails.
- Updated `src/routes/quotes.$id.pdf.tsx`:
  - The PDF route now renders the same unavailable-state fallback when the immutable snapshot is missing or malformed.

### Tests added or updated
- Added `src/components/quotes/__tests__/quote-pdf-preview.test.ts` covering:
  - referenced accepted snapshot resolves to immutable snapshot data
  - missing accepted snapshot pointer fails closed
  - malformed issued snapshot fails closed
  - no immutable pointer falls back to live draft data

### Verification run
- Red phase:
  - `bun run vitest run src/components/quotes/__tests__/quote-pdf-preview.test.ts`
  - Result: failed as expected because `resolveQuotePdfSource` did not yet expose immutable/live/invalid state.
- Green/focused:
  - `bun run vitest run src/components/quotes/__tests__/quote-pdf-preview.test.ts`
  - Result: passed (`1` file, `4` tests).
- Required verification:
  - `bun run vitest run src/components/quotes/__tests__/quote-pdf-preview.test.ts src/server/repositories/__tests__/quotes.test.ts src/server-functions/__tests__/quotes.test.ts src/lib/__tests__/quote-to-cash.test.ts`
  - Result: passed (`4` files, `33` tests).
  - `bun run build`
  - Result: succeeded.
  - Notes:
    - Pre-build schema step reported `{ "ok": true, "skipped": true, "reason": "DATABASE_URL is not set" }`
    - Seed step reported `{ "ok": true, "skipped": true, "reason": "CLIENTOPS_SEED_ON_DEPLOY is not 1" }`
    - Vite emitted existing chunk-size and unused-import warnings, but the build completed successfully.

### Files changed
- `src/components/quotes/quote-pdf-preview.tsx`
- `src/components/quotes/__tests__/quote-pdf-preview.test.ts`
- `src/routes/quotes.$id.tsx`
- `src/routes/quotes.$id.pdf.tsx`

### Self-review
- Immutable snapshot references now either resolve to the exact stored snapshot or stop with an explicit invalid state; they no longer silently downgrade to live mutable quote content.
- Draft preview totals now stay aligned with edited rows by overriding `quote.total_value` alongside `lineItems`.
- The patch is limited to the resolver, the two preview surfaces, and a focused regression test file.

---

## Task 6 Fix Report - Reviewer finding: validate immutable snapshot commercial fields

### Timestamp
- 2026-07-09T04:14:26.1369948+08:00

### Scope
- Fix the immutable quote PDF snapshot reader so object-shaped snapshots still fail closed when required commercial fields are missing.
- Add regression coverage for malformed immutable snapshot objects missing `total_value` or `line_items`.

### What changed
- Updated `src/components/quotes/quote-pdf-preview.tsx`:
  - `readQuotePdfSnapshot` now rejects snapshot objects unless `total_value` is a number and `line_items` is an array.
  - Removed the silent `0` fallback for missing `total_value` on immutable snapshots.
  - Preserved existing live-draft behavior when no immutable snapshot pointer exists, because only immutable snapshot validation changed.
- Updated `src/components/quotes/__tests__/quote-pdf-preview.test.ts`:
  - Added a regression case for an accepted immutable snapshot object missing `total_value`.
  - Added a regression case for an issued immutable snapshot object missing `line_items`.

### Verification run
- Red phase:
  - `bun run vitest run src/components/quotes/__tests__/quote-pdf-preview.test.ts`
  - Result: failed as expected because malformed object snapshots still resolved as `state: "snapshot"`.
- Green/focused:
  - `bun run vitest run src/components/quotes/__tests__/quote-pdf-preview.test.ts`
  - Result: passed (`1` file, `6` tests).
- Required verification:
  - `bun run vitest run src/components/quotes/__tests__/quote-pdf-preview.test.ts src/server/repositories/__tests__/quotes.test.ts src/server-functions/__tests__/quotes.test.ts src/lib/__tests__/quote-to-cash.test.ts`
  - Result: passed (`4` files, `35` tests).
  - `bun run build`
  - Result: succeeded.
  - Notes:
    - Pre-build schema step reported `{ "ok": true, "skipped": true, "reason": "DATABASE_URL is not set" }`
    - Seed step reported `{ "ok": true, "skipped": true, "reason": "CLIENTOPS_SEED_ON_DEPLOY is not 1" }`
    - Vite emitted existing chunk-size and unused-import warnings, but the build completed successfully.

### Files changed
- `src/components/quotes/quote-pdf-preview.tsx`
- `src/components/quotes/__tests__/quote-pdf-preview.test.ts`

### Self-review
- Immutable snapshot resolution now fails closed for missing required commercial fields instead of substituting fallback values.
- The patch is narrowly scoped to snapshot validation and targeted test coverage, matching the reviewer finding.

---

## Task 6 Fix Report - Reviewer finding: gate immutable quote PDF snapshots by status

### Timestamp
- 2026-07-09T04:22:14.3038202+08:00

### Scope
- Fix `resolveQuotePdfSource` so stale `issued_version_id` / `accepted_version_id` pointers do not force immutable snapshot rendering for mutable quote states like `draft` or `revised`.
- Add regression coverage proving leftover immutable pointers still resolve to live quote data outside customer-facing issued/accepted states.

### What changed
- Updated `src/components/quotes/quote-pdf-preview.tsx`:
  - Extended `QuotePdfSourceInput` to include `status`.
  - Gated immutable snapshot selection by lifecycle state instead of pointer presence alone.
  - `accepted` quotes only use `accepted_version_id` when present.
  - `sent` and `viewed` quotes only use `issued_version_id` when present.
  - Draft-like mutable states such as `draft` and `revised` now render live quote fields and live line items even if stale immutable pointers remain on the record.
- Preserved the existing fail-closed behavior for required immutable snapshots once a customer-facing immutable state is selected.

### Tests added or updated
- Updated `src/components/quotes/__tests__/quote-pdf-preview.test.ts`:
  - Added a regression case for a `draft` quote with a leftover `issued_version_id`.
  - Added a regression case for a reopened `revised` quote with a leftover `accepted_version_id`.
  - Both assertions verify `state: "live"`, live quote fields, and live line items rather than old snapshot content.

### Verification run
- Red phase:
  - `bun run vitest run src/components/quotes/__tests__/quote-pdf-preview.test.ts`
  - Result: failed as expected because stale immutable pointers still resolved to `state: "snapshot"`.
- Green/focused:
  - `bun run vitest run src/components/quotes/__tests__/quote-pdf-preview.test.ts`
  - Result: passed (`1` file, `8` tests).
- Required verification:
  - `bun run vitest run src/components/quotes/__tests__/quote-pdf-preview.test.ts src/server/repositories/__tests__/quotes.test.ts src/server-functions/__tests__/quotes.test.ts src/lib/__tests__/quote-to-cash.test.ts`
  - Result: passed (`4` files, `37` tests).
  - `bun run build`
  - Result: succeeded.
  - Notes:
    - Pre-build schema step reported `{ "ok": true, "skipped": true, "reason": "DATABASE_URL is not set" }`
    - Seed step reported `{ "ok": true, "skipped": true, "reason": "CLIENTOPS_SEED_ON_DEPLOY is not 1" }`
    - Vite emitted existing chunk-size and unused-import warnings, but the build completed successfully.

### Files changed
- `src/components/quotes/quote-pdf-preview.tsx`
- `src/components/quotes/__tests__/quote-pdf-preview.test.ts`

### Self-review
- Immutable snapshots are now reserved for customer-facing issued/accepted lifecycle states instead of any record that happens to retain an old pointer.
- Mutable draft/revision preview behavior stays live, so unsaved or reopened edits no longer render stale immutable commercial data.
- The fix is tightly scoped to the resolver and its regression coverage.

---

## Task 6 Fix Report - Reviewer finding: make quote preview name lookups best effort

### Timestamp
- 2026-07-09T04:31:00+08:00

### Scope
- Fix `src/routes/quotes.$id.tsx` and `src/routes/quotes.$id.pdf.tsx` so stale or deleted client/lead references do not block the quote detail or PDF preview routes.

### What changed
- Updated the quote detail loader in `src/routes/quotes.$id.tsx`:
  - Kept `getQuote()` and `getQuoteVersions()` as required loader work.
  - Wrapped optional `getClient()` and `getLead()` requests in local best-effort promises that downgrade lookup failures to `null`.
- Updated the PDF route loader in `src/routes/quotes.$id.pdf.tsx` with the same local best-effort lookup behavior.
- Preserved the existing display-name fallbacks (`client.company_name`, `lead.company_name`, ids, then `"Client"`), so the UI continues to render useful labels even when related records no longer exist.

### Tests added or updated
- No new tests added.
- Reason: there is no established route-loader test pattern in this worktree to extend quickly, and the reviewer asked to avoid building a new harness for this small robustness fix.

### Verification run
- Required verification:
  - `bun run vitest run src/components/quotes/__tests__/quote-pdf-preview.test.ts src/server/repositories/__tests__/quotes.test.ts src/server-functions/__tests__/quotes.test.ts src/lib/__tests__/quote-to-cash.test.ts`
  - Result: passed (`4` files, `37` tests).
  - `bun run build`
  - Result: succeeded.
  - Notes:
    - Pre-build schema step reported `{ "ok": true, "skipped": true, "reason": "DATABASE_URL is not set" }`
    - Seed step reported `{ "ok": true, "skipped": true, "reason": "CLIENTOPS_SEED_ON_DEPLOY is not 1" }`
    - Vite emitted the same existing chunk-size and unused-import warnings, but the build completed successfully.

### Files changed
- `src/routes/quotes.$id.tsx`
- `src/routes/quotes.$id.pdf.tsx`

### Self-review
- The patch is local to the two loaders the reviewer identified.
- Optional reference lookups now fail open to `null`, while required quote/version fetches still fail normally.
- Existing fallback labels continue to cover missing client/lead records without any UI refactor.
