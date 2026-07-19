# Company Workspace Loading Performance: Task 1 Report

## Scope

Established executable baseline contracts and a local deterministic fixture measurement utility. No production route, hook, loader, repository, mutation, credential, or resource behavior changed.

## RED Evidence

Command:

```text
bunx vitest run src/server/company-workspace/__tests__/performance-contract.test.ts src/routes/__tests__/-account-workspace-loading.test.tsx
```

Initial scaffolding failed on a missing measurement module and was not accepted as behavioral RED evidence. After correction, both desired assertions were temporarily run without `it.fails`: the real commercial loader test failed because engagement loading made 25 calls instead of 1, and the route policy test failed because all four optional sections were enabled instead of disabled. The run reported 2 failed files and 2 failed tests for exactly those assertions.

## GREEN Evidence

Command:

```text
bunx vitest run src/server/company-workspace/__tests__/performance-contract.test.ts src/routes/__tests__/-account-workspace-loading.test.tsx
```

Result after restoring the temporary expected-failure wrappers: 2 files passed and 2 expected failures executed.

Final focused verification:

```text
bunx vitest run src/server/company-workspace/__tests__/performance-contract.test.ts src/routes/__tests__/-account-workspace-loading.test.tsx src/server/company-workspace/__tests__/loaders.test.ts src/routes/__tests__/-accounts-workspace-source.test.ts
```

Result after correction: 4 files passed; 6 tests passed and 2 expected failures executed.

## Baseline Measurements

Command:

```text
bun scripts/clientops/measure-company-workspace.ts
```

| Fixture | Server calls | Database queries | Engagement queries | Response bytes | Elapsed duration |
| --- | ---: | ---: | ---: | ---: | ---: |
| Empty | 5 | 9 | 0 | 267 | Unavailable |
| Typical | 5 | 12 | 3 | 1,006 | Unavailable |
| High activity | 5 | 34 | 25 | 10,600 | Unavailable |

The model intentionally requires no credentials or database calls. Server-call and database-query counts represent the current eager route and per-client engagement fan-out. Response bytes are serialized synthetic fixtures. Deterministic elapsed duration is reported as unavailable; real request latency requires local server or preview instrumentation.

The bounded engagement target is one query per workspace. The typical and high-activity fixtures deliberately fail that target in the current baseline. The route contract also records that all optional sections currently fetch before their tabs are opened.

## Changed Files

- `scripts/clientops/measure-company-workspace.ts`
- `src/server/company-workspace/__tests__/performance-contract.test.ts`
- `src/routes/__tests__/-account-workspace-loading.test.tsx`
- `.superpowers/sdd/company-workspace-task-1-report.md`

## Checks

- `bunx prettier --check scripts/clientops/measure-company-workspace.ts src/server/company-workspace/__tests__/performance-contract.test.ts src/routes/__tests__/-account-workspace-loading.test.tsx`: passed.
- `git diff --check`: passed.
- `bunx tsc --noEmit`: Task 1 diagnostics are clean; command remains non-zero for existing `src/lib/__tests__/eslint-config.test.ts` missing declaration and implicit `any` diagnostics.

## Self-review

The contract describes both present behavior and the desired bounded/on-demand behavior without masking the known gaps. The fixtures are fixed and local. The measurement utility does not import runtime database code or use production credentials. No new whole-router invalidation or loading behavior was introduced.

## Commit

Initial baseline commit: `e5f66cb6e9437c634e6f858bc90b2f84c0dbf939`.
Executable-contract correction: `6178d77`.

## Concerns

Deterministic fixtures report elapsed duration as unavailable. Real request latency still requires local server or preview instrumentation. The repository-wide TypeScript check has two unrelated pre-existing diagnostics in the ESLint configuration test.

## Review correction

The first review rejected synthetic anti-contracts. The corrected performance test now invokes the real commercial loader with repository spies, and the route policy test exercises the enablement seam used by the account route. Both desired assertions use Vitest expected-failure semantics while the production behavior is intentionally unchanged; Tasks 3 and 4 must flip them to normal tests when their implementations land.

Covering verification:

```text
bunx vitest run src/server/company-workspace/__tests__/performance-contract.test.ts src/routes/__tests__/-account-workspace-loading.test.tsx src/server/company-workspace/__tests__/loaders.test.ts src/hooks/__tests__/use-company-workspace-section.test.tsx
```

Result: 4 files passed; 6 tests passed and 2 expected failures executed. Running the measurement CLI twice produced byte-for-byte identical counts, payload sizes, and `elapsedDurationMs: null` values.
