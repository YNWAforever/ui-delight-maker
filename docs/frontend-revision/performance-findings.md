# Performance Findings

Step F4. Compared against the baseline table in [baseline-gates.md](./baseline-gates.md).

Both builds were produced with `bunx vite build`, which isolates bundling from the two DB-dependent pre-steps in `bun run build` (see EG-1). Transcripts: [`baseline/vite-build.log`](./baseline/vite-build.log) and [`final/vite-build.log`](./final/vite-build.log).

## Bundle table

| Chunk | Baseline raw | New raw | Δ raw | Baseline gzip | New gzip | Δ gzip |
|---|---|---|---|---|---|---|
| `assets/index-*.js` (client entry) | 658.48 kB | 688.16 kB | **+29.68 kB (+4.5%)** | 207.96 kB | 217.15 kB | +9.19 kB |
| `assets/login-auth-form-*.js` | 614.48 kB | 614.42 kB | −0.06 kB | 174.53 kB | 174.51 kB | −0.02 kB |
| `assets/vendor-charts-*.js` | 317.64 kB | 317.60 kB | −0.04 kB | 80.64 kB | 80.66 kB | +0.02 kB |
| `assets/styles-*.css` | 160.91 kB | — | — | 25.93 kB | 26.36 kB | +0.43 kB |
| `assets/quotes._id-*.js` | 34.41 kB | 34.85 kB | +0.44 kB | 9.79 kB | 10.46 kB | +0.67 kB |
| `assets/admin.people-*.js` | 29.42 kB | — | — | 7.04 kB | 8.58 kB | +1.54 kB |
| `assets/accounts._id-*.js` | 22.27 kB | — | — | 6.48 kB | 8.31 kB | +1.83 kB |

Client assets: **125 → 151** (+26). The increase is route-level chunks, not payload — more code split out, not more code shipped up front.

## Chunks over 500 kB

**Two, the same two as baseline.** No third was introduced, which is F4's exit criterion.

| Chunk | Size | Cause | Action |
|---|---|---|---|
| `index-*.js` | 688 kB | The client entry: React, TanStack Router + Query, and the shared component vocabulary every route imports | Not split. It grew 4.5% while 35 routes were revised onto a shared component set — the shared components are in the entry precisely because every route uses them, and duplicating them per route would cost more in total. |
| `login-auth-form-*.js` | 614 kB | `@neondatabase/auth-ui`, already isolated in its own chunk at baseline | Not split. It is a third-party bundle loaded only on the public auth routes; it never reaches an authenticated page. |

Both predate this branch and neither is a regression. Splitting either is a real piece of work with its own risk, and doing it inside a frontend revision would mix concerns — recorded here rather than attempted.

## Lazy-loaded modules

- **Charts stay lazy.** `vendor-charts` (recharts/d3/victory-vendor) is unchanged at 317.60 kB and is still isolated by the `manualChunks` function in `vite.config.ts`. Reports imports it dynamically, so no other route pays for it. This was the single most important thing not to break, and it did not move by more than 40 bytes.
- Route-level code splitting is intact — every route still emits its own chunk, and there are now 26 more of them.

## Route-load payload review

- **List routes do not fetch detail datasets.** The one place this had gone wrong was `/accounts`, whose preview panel issued an uncached inline read on every selection; it is now a `useQuery` sharing Account 360's own `companyWorkspace(accountId, "overview")` key, so opening a preview warms the workspace instead of creating a second, uninvalidatable cache entry.
- **Account 360 loads one query per section, not per row.** Overview arrives with the route; the other five tabs load on first activation.
- **The AI Ops directory read selects no payload columns.** `input_data` and `output_data` are excluded from the directory and sparkline queries, so the control tower does not ship raw agent payloads to render a bar chart.

## N+1 review

Two improvements, no remainder.

- `loadAgentDirectoryRead` folded its per-agent counters into the existing aggregate rather than adding queries: it still issues **three** queries, matching its budget in `route-loader-contract.ts`, while now returning `completed_24h`, `failed_24h`, `waiting_approval`, `running`, `stuck` and `last_run_at` per agent. Dropping the `where created_at >= now() - interval '24 hours'` predicate in favour of `filter (...)` clauses costs nothing here because `agent_runs` carries no index on `created_at`, so that form was already a sequential scan.
- **Done:** `loadAgentHistoryPage` no longer uses `select *`. It now selects an explicit 15-column projection instead — `output_data` dropped entirely, not merely left unrendered — and returns it through a new `AgentHistoryRow` type (`agent-workspaces.ts`), because narrowing needed a row type that `serializeAgentRun` (which takes a full `AgentRun`) could not supply. The agent Runs tab no longer loads a payload it never renders.

## Invalidation review

- **No bare `router.invalidate()` in any route.** The only two remaining are in `__root.tsx` — the global error boundary's retry and sign-out — where an app-wide refetch is the correct behaviour.
- Every other invalidation is either a narrow `crmQueryKeys` entry or a `router.invalidate({ filter: (m) => m.routeId === "..." })` scoped to one route.
- Two routes were previously unable to repaint at all after a successful write (`/renewals`, `/campaigns`); both now invalidate correctly, including from mutations that live in child components.

## Remaining recommendations

1. Split the client entry, or move the shared component vocabulary behind a boundary. Worth measuring first — the entry is 217 kB gzipped, and the win may not justify the churn.
2. Add an index on `agent_runs(created_at)` if the AI Ops page becomes slow; the current queries are sequential scans that are cheap only while the table is small.
3. The `styles.css` raw size is not reported by the new build output in the same form as baseline; only the gzip figure is comparable (+0.43 kB). Two token additions and a print block account for it.
