# Task 1 Report: Schema Migration And Deploy-Time Guard

## Implemented

- Added `neon/migrations/005_quote_to_cash_accounting_handoff.sql` with the quote-to-cash accounting handoff schema.
- Updated `src/lib/clientops-relationship-schema.ts` to include the new migration path, required tables, and required columns.
- Updated `src/lib/__tests__/clientops-relationship-schema.test.ts` to cover the new migration ordering and quote-to-cash schema requirements.

## TDD Evidence

### RED

Focused guard test before implementation:

```bash
bun run vitest run src/lib/__tests__/clientops-relationship-schema.test.ts
```

Result: failed as expected.

- Missing migration path:
  - expected `neon/migrations/005_quote_to_cash_accounting_handoff.sql`
- Missing required quote-to-cash tables and columns in the guard whitelist

### GREEN

After implementing the migration and guard updates:

```bash
bun run vitest run src/lib/__tests__/clientops-relationship-schema.test.ts
```

Result: passed.

- 1 test file passed
- 9 tests passed

### REVIEW FIX (Quote-to-Cash Column Assertion Coverage)

Updated `src/lib/__tests__/clientops-relationship-schema.test.ts` to assert all newly required
`CLIENTOPS_REQUIRED_COLUMNS` entries from Task 1 Step 4 in the quote-to-cash handoff test:
`quotes.quote_template_id`, `quotes.accepted_version_id`, `quotes.issued_version_id`,
`quotes.document_sections`, `quotes.cover_text`, `quotes.assumptions`, `quotes.payment_terms`,
`quotes.accepted_at`, `quotes.accepted_by`, `quotes.parent_quote_id`, `quotes.change_order_reason`,
`quote_line_items.quote_id`, `quote_versions.quote_id`, `job_sheets.quote_id`,
`job_sheets.accepted_quote_version_id`, `job_sheet_portions.job_sheet_id`,
and `job_sheet_activity.job_sheet_id`.

Re-ran:

```bash
bun run vitest run src/lib/__tests__/clientops-relationship-schema.test.ts
```

Result: passed (`1 test file passed`, `9 tests passed`).

## Files Changed

- `neon/migrations/005_quote_to_cash_accounting_handoff.sql`
- `src/lib/clientops-relationship-schema.ts`
- `src/lib/__tests__/clientops-relationship-schema.test.ts`

## Self-Review

- Scope stayed limited to the migration, deploy-time guard, and the related test file.
- The migration is idempotent where the brief required it, using `if not exists` guards and `drop constraint if exists` before redefining the quote status check.
- The guard now checks the exact ordered migration chain and the new quote-to-cash tables and columns required by the brief.

## Concerns

- `CREATE TABLE IF NOT EXISTS` does not retrofit partially existing table definitions if an older database has an incomplete version of one of the new tables. The deploy-time guard should catch missing tables and columns, but this migration does not attempt a destructive repair.
