# App-Wide Loading Performance Results

Measured on 2026-07-22 from branch `codex/company-workspace-loading-performance`. Baseline and final server/query/payload values are the deterministic high-activity fixtures emitted by `performance:routes`; route chunk bytes are the largest route-owned client graph for each family in the production Vite manifest. Shared and explicit vendor chunks are reported separately and are not charged to one route.

## Route Family Results

| Route family  | Baseline server calls | Final server calls | Baseline database queries | Final database queries | Baseline bytes | Final bytes | Final route chunk bytes | Cached return result                          | Mobile result                                   | Exception                                                                         |
| ------------- | --------------------: | -----------------: | ------------------------: | ---------------------: | -------------: | ----------: | ----------------------: | --------------------------------------------- | ----------------------------------------------- | --------------------------------------------------------------------------------- |
| auth          |                     2 |                  1 |                         6 |                      4 |         10,263 |       2,558 |                   1,465 | Pass: cached form shell retained              | Contract pass; authenticated live check pending | Identity owner; follow-up PERF-14 to reduce the 614,482-byte lazy auth form chunk |
| shell         |                     2 |                  1 |                         3 |                      3 |         10,664 |       2,659 |                       0 | Pass: shell retained across navigation        | Contract pass; authenticated live check pending | Platform owner; follow-up PERF-13 to split the 658,379-byte shared client entry   |
| dashboard     |                     2 |                  1 |                         3 |                      3 |         12,268 |       3,063 |                  28,355 | Pass: pipeline remains visible during refresh | Contract pass; authenticated live check pending | None                                                                              |
| accounts      |                     2 |                  1 |                         4 |                      3 |         11,867 |       2,962 |                  22,468 | Pass: list/detail retained                    | Contract pass; authenticated live check pending | None                                                                              |
| clients       |                     2 |                  1 |                         5 |                      4 |         11,466 |       2,861 |                  14,860 | Pass: workspace tabs retained                 | Contract pass; authenticated live check pending | None                                                                              |
| leads         |                     2 |                  1 |                         4 |                      3 |         10,664 |       2,659 |                  14,290 | Pass: list/detail retained                    | Contract pass; authenticated live check pending | None                                                                              |
| campaigns     |                     2 |                  1 |                         4 |                      3 |         12,268 |       3,063 |                  11,667 | Pass: campaign and attendees retained         | Contract pass; authenticated live check pending | None                                                                              |
| quotes        |                     2 |                  1 |                         6 |                      4 |         11,065 |       2,760 |                  34,410 | Pass: detail, versions, and draft retained    | Contract pass; authenticated live check pending | None                                                                              |
| job-sheets    |                     2 |                  1 |                         4 |                      3 |         12,669 |       3,164 |                  19,312 | Pass: accounting draft retained               | Contract pass; authenticated live check pending | None                                                                              |
| tasks         |                     2 |                  1 |                         3 |                      3 |         10,664 |       2,659 |                   8,514 | Pass: optimistic queue retained               | Contract pass; authenticated live check pending | None                                                                              |
| approvals     |                     2 |                  1 |                         3 |                      3 |         12,268 |       3,063 |                  14,355 | Pass: optimistic queue retained               | Contract pass; authenticated live check pending | None                                                                              |
| renewals      |                     2 |                  1 |                         3 |                      3 |         11,867 |       2,962 |                  15,835 | Pass: filters and preview retained            | Contract pass; authenticated live check pending | None                                                                              |
| relationships |                     2 |                  1 |                         3 |                      3 |         13,872 |       3,467 |                   5,717 | Pass: paginated accounts retained             | Contract pass; authenticated live check pending | None                                                                              |
| notifications |                     2 |                  1 |                         3 |                      3 |         13,872 |       3,467 |                   3,745 | Pass: optimistic queue retained               | Contract pass; authenticated live check pending | None                                                                              |
| reports       |                     2 |                  1 |                         3 |                      3 |         11,466 |       2,861 |                  91,218 | Pass: summary retained while chart loads      | Contract pass; authenticated live check pending | None                                                                              |
| settings      |                     2 |                  1 |                         3 |                      3 |         11,867 |       2,962 |                  14,606 | Pass: products and settings retained          | Contract pass; authenticated live check pending | None                                                                              |
| account       |                     2 |                  1 |                         3 |                      3 |         11,466 |       2,861 |                  17,507 | Pass: profile retained                        | Contract pass; authenticated live check pending | None                                                                              |
| agents        |                     2 |                  1 |                         4 |                      3 |         11,065 |       2,760 |                  16,242 | Pass: directory and history retained          | Contract pass; authenticated live check pending | None                                                                              |
| ai-review     |                     2 |                  1 |                         3 |                      3 |         12,268 |       3,063 |                   4,701 | Pass: review state retained                   | Contract pass; authenticated live check pending | None                                                                              |
| admin         |                     2 |                  1 |                         9 |                      6 |         10,664 |       2,659 |                  29,350 | Pass: directory/detail retained               | Contract pass; authenticated live check pending | None                                                                              |

## Automated Evidence

- Generated route audit: every non-API route maps to exactly one of 20 route families.
- Scenario coverage: 60 fixture measurements and 80 browser-behavior contracts.
- Focused Task 11 matrix: 51 passed.
- Final complete Vitest suite: 834 passed, 1 skipped, 0 failed across 378 suites.
- Production Vite client and SSR build: passed.
- Route-owned bundle budget: all measured routes at or below 256,000 bytes.
- Scoped lint for this change: zero errors (one ignored-file warning for package.json).
- Full lint baseline: 2,848 existing Prettier errors and 28 warnings across older files, dominated by Windows line-ending drift.
- TypeScript baseline: only the two recorded diagnostics in src/lib/**tests**/eslint-config.test.ts.test.ts`.

## Browser Evidence

| Environment                     | Scenario            | Result                           | Observed timing                                  | Evidence                                                    |
| ------------------------------- | ------------------- | -------------------------------- | ------------------------------------------------ | ----------------------------------------------------------- |
| Local desktop 1440x900          | Cold auth shell     | Partial: shell rendered          | 596 ms; local auth session proxy failed          | docs/performance/evidence/local-login-desktop.png           |
| Local desktop 1440x900          | Protected deep link | Partial: redirected to login     | No page error; server auth proxy env was missing | Account detail fixture URL                                  |
| Local desktop 1440x900          | Cached              | Contract pass; live auth pending | Deterministic cache contract                     | Completion audit                                            |
| Local desktop 1440x900          | Stale refresh       | Contract pass; live auth pending | Deterministic retained-content contract          | Completion audit                                            |
| Local mobile 390x844            | Auth shell          | Partial: shell rendered          | 115 ms; no overflow; auth session proxy failed   | docs/performance/evidence/local-login-mobile.png            |
| Local mobile 390x844            | Cached              | Contract pass; live auth pending | Deterministic cache contract                     | Completion audit                                            |
| Vercel preview desktop 1440x900 | Cold and cached     | READY; auth matrix pending       | Chrome control failed before viewport audit      | dpl_CqGFRapEMoua7uAoPqaVAbMmUu67                            |
| Vercel preview mobile 390x844   | Cold and cached     | READY; auth matrix pending       | Chrome control failed before viewport audit      | ui-delight-maker-ozp7e2vwg-ynwaforevers-projects.vercel.app |

## Recorded Warnings

- The production build warns about the 658,379-byte shared client entry. It is shared framework/application infrastructure, not route-owned; follow-up PERF-13 is assigned to the Platform owner.
- The 614,482-byte authentication form is lazy and shared only by auth and invitation routes. Follow-up PERF-14 is assigned to the Identity owner.
- Existing TanStack SSR unused-import warnings originate in package code and do not change the client bundle budget result.
- Authenticated route-by-route browser verification requires an approved development account; the clean automation profile verified the rendered auth shell, responsive layout, and protected-route redirect only.
- The local auth proxy logged ERR_INVALID_URL for null/get-session because its auth base URL environment value was absent. The browser page-error stream stayed empty, but this blocks a valid local login/session check.
- Vercel preview dpl_CqGFRapEMoua7uAoPqaVAbMmUu67 reached READY at https://ui-delight-maker-ozp7e2vwg-ynwaforevers-projects.vercel.app.
- Direct requests to preview login and account-detail routes returned 302 to Vercel SSO, confirming deployment protection is active.
- The approved authenticated Chrome connection failed twice during browser runtime startup because the Windows sandbox ACL helper exited before Chrome discovery. No clean-profile browser was substituted, so the protected desktop/mobile matrix remains pending.
- use-route-polling-refresh.ts retains visibility-aware broad invalidation as unused compatibility code. Follow-up PERF-15 is assigned to the Platform owner to remove it or replace it with key-scoped live updates.
