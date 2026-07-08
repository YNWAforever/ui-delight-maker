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
