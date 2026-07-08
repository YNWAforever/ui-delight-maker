## Task 7 Report: Accounting Job Sheet Queue And Detail UI

### What changed

- Added `src/routes/job-sheets.tsx` for the accounting job sheet queue with operational metrics, status badges, and empty-state handling.
- Added `src/routes/job-sheets.$id.tsx` for the accounting handoff detail workspace using the real server functions:
  - `getJobSheet`
  - `updateJobSheetPortions`
  - `acceptJobSheetForAccounting`
  - `updatePortionXeroReference`
- Added `src/components/job-sheets/job-sheet-status-badge.tsx` for accounting-facing job sheet status display.
- Added `src/components/job-sheets/billing-portions-table.tsx` to show billing reconciliation, planned billing rows, and Xero reference state.
- Added the Job Sheets entry to `src/components/app-sidebar.tsx`.
- Captured the new routes in `src/routeTree.gen.ts`.
- Added focused source coverage in `src/routes/__tests__/-job-sheets-source.test.ts`.

### Files changed

- `src/components/app-sidebar.tsx`
- `src/components/job-sheets/job-sheet-status-badge.tsx`
- `src/components/job-sheets/billing-portions-table.tsx`
- `src/routes/job-sheets.tsx`
- `src/routes/job-sheets.$id.tsx`
- `src/routes/__tests__/-job-sheets-source.test.ts`
- `src/routeTree.gen.ts`

### Verification

#### Focused test

Command:

```bash
bun run vitest run src/routes/__tests__/-job-sheets-source.test.ts
```

Result:

- PASS
- 1 test file passed
- 3 tests passed

#### Build

Command:

```bash
bun run build
```

Result:

- PASS
- schema apply script skipped because `DATABASE_URL` is not set
- seed-on-deploy script skipped because `CLIENTOPS_SEED_ON_DEPLOY` is not `1`
- Vite client and SSR builds completed successfully
- existing bundle-size warnings remained during build output

### Self-review

- Confirmed the detail route uses the committed `getJobSheet` export rather than inventing `getJobSheetDetail`.
- Kept accounting scope constrained to manual reference tracking and acceptance workflow; no invoice creation, payment sync, ledger logic, or direct Xero integration was added.
- Enforced the accepted/locked immutability rule in the UI by preventing billing-plan edits once the job sheet is locked.
- Used `canAcceptJobSheet` for the accounting acceptance gate and surfaced reconciliation state in the workspace.

---

## Task 7 review-fix addendum

### Review findings addressed

- Replaced the string-only `src/routes/__tests__/-job-sheets-source.test.ts` assertions with behavior-level coverage:
  - `BillingPortionsTable` now gets exercised through `renderToStaticMarkup(...)` with real props.
  - The test asserts accepted total, planned billing total, reconciled copy, unreconciled delta copy, formatted dates, and Xero/description fallback text.
  - The test also verifies acceptance-gate behavior through the real `canAcceptJobSheet(...)` helper.
  - Exported the already-existing pure route helpers `toPortionDrafts` and `toXeroDrafts`, plus a narrow `isJobSheetCommercialLocked(...)` helper, so the accepted/locked rule is covered without adding browser-test infrastructure.

### Additional files changed for the fix

- `src/routes/job-sheets.$id.tsx`
- `src/routes/__tests__/-job-sheets-source.test.ts`

### Verification evidence

#### Focused behavior test

Command:

```bash
bun run vitest run src/routes/__tests__/-job-sheets-source.test.ts
```

Result:

- PASS
- 1 test file passed
- 4 tests passed
- Coverage focus moved from source-string inspection to rendered billing behavior and pure job-sheet workspace logic

#### TypeScript

Command:

```bash
bunx tsc --noEmit
```

Result:

- FAIL due to pre-existing baseline TypeScript debt outside Task 7 scope
- No Task 7 job-sheet files appeared in the compiler output
- Reported baseline files/errors included:
  - `src/components/quotes/__tests__/quote-pdf-preview.test.ts`
  - `src/components/quotes/quote-pdf-preview.tsx`
  - `src/lib/__tests__/pipeline.test.ts`
  - `src/lib/__tests__/sales-workspace.test.ts`
  - `src/routes/quotes.new.tsx`
  - `src/server-functions/automation-playbooks.ts`

Interpretation:

- The explicit no-new-type-errors constraint remains satisfied for this fix set because the compiler output does not mention:
  - `src/routes/job-sheets.$id.tsx`
  - `src/routes/__tests__/-job-sheets-source.test.ts`
  - any other Task 7 accounting job-sheet file

#### Build

Command:

```bash
bun run build
```

Result:

- PASS
- schema apply script skipped because `DATABASE_URL` is not set
- seed-on-deploy script skipped because `CLIENTOPS_SEED_ON_DEPLOY` is not `1`
- client and SSR builds both completed successfully

Concrete warning evidence still present in build output:

- chunk-size warnings for:
  - `dist/client/assets/index-iqR1sbUI.js` at `620.32 kB`
  - `dist/client/assets/neon-auth-provider-CqGMRBXE.js` at `729.69 kB`
- existing external-import noise from framework internals:
  - unused `createRequestHandler`, `defineHandlerCallback`, `transformPipeableStreamWithRouter`, `transformReadableStreamWithRouter`
  - unused `RawStream`
  - unused `hydrate` and `json`

### Commit

- `test: cover job sheet workspace behavior`
