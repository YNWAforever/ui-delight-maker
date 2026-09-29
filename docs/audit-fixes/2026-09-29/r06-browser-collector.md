# R06 real-browser collector and runbook

Source commit: `2c14f0b50567910e6597d68e6b0a3621585bc5b9`; base main: `0eb6d936784a7227a55d66b1c7ee027925ab8fa5`. Implemented on 2026-09-30 HKT for the 2026-09-29 backlog. R06 application acceptance remains blocked until the isolated environment and authenticated sessions are supplied.

## Implemented behavior

`bun run performance:browser:verify` uses pinned Playwright 1.63.0 and Node 24 to run ten Chromium navigations in fresh contexts, then one discarded warm-up and thirty navigations in one primed context at 1440x900. It measures elapsed time to the supplied visible readiness selector and separately records capture duration through network idle. It retains every raw sample and computes p50/p95 from those observations.

For every document/fetch/XHR response it counts decoded body bytes and requires the existing request-scoped count, duration and failed-query headers. Response bodies, cookies, headers, session state and query values are not written to the report. The route query is represented by a SHA-256 scope hash. Actual script resource timing includes lazy imports: encoded body bytes and transferred bytes are separate from the existing static-manifest gzip report. No LCP or INP result is claimed.

A local proxy allows only GET/HEAD to the configured loopback HTTP origin. It rejects other origins, writes, HTTPS tunnels and WebSockets, including worker requests. Browser cache remains enabled; service workers are blocked. The proxy and browser overhead are included in the observations and must be identical in both baseline and candidate runs. Routes requiring blocked traffic cannot pass this harness. Failed or blocked warm-up requests cannot be discarded into a passing result.

The runner checks `/api/build` against the full candidate SHA before and after capture. Dataset counts are queried inside a read-only PostgreSQL transaction, with the actual database name checked against the URL. Only loopback databases named `clientops_perf_*` or the existing `clientops_t19_*` are accepted. The runner does not migrate, seed, create sessions, or invoke application writes.

## Verification performed

- Evidence verifier regressions: six required-failure assertions first failed, then passed; an additional non-finite coverage regression also failed then passed. Eight verifier tests pass.
- Existing HTTP and manifest regressions remain intact: 19 focused tests total pass. HTTP no-cache and synthetic evidence still cannot satisfy the browser gate.
- Real Chromium integration on a disposable local HTTP fixture passes: independent cold cookie state, retained warm cache, both bootstrap and lazy JS, document plus data metrics, missing metrics, and zero arrivals at local POST/provider/worker/WebSocket receivers. Worker/WebSocket bypass and discarded warm-up failures were reproduced before correction.
- App and strict script TypeScript, full ESLint (one pre-existing Fast Refresh warning), final touched-file ESLint, pure Vite client/SSR build, bundle gate and diff check pass.
- Missing input returns `blocked_external` and process exit 2. The integration fixture is not ClientOps application performance or role UAT.
- GitHub Actions now has a separate `Browser collector integration` job using Node 24 and the pinned Chromium installation. Real isolated PostgreSQL contract/replay and final preview checks are pending at this local evidence checkpoint.

Node 24 is deliberate: Bun 1.3.14 on this Windows host timed out starting Chromium's debug pipe, whereas Node 24.18.0 launched and closed Chromium successfully. Bun remains the repository package manager.

## Inputs and their sources

Store private state under ignored `.clientops-perf/`. Supply secrets through the local process environment; do not copy them into reports, commands in tickets, or committed files.

| Variable | Required source |
| --- | --- |
| `CLIENTOPS_PERF_ISOLATED=1` | Operator confirms the local app, database, auth session and fixtures are disposable and isolated. This flag alone is not isolation evidence. |
| `CLIENTOPS_PERF_BASE_URL` | Built application on loopback HTTP; use production-mode local output, not a dev server requiring HMR WebSockets. |
| `CLIENTOPS_PERF_ROUTE` | The authorized route and intended filter scope. |
| `CLIENTOPS_PERF_STORAGE_STATE` | Local path to actual Playwright storage state from the isolated actor's login. No fabricated session or shared super-admin substitution. |
| `CLIENTOPS_PERF_ROLE` | Independently verified role of that session. The collector records this label; it does not certify role authorization. |
| `CLIENTOPS_PERF_READY_SELECTOR` | Route-specific visible loaded-content selector, agreed before both runs. A heading or spinner that appears before data readiness is insufficient. |
| `CLIENTOPS_PERF_EXPECTED_SHA` | Full SHA of the app under test; its local `/api/build` must return it. The existing app metadata reads `GITHUB_SHA` or `VERCEL_GIT_COMMIT_SHA`. |
| `CLIENTOPS_PERF_TOKEN` | Same private diagnostic token configured on the isolated app server. |
| `DATABASE_TEST_URL` | Confirmed disposable loopback PostgreSQL containing at least 10,000 tasks and 100,000 approvals, and matching the app's database binding. No production tunnel. |

The collector validates target syntax, database name, counts and runtime SHA. It cannot independently prove the app server's database binding, the session's role, or that two databases contain identical records. Preserve those R00/environment, role and snapshot proofs alongside the report.

## Execution and before/after comparison

1. Keep this collector version, Node/Chromium versions, machine, viewport, local proxy, role, permission overrides, route scope and readiness selector fixed. Run the baseline and candidate applications from separate known source checkouts with the same disposable dataset snapshot/schema. Keep the snapshot identity and app/database-binding evidence.
2. Install the locked dependencies and Chromium (`bun install --frozen-lockfile`, `bunx playwright install chromium`; CI also uses `--with-deps`). Run `bun run typecheck:runtime` and `bun run test:browser-collector`.
3. Start the built app with the confirmed isolated environment and expected build SHA. Provide the actual isolated actor storage state and all inputs above. Run `bun run performance:browser:verify > .clientops-perf/baseline.json`, then repeat for the candidate with its SHA and output path. Do not run either against production.
4. Preserve all samples. Exit 0 means this route's measured budgets and evidence contract passed; exit 1 means a reported metric/evidence condition failed; exit 2 means capture was blocked or incomplete. Missing metrics, redirects, blocked traffic or invalid samples cannot be turned into a performance pass. Compare only complete observations from the same environment, and distinguish threshold failures from incomplete capture.
5. Compare actual readiness p50/p95, SQL metrics, document/data payload and cold interactive JS. Keep static gzip graphs separate. Review any change in filter scope, dataset, browser or readiness selector before interpreting a difference. A successful route measurement does not close seven-role UAT, legacy/provider/reconciliation, PITR or production release gates.

## Remaining acceptance

Actual authenticated ClientOps before/after, independent same-data and database-binding evidence, seven-role sessions and the wider R00-R08 gates remain unavailable. No ClientOps runtime numbers were produced by the fixture, no production data was queried or changed, and release remains NO-GO.

References used for the harness: [Playwright isolated browser contexts](https://playwright.dev/docs/api/class-browsercontext) and [Chromium proxy loopback rules](https://chromium.googlesource.com/chromium/src/+/main/net/docs/proxy.md#Overriding-the-implicit-bypass-rules).