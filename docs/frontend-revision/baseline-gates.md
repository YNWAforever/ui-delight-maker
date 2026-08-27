# Baseline Gates

Captured in step A2 against `origin/main` (`5c8590a`), before any `src/` change.
The only working-tree difference from `origin/main` at capture time was `docs/frontend-revision/**` and the `.gitignore` additions from A0 — neither is compiled, linted or tested.

Machine: Windows 11, bun 1.3.14, node v24.18.0, vitest 4.1.9, vite 7.3.5.

**F5 must diff against this file.** A warning that appears here is pre-existing and is not attributable to the revision.

---

## Result summary

| Gate | Command | Result | Evidence |
|---|---|---|---|
| Install | `bun install --frozen-lockfile` | **pass** (726 packages, 74.5s) | — |
| Test | `bun run test` | **fail (pre-existing)** — 2 failed / 913 passed / 53 skipped tests, across 2 failed / 163 passed / 4 skipped files | [test.log](./baseline/test.log) |
| Lint | `bun run lint` | **pass**, zero output | [lint.log](./baseline/lint.log) |
| Types | `bunx tsc --noEmit` | **pass**, zero output | [tsc.log](./baseline/tsc.log) |
| Build | `bun run build` | **environment-gated — cannot run** | [build.log](./baseline/build.log) |
| Build (isolated) | `bunx vite build` | **pass**, built in 10.12s | [vite-build.log](./baseline/vite-build.log) |
| Whitespace | `git diff --check` | **pass**, clean | — |

---

## Pre-existing test failures

Per execution plan A2 Exit, these are recorded and **not fixed here**. Neither is caused by this branch.

### BF-1 — `src/lib/__tests__/agents-catalogue.test.ts` > "keeps the runs-table join key in one place"

**Deterministic.** Fails in isolation as well as in the full suite (re-run confirmed: 1 failed / 5 passed).

The test scans the source tree for hard-coded `agent_name` values and requires `agentNameFor(workflowType)` instead, so that the agent catalogue and the runs table cannot drift. It reports 11 offenders, **all of them in `src/lib/mock-data.ts`**:

> Quotation Agent x3, Approval Agent, Sales Reply Agent x2, Qualification Agent, Lead Intake Agent, Orchestrator Agent, Client Success Agent, Reporting Agent

Significance for this revision: `src/lib/mock-data.ts` is both the cause of the only genuine red gate **and** a candidate integrity finding (Instruction §16, "sample data"). A4 must determine every importer of that module. If the revision removes or rewires `mock-data.ts`, this gate may turn green as a side effect — that outcome must be reported as a side effect, not claimed as a fix of an unrelated bug.

### BF-2 — `src/routes/__tests__/-list-route-performance.test.tsx` > "'dashboard' loads through a crmQueryKeys-backed cache entry"

**Not deterministic — machine-speed flake.** Fails only under full-suite load with the default 5000 ms timeout on this machine.

Re-run evidence:

- Alone, default timeout, full file: **9 passed** in 2.85s.
- Alone, `--testTimeout=30000`: **9 passed**.

The suite's own timings show why: `transform 153.53s, import 294.06s, environment 198.75s` against `tests 65.43s` — this machine spends far more time transforming and importing than executing, so a 5s per-test budget is marginal under parallel load. No product defect is implied. F5 must not report this as a new failure if it recurs, and must not claim it as fixed if it happens to pass.

---

## Warnings (verbatim)

### W-1 — Route-discovery warning (3 occurrences, once per build environment)

```
Warning: Route file ".../src/routes/__tests__/route-query-keys.test.ts" does not export a Route. This file will not be included in the route tree.
  1. Rename the file to "...\src\routes\__tests__\-route-query-keys.test.ts" (prefix with "-")
```

This is the known cleanup item in Instruction §15 and plan step B9. **The repository's configured ignore convention is the `-` filename prefix** — every other file in `src/routes/__tests__/` already carries it (`-tasks.test.tsx`, `-admin-url-state.test.tsx`, and 11 others). `route-query-keys.test.ts` is the single file that does not. B9's fix is therefore the rename the plugin itself suggests, not a new `routeFileIgnorePattern`; B9 must then confirm vitest still discovers the renamed file and that the test count does not drop.

### W-2 — Chunk size warning

```
(!) Some chunks are larger than 500 kB after minification. Consider:
- Using dynamic import() to code-split the application
- Use build.rollupOptions.output.manualChunks to improve chunking
- Adjust chunk size limit for this warning via build.chunkSizeWarningLimit.
```

### W-3 — Unused re-export notices from TanStack (SSR build, dependency-internal)

```
"createRequestHandler", "defineHandlerCallback", "transformPipeableStreamWithRouter" and "transformReadableStreamWithRouter" are imported from external module "@tanstack/router-core/ssr/server" but never used in "node_modules/@tanstack/start-server-core/dist/esm/index.js".
"RawStream" is imported from external module "@tanstack/router-core" but never used in "node_modules/@tanstack/start-client-core/dist/esm/index.js".
"hydrate" and "json" are imported from external module "@tanstack/router-core/ssr/client" but never used in "node_modules/@tanstack/start-client-core/dist/esm/index.js".
```

Originates inside `node_modules`. Not actionable in this branch.

---

## Environment-gated / skipped

### G-1 — `bun run build` cannot run without `DATABASE_URL`

`bun run build` is not a pure build. It is:

```
bun run clientops:migrate-schema && bun run clientops:verify-schema && vite build && bun scripts/clientops/seed-on-deploy.ts
```

- `clientops:migrate-schema` **skips cleanly** without the variable: `{"ok": true, "skipped": true, "reason": "DATABASE_URL is not set"}`
- `clientops:verify-schema` **throws**: `DATABASE_URL is required for schema verification` -> exit 1, so `vite build` never runs.

No `.env` or `.env.local` exists in the checkout and `DATABASE_URL` is unset in the environment.

**Workaround used for evidence:** `bunx vite build` isolates the actual bundling step from the two DB-dependent pre-steps and the post-deploy seed. It exits 0 and produces the full asset table below. F4's bundle comparison is therefore valid; F5 must still report `bun run build` itself as environment-gated, never as passed.

### G-2 — 4 skipped test files / 53 skipped tests

Present at baseline. The exact suites and the variables they need are enumerated in A1 (Test layout) and carried into `validation-report.md`. Skipped is reported as skipped, never as passed (Instruction §18).

### G-3 — Runtime verification is unavailable in this environment

Without `DATABASE_URL` and the Neon Auth variables (`NEON_AUTH_URL`, `APP_BASE_URL`), the dev server cannot authenticate a session or load any workspace data. Consequences, all carried into `validation-report.md`:

- A2 "before" screenshots of the 31 authenticated routes: **not captured**.
- Per-route dev-server walkthroughs in the plan §6 route procedure step 10: **gated**.
- F1 responsive capture, F2 accessibility inspection, F3 console/network walkthrough: **gated** until either credentials or a working Vercel preview exists.

Required from a human to lift G-1 and G-3: `DATABASE_URL`, `NEON_AUTH_URL`, `APP_BASE_URL`. Variable names only — values must never be pasted into the repository or into chat.

---

## Build output size table (`bunx vite build`)

Client build: 426 modules transformed, 125 client assets.

| Chunk | Raw | gzip | Note |
|---|---|---|---|
| `assets/index-BrOEIxii.js` | 658.48 kB | 207.96 kB | **over 500 kB** — main client entry |
| `assets/login-auth-form-ECRDMK4L.js` | 614.48 kB | 174.53 kB | **over 500 kB** — auth form, already its own chunk |
| `assets/vendor-charts-DFR8qTfX.js` | 317.64 kB | 80.64 kB | recharts, already split out |
| `assets/styles-lPnz5-hG.css` | 160.91 kB | 25.93 kB | single stylesheet |
| `assets/index-mOCbbrqa.js` | 87.54 kB | 29.67 kB | |
| `assets/quotes._id-K9tUr2z5.js` | 34.41 kB | 9.79 kB | route chunk |
| `assets/admin.people-CBZU3Rcq.js` | 29.42 kB | 7.04 kB | route chunk |
| `assets/accounts._id-BmCg844g.js` | 22.27 kB | 6.48 kB | route chunk |
| `assets/select-CwD-RxCF.js` | 21.71 kB | 7.47 kB | shared primitive |
| `assets/quotes.new-B031SjFZ.js` | 17.97 kB | 5.14 kB | route chunk |

SSR build: 426 modules; largest are `assets/router-CA6zzbQK.js` 188.18 kB and `server.js` 97.50 kB.

**Two chunks exceed 500 kB at baseline.** Route-level code splitting is intact — every route emits its own small chunk — and charts are already isolated in `vendor-charts`. F4 compares against this table; the revision must not add a third oversized chunk without a documented reason.
