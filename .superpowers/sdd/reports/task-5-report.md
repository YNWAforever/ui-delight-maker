# Task 5 Report: Quote Server Functions For Templates, Versions, And Acceptance

## Status

DONE_WITH_CONCERNS

## Implementation Summary

- Added quote document server functions in `src/server-functions/quotes.ts`:
  - `getQuoteTemplates`
  - `getQuotePdfTemplates`
  - `getQuoteVersions`
  - `issueQuoteVersion`
  - `acceptQuoteAndCreateJobSheet`
- Enforced the existing auth boundary by calling `requireNeonAuthSession()` before repository access in every new server function.
- Implemented quote issuing to create an immutable issued snapshot, store `issued_version_id`, and move the quote to `sent`.
- Implemented quote acceptance to create an accepted snapshot, store `accepted_version_id`, mark the quote accepted, and call the idempotent accepted-quote job-sheet creation path.
- Added focused server-function tests in `src/server-functions/__tests__/quotes.test.ts` for auth-gated reads plus issuing and acceptance flows.

## TDD Evidence

### RED

Command:

```bash
bun run vitest run src/server-functions/__tests__/quotes.test.ts
```

Result:

- 5 tests failed.
- Failure mode matched the missing Task 5 exports:
  - `getQuoteTemplates is not a function`
  - `getQuotePdfTemplates is not a function`
  - `getQuoteVersions is not a function`
  - `issueQuoteVersion is not a function`
  - `acceptQuoteAndCreateJobSheet is not a function`

### GREEN

Command:

```bash
bun run vitest run src/server-functions/__tests__/quotes.test.ts
```

Result:

- 1 test file passed
- 5 tests passed
- 0 failures

## Tests And Results

### Focused tests

```bash
bun run vitest run src/server-functions/__tests__/quotes.test.ts
```

Passed:

- lists quote templates behind Neon auth
- lists quote pdf templates behind Neon auth
- lists quote versions behind Neon auth
- issues a quote by creating an issued version snapshot and updating the quote
- accepts a quote by creating an accepted version and draft job sheet

### Focused typecheck/error filter

Commands run:

```bash
bunx tsc --noEmit
```

```bash
$output = & bunx tsc --noEmit 2>&1; $output | Where-Object { $_ -match 'src/server-functions/quotes.ts|src/server-functions/__tests__/quotes.test.ts' }; exit 0
```

Results:

- Initial full typecheck exposed two local snapshot typing errors in `src/server-functions/quotes.ts`; those were fixed by casting snapshots to `JsonValue`.
- Final touched-file filter returned no errors for:
  - `src/server-functions/quotes.ts`
  - `src/server-functions/__tests__/quotes.test.ts`
- Full repo typecheck still has unrelated baseline failures in:
  - `src/lib/__tests__/pipeline.test.ts`
  - `src/lib/__tests__/sales-workspace.test.ts`
  - `src/server-functions/automation-playbooks.ts`

## Files Changed

- `src/server-functions/quotes.ts`
- `src/server-functions/__tests__/quotes.test.ts`

## Self-Review

### Auth order

- Verified each new server function calls `requireNeonAuthSession()` before repository access.

### Version immutability and idempotency

- `issueQuoteVersion` creates a fresh `quote_versions` snapshot with reason `issued` before updating the parent quote.
- `acceptQuoteAndCreateJobSheet` creates a fresh `quote_versions` snapshot with reason `accepted` before updating the parent quote.
- Accepted quote job-sheet creation goes through `createJobSheetFromAcceptedQuote`, which is the idempotent repository path from Task 4.

### No Xero overreach

- No new invoice, payment, ledger, or direct Xero behavior was added.

### Serializable returns

- New server functions return repository objects and plain wrapper objects only.
- Snapshot payloads passed into `createQuoteVersion` were adjusted to use `JsonValue` so the new code stays type-safe on the repository boundary.

## Concerns

1. The Task 5 brief's sample commit message (`feat: add quote version and acceptance server functions`) conflicts with the user instruction (`feat: add quote document server actions`). I followed the user instruction for the actual commit.
2. Full-repo `bunx tsc --noEmit` is not clean due to unrelated pre-existing errors outside the Task 5 ownership scope.

## Task 5 Review Fixes

- Made `issueQuoteVersion` retry-safe by reusing the existing `issued_version_id` when the quote already points at an immutable issued version. The server action now lists versions, returns the stable issued version, and only writes the immutable pointer on first issue.
- Made `acceptQuoteAndCreateJobSheet` retry-safe by reusing the existing `accepted_version_id` when present. The accepted quote job-sheet path now always uses that stable version id, so Task 4's idempotent job-sheet creation logic sees the same accepted snapshot on retries.
- Kept non-pointer metadata updates conditional: if a quote already has an immutable version pointer but still needs `status`, `pdf_url`, `accepted_at`, or `accepted_by` normalized, the server action updates only those mutable fields.
- Strengthened `src/server-functions/__tests__/quotes.test.ts` with retry/idempotency coverage for issued-version reuse and accepted-version reuse, plus explicit auth-before-repository call-order assertions.
- Expanded acceptance assertions to verify accepted snapshot payload details and `accepted_at`.

### Review Fix Verification

Commands run:

```bash
bun run vitest run src/server-functions/__tests__/quotes.test.ts
```

```bash
$output = bunx tsc --noEmit 2>&1; $matches = $output | Select-String -Pattern 'src/server-functions/quotes.ts|src/server-functions/__tests__/quotes.test.ts'; if ($matches) { $matches | ForEach-Object { $_.Line } }; exit 0
```

Results:

- RED re-review coverage run failed exactly as expected before the fix: 1 file, 7 tests, 2 failures (`reuses an orphaned issued version on retry instead of creating a duplicate` and `reuses an orphaned accepted version on retry and keeps job-sheet creation idempotent`).
- Latest focused Vitest run passed: 1 file, 7 tests, 0 failures.
- Focused touched-file typecheck filter returned no diagnostics for:
  - `src/server-functions/quotes.ts`
  - `src/server-functions/__tests__/quotes.test.ts`

## Task 5 Re-Review Fix Round 2

- Fixed the remaining retry-safety gap in `issueQuoteVersion`: when `issued_version_id` is still null after a partial failure, the action now checks `listQuoteVersions(quote.id)` for an existing `reason: "issued"` snapshot and reuses that stable version before considering `createQuoteVersion(...)`.
- Fixed the same gap in `acceptQuoteAndCreateJobSheet`: when `accepted_version_id` is absent, the action now checks `listQuoteVersions(quote.id)` for an existing `reason: "accepted"` snapshot, reuses it, then updates quote acceptance metadata and calls `createJobSheetFromAcceptedQuote(...)` with that stable accepted version id.
- Tightened the mutable quote update step so reused versions still backfill `issued_version_id` / `accepted_version_id` plus status metadata without creating a second immutable snapshot.
- Strengthened auth-order tests for both `getQuotePdfTemplates` and `getQuoteVersions` by asserting `requireNeonAuthSession()` is invoked before the repository calls, not just that the happy-path calls occur.

### Latest Verification Snapshot

- `bun run vitest run src/server-functions/__tests__/quotes.test.ts` -> PASS (`1` file, `7` tests, `7` passed, `0` failed)
- touched-file filter for `bunx tsc --noEmit` -> no diagnostics for:
  - `src/server-functions/quotes.ts`
  - `src/server-functions/__tests__/quotes.test.ts`
