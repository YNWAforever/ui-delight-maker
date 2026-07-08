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

---

## Task 7 review-fix follow-up 2

### Review findings addressed

- Preserved `entered_in_xero` when hydrating billing-portion edit drafts so an accounting save no longer downgrades manually entered Xero-tracked rows back to `planned`.
- Kept the edit UI safe for entered rows by showing a non-editable entered-in-Xero status display instead of offering the planned/cancelled select.
- Replaced the `/job-sheets` accepted-value rollup with a per-currency summary string so mixed-currency accepted totals are no longer summed and labeled as HKD.
- Updated the focused route test to assert the preserved `entered_in_xero` behavior and the mixed-currency accepted-value summary.

### Files changed for this follow-up

- `src/routes/job-sheets.$id.tsx`
- `src/routes/job-sheets.tsx`
- `src/routes/__tests__/-job-sheets-source.test.ts`

### Verification evidence

#### Focused test

Command:

```bash
bun run vitest run src/routes/__tests__/-job-sheets-source.test.ts
```

Result:

- PASS
- 1 test file passed
- 5 tests passed

#### TypeScript

Command:

```bash
bunx tsc --noEmit
```

Result:

- FAIL due to pre-existing baseline TypeScript issues outside Task 7 scope
- No Task 7 files appeared in the compiler output
- Reported baseline files/errors included:
  - `src/components/quotes/__tests__/quote-pdf-preview.test.ts`
  - `src/components/quotes/quote-pdf-preview.tsx`
  - `src/lib/__tests__/pipeline.test.ts`
  - `src/lib/__tests__/sales-workspace.test.ts`
  - `src/routes/quotes.new.tsx`
  - `src/server-functions/automation-playbooks.ts`

#### Build

Command:

```bash
bun run build
```

Result:

- PASS
- schema apply script skipped because `DATABASE_URL` is not set
- seed-on-deploy script skipped because `CLIENTOPS_SEED_ON_DEPLOY` is not `1`
- client and SSR builds completed successfully
- existing chunk-size and framework unused-import warnings remained in build output

### Commit

- `fix: preserve job sheet accounting state`

---

## Task 7 review-fix follow-up 3

### Review findings addressed

- Exported focused route helpers so the draft-to-preview and draft-to-save mapping is covered by behavior tests instead of source inspection alone:
  - `buildPreviewPortions(...)`
  - `buildPortionSavePayload(...)`
- Fixed preview mapping so edited draft values now drive billing preview rows and the accounting acceptance gate:
  - draft `status` is respected for editable rows
  - `entered_in_xero` rows still preserve their original entered status
  - edited `amount` and `target_invoice_date` values flow into the preview rows
- Preserved `target_invoice_date` through the billing-plan save path by threading it through:
  - `PortionDraft`
  - `toPortionDrafts(...)`
  - `NewJobSheetPortion`
  - repository insert payloads in `replaceJobSheetPortions(...)`
- Added a billing-plan date input so accounting can edit the target invoice date that is now being saved.

### Files changed for this follow-up

- `src/lib/quote-to-cash.ts`
- `src/routes/job-sheets.$id.tsx`
- `src/routes/__tests__/-job-sheets-source.test.ts`
- `src/server/repositories/job-sheets.ts`
- `src/server/repositories/__tests__/job-sheets.test.ts`
- `src/server-functions/__tests__/job-sheets.test.ts`

### Verification evidence

#### Required focused tests

Command:

```bash
bun run vitest run src/routes/__tests__/-job-sheets-source.test.ts src/server/repositories/__tests__/job-sheets.test.ts src/server-functions/__tests__/job-sheets.test.ts
```

Result:

- PASS
- 3 test files passed
- 24 tests passed

#### TypeScript

Command:

```bash
bunx tsc --noEmit
```

Result:

- FAIL due to pre-existing baseline TypeScript issues outside Task 7 scope
- No Task 7 files appeared in the compiler output
- Reported baseline files/errors remained in:
  - `src/components/quotes/__tests__/quote-pdf-preview.test.ts`
  - `src/components/quotes/quote-pdf-preview.tsx`
  - `src/lib/__tests__/pipeline.test.ts`
  - `src/lib/__tests__/sales-workspace.test.ts`
  - `src/routes/quotes.new.tsx`
  - `src/server-functions/automation-playbooks.ts`

#### Build

Command:

```bash
bun run build
```

Result:

- PASS
- schema apply step skipped because `DATABASE_URL` is not set
- seed-on-deploy step skipped because `CLIENTOPS_SEED_ON_DEPLOY` is not `1`
- client and SSR builds both completed successfully
- existing chunk-size and framework unused-import warnings remained in build output

---

## Task 7 review-fix follow-up 4

### Review findings addressed

- Added a pure `hasUnsavedBillingDraftChanges(...)` helper so the acceptance gate can detect when the billing-plan drafts differ from the currently persisted save payload.
- Added a pure `canShowAcceptAndLockAction(...)` helper so the action bar hides `Accept & lock` when the job sheet is already commercially locked, including the `locked_at`-but-not-accepted case.
- Guarded the accept action itself so it now refuses with a toast when:
  - commercial fields are already locked
  - unsaved billing-plan changes exist, using the explicit message `Save the billing plan before accepting.`
- Updated the acceptance-gate alert copy and the action button disabled state so the UI makes the save-before-accept requirement visible before the user clicks.
- Added focused helper tests first, then implemented the minimal route changes to satisfy them.

### Files changed for this follow-up

- `src/routes/job-sheets.$id.tsx`
- `src/routes/__tests__/-job-sheets-source.test.ts`

### Verification evidence

#### Required focused tests

Command:

```bash
bun run vitest run src/routes/__tests__/-job-sheets-source.test.ts src/server/repositories/__tests__/job-sheets.test.ts src/server-functions/__tests__/job-sheets.test.ts
```

Result:

- PASS
- 3 test files passed
- 26 tests passed

#### TypeScript

Command:

```bash
bunx tsc --noEmit
```

Result:

- FAIL due to pre-existing baseline TypeScript issues outside Task 7 scope
- No Task 7 job-sheet files appeared in the compiler output
- Reported baseline files/errors remained in:
  - `src/components/quotes/__tests__/quote-pdf-preview.test.ts`
  - `src/components/quotes/quote-pdf-preview.tsx`
  - `src/lib/__tests__/pipeline.test.ts`
  - `src/lib/__tests__/sales-workspace.test.ts`
  - `src/routes/quotes.new.tsx`
  - `src/server-functions/automation-playbooks.ts`

#### Build

Command:

```bash
bun run build
```

Result:

- PASS
- schema apply step skipped because `DATABASE_URL` is not set
- seed-on-deploy step skipped because `CLIENTOPS_SEED_ON_DEPLOY` is not `1`
- client and SSR builds both completed successfully
- existing chunk-size and framework unused-import warnings remained in build output

### Commit

- pending
