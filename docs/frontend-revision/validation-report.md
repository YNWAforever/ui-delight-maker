# Validation Report

Final state is filled in at F5/F6. This file is opened early because the environment gates were known from A2 and every later step must report against them honestly.

**Standing rule (Instruction §18): a skipped or gated check is reported as skipped or gated. Never as passed.**

## Passed checks

_Filled at F5._ Baseline equivalents are in [baseline-gates.md](./baseline-gates.md).

## Environment-gated or skipped checks

### Decision on record

The operator was asked how to handle missing runtime credentials and chose **"proceed gated, capture later"**: code work continues across all phases, and every runtime check is recorded here as gated with an exact manual checklist, rather than being skipped silently or faked.

### EG-1 — `bun run build` cannot run locally

Needs `DATABASE_URL`. `clientops:verify-schema` throws before `vite build` is reached. Bundle evidence is produced with `bunx vite build`, which isolates bundling from the two DB-dependent pre-steps and the post-deploy seed.

To lift: set `DATABASE_URL`, then `bun run build`.

### EG-2 — No authenticated runtime, so no in-browser verification

Needs `DATABASE_URL`, `NEON_AUTH_URL`, `APP_BASE_URL`. Without them the dev server starts but cannot establish a session or load workspace data.

Additionally — and this one is easy to misread as a regression — `SUPABASE_URL` and `SUPABASE_ANON_KEY` are **required at runtime**, not optional legacy. `src/server/auth/resource-ownership.ts` resolves ownership for eight Supabase-owned resource types on the authorization path; without those variables `createSupabaseServerClient()` throws and every guarded deal / project / contact / customer-success / automation route returns **500 from inside the capability check**. Any environment used for verification needs all five variables, and a 500 on those routes in an under-configured preview is a configuration fault, not a defect introduced by this branch.

Checks this gates:

| Plan step | Check | Status |
|---|---|---|
| A2 | "Before" screenshots, 35 routes × 1440 and 375 | **gated** |
| §6 step 10 | Per-route dev-server walkthrough of every REAL action, console open | **gated** |
| F1 | Responsive capture, 35 routes × 1440/1024/768/375, and the 375 overflow assertion | **gated** |
| F2 | Keyboard paths and accessibility-inspector run per route | **gated** |
| F3 | Console-error and failed-request walkthrough; link check | **gated** |
| F6 | Preview smoke subset | **gated on Vercel access** |

**The before-state is not lost.** `origin/main` is untouched, so the before-capture can still be taken later from a worktree at that commit by anyone with credentials. The manual checklist for doing so is written at F1.

Checks that are **not** gated and are performed normally: `bun run test`, `bun run lint`, `bunx tsc --noEmit`, `bunx vite build`, `git diff --check`, every unit test written during Phases B–E, and all static verification (grep gates, import-boundary checks, policy-module diffs).

### EG-3 — 53 skipped tests / 4 skipped test files at baseline

Pre-existing. `test:database-contract` self-skips on missing `DATABASE_TEST_URL`. The full enumeration of which suites skip and on which variables is carried from A1's test appendix into this section at F5.

## Existing baseline warnings

Carried verbatim from [baseline-gates.md](./baseline-gates.md): W-1 route-discovery warning (fixed by B9), W-2 chunk-size warning (two chunks over 500 kB at baseline), W-3 TanStack unused re-export notices from inside `node_modules`.

Two pre-existing test failures, neither caused by this branch and neither a product defect:

- **BF-1** — `agents-catalogue.test.ts`. A Windows-only path-separator bug in the test's own fixture exemption. Green on CI (`ubuntu-latest`). Local runs of `bun run test` stay red for the life of this branch because of it.
- **BF-2** — `-list-route-performance.test.tsx` "dashboard". A 5s-timeout flake under full-suite load on a slow machine; passes in isolation.

## New warnings introduced by the revision

_Filled at F5, by diffing against the two lists above._

## Known backend dependencies

_Filled from [backend-dependencies.md](./backend-dependencies.md) as entries accumulate._

## Command transcripts

_Filled at F5._ Baseline transcripts are in [`baseline/`](./baseline/).

## Preview verification

_Filled at F6._ See EG-2 for the five environment variables a working preview needs.
