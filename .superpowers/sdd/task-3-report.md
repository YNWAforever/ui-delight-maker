# Task 3: Add Server-Only Neon DB Boundary

## What I implemented
- Added `src/server/db/query-builders.ts` with `buildFilters` and `buildUpdate` per task spec.
- Added `src/server/db/__tests__/query-builders.test.ts` with the three required SQL helper tests.
- Added `src/server/db/neon.server.ts` with:
  - `getDatabaseUrl`
  - `query<T>(...): Promise<T[]>`
  - `queryOne<T>(...): Promise<T | null>`
  - `transaction` using a shared server-only Neon pool and transaction callback.

## What I tested
- Ran RED test first to confirm missing-module failure:
  - `bun test src/server/db/__tests__/query-builders.test.ts` → failed because `query-builders.ts` was missing (expected).
- Implemented builders and reran:
  - `bun test src/server/db/__tests__/query-builders.test.ts` → **3 passed, 0 failed**.
- Ran typecheck:
  - `bunx tsc --noEmit` → fails on pre-existing unrelated repository issues (many existing type errors across routes/server functions); no new Task 3 type errors introduced.

## TDD evidence
- RED: missing `src/server/db/query-builders.ts` produced import resolution failure as expected.
- GREEN: after adding `src/server/db/query-builders.ts`, all 3 query-builder tests pass.

## Files changed
- `src/server/db/__tests__/query-builders.test.ts` (new)
- `src/server/db/query-builders.ts` (new)
- `src/server/db/neon.server.ts` (new)
- `.superpowers/sdd/task-3-report.md` (new)

## Self-review findings
- I aligned `query`/`queryOne` and transaction signatures to the requested API and kept the boundary server-only with runtime env validation.
- Adjusted `buildUpdate` to accept `string[]` allowed columns to avoid over-constraining generic inference in strict mode and keep the tests compiling cleanly.
- Kept the implementation minimal and isolated to the Task 3 files only.

## Issues / concerns
- `bunx tsc --noEmit` still reports many pre-existing TypeScript errors outside Task 3 and blocks a clean repo-wide typecheck.
- `neon.server.ts` uses a cast for `values` to satisfy installed `@neondatabase/serverless` type overload shape while preserving requested public API.

## Reviewer fix follow-up
- Updated `src/server/db/query-builders.ts` so `buildUpdate` now accepts `allowedColumns: Array<keyof T & string>` for compile-time column-name protection.
- Narrowed only `src/server/db/__tests__/query-builders.test.ts` to satisfy the stricter signature in the third test case while preserving behavior.
- `bun test src/server/db/__tests__/query-builders.test.ts` → **3 passed, 0 failed**.
- `bunx tsc --noEmit` still fails for pre-existing repository-wide issues; no new Task 3-specific type errors are introduced by this fix.
