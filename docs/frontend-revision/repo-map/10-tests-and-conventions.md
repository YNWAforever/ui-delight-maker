# A. Test layout

**Runner config** — `C:/Users/laich/Documents/FIMMICK ClientOps/ui-delight-maker/vitest.config.ts`:
```ts
test: { environment: "node", include: ["src/**/*.test.ts", "src/**/*.test.tsx", "scripts/**/*.test.ts"] }
resolve.alias: { "@": resolve(__dirname, "src") }
```
No `setupFiles`, no global setup, no coverage config. Default environment is `node`.

**Total: 169 test files** (138 `.test.ts` + 31 `.test.tsx`). Confirmed against `docs/frontend-revision/baseline/test.log`: `Test Files 2 failed | 163 passed | 4 skipped (169)`, `Tests 2 failed | 913 passed | 53 skipped (968)`.

**Every `__tests__` folder** (30 folders; count = test files in that folder):

| Folder | # | What it covers |
|---|---|---|
| `src/server/repositories/__tests__` | 30 | Raw-SQL repositories: accounts, account-contacts, account-timeline, admin-access/-invitations/-teams/-users, approvals, campaigns + campaign-follow-ups + campaign-pagination, client-import, deals, engagements-batch, event-import, job-sheets (+pagination), pagination + pagination-order, profiles, quotes (+pagination, quote-templates, quote-versions), relationship-signals, renewals-all-filter, supabase-writes, workspace-preferences, workspace-search |
| `src/lib/__tests__` | 27 | Pure lib modules: `format`, `money`, `query-keys`, `pipeline`, `risk-scoring`, `quote-utils`, `quote-to-cash`, `csv-import`, `n8n`, `serializable`, `sidebar-active`, `relative-time`, `business-date`, `approval-sla`, `lifecycle-utils.node`, `engagement-utils`, `retention-sweep-utils`, `sales-workspace`, `workspace-preferences`, `admin-ux-search`, `operational-invalidation`, plus repo-invariant scanners: `agents-catalogue`, `clientops-build-scripts`, `clientops-relationship-schema`, `clientops-seed`, `eslint-config`, `measure-supabase-surface` |
| `src/server-functions/__tests__` | 22 | The BFF boundary: capability + session enforcement, input validation, pagination contracts, and `authorization-contract.test.ts` / `crm-neon-port.test.ts` as cross-cutting gates |
| `src/routes/__tests__` | 14 | Route-level behaviour: `-tasks`, `-invite-activation`, `-admin-*` (route access, URL state, account-management flow), `-account-workspace-loading`, `-accounts-workspace-resilience`, `-job-sheets-source`, `-list-route-performance`, `-app-wide-performance-coverage`, `-root-shell-cache-security`, and `route-query-keys` |
| `src/server/db/__tests__` | 8 | `neon.server`, `postgres-error`, `query-builders`, schema contract + 3 DB-gated suites + `route-loader-completeness` |
| `src/components/admin/__tests__` | 8 | Admin UI: access-request-queue, admin-shell, invite-users-dialog, organization-directory, people-directory, permission-override-dialog, team-member-table, user-lifecycle-dialog |
| `src/server/read-models/__tests__` | 6 | Composed multi-table reads: accounts-index, client-workspace, dashboard, operations, quote-workspace, relationship-workspaces |
| `src/lib/relationship/__tests__` | 6 | account-prefilter, company-workspace, event-import, matching, signals, timeline |
| `src/server/workflows/__tests__` | 5 | `assert-workflow-token`, context builders (account/route/generic), writebacks |
| `src/server/company-workspace/__tests__` | 5 | errors, loaders, measurement, performance-contract, read-model |
| `src/lib/workflows/__tests__` | 4 | fallbacks, n8n-templates, payloads, qualification |
| `src/components/__tests__` | 4 | Shared components: app-sidebar, global-search, list-pagination, status-badge |
| `src/lib/performance/__tests__` | 3 | query-policy, route-performance, route-performance-review |
| `src/lib/auth/__tests__` | 3 | account-status, auth-routes, neon-auth |
| `src/hooks/__tests__` | 3 | `use-client-workspace-section`, `use-company-workspace-section`, `use-company-workspace-section-policy` (all `renderHook`) |
| `src/components/relationship/__tests__` | 3 | account-preview-panel, company-workspace-section-state, workspace-view-switcher |
| `src/server/auth/__tests__` | 2 | `authorization`, `resource-ownership.integration` |
| `src/server/admin/__tests__` | 2 | invitation-email, reassignment |
| `src/scripts/__tests__` | 2 | backfill-accounts, generate-relationship-signals |
| `src/components/auth/__tests__` | 2 | login-auth-page, neon-auth-provider |
| `src/server/app-shell/__tests__` | 1 | loaders |
| `src/server/__tests__` | 1 | vercel-build |
| `src/routes/api/workflows/__tests__` | 1 | `-token-gate` |
| `src/routes/api/auth/__tests__` | 1 | `-proxy` |
| `src/lib/company-workspace/__tests__` | 1 | invalidation |
| `src/lib/admin/__tests__` | 1 | policy |
| `src/components/quotes/__tests__` | 1 | quote-pdf-preview |
| `src/components/account/__tests__` | 1 | account-settings |
| `src/__tests__` | 1 | `router.test.ts` — asserts each `getRouter()` gets its own QueryClient, `defaultPreload: "intent"`, `defaultPreloadStaleTime === CRM_STALE_TIME_MS` |
| `scripts/clientops/__tests__` | 1 | `check-route-bundles.test.ts` (only folder outside `src/`; covered by the `scripts/**/*.test.ts` include) |

**Naming convention.** `__tests__/` folder adjacent to the source, files named `*.test.ts` / `*.test.tsx`. CLAUDE.md states this verbatim, and adds: Vitest runs in `node` by default, so component tests need `// @vitest-environment jsdom` at the top of the file. 26 files carry that pragma; the 5 `.tsx` files without it never touch the DOM (`-admin-people-url-state`, `-admin-team-url-state`, `-admin-account-management-flow`, `-account-workspace-loading`, `-list-route-performance` — they assert on `Route.options` and query keys only).

**The `-` prefix under `src/routes/`.** `src/routes/` is the TanStack Router `routesDirectory`, so the router plugin scans *every* file in it as a candidate route file. The plugin's `routeFileIgnorePrefix` is `"-"` (default, unset in `vite.config.ts`), so a leading `-` makes the plugin skip the file. Vitest's include globs (`src/**/*.test.ts(x)`) still match dash-prefixed names, so the prefix costs nothing in test discovery. 13 of the 14 files in `src/routes/__tests__/` carry it, as do `src/routes/api/auth/__tests__/-proxy.test.ts` and `src/routes/api/workflows/__tests__/-token-gate.test.ts`. `route-query-keys.test.ts` is the single exception — see section C.

# B. Environment-gated suites

**One variable gates everything: `DATABASE_TEST_URL`.** The mechanism is Vitest's `it.runIf(...)` — never `describe.skip`, `it.skip`, or `skipIf`. Each file computes `const hasDatabase = Boolean(process.env.DATABASE_TEST_URL);` and additionally early-returns from `beforeAll` when it is unset, so no `pg.Pool` is constructed.

Four files, all touching Postgres:

1. `src/server/db/__tests__/clientops-schema.integration.test.ts` — `it.runIf(Boolean(process.env.DATABASE_TEST_URL))("migrates an empty PostgreSQL database to a ready contract")`. Runs `runClientOpsMigrations` over `CLIENTOPS_MIGRATION_PATHS`, then asserts `verifyClientOpsDatabase(pool).ready === true`.
2. `src/server/db/__tests__/route-loader-contract.integration.test.ts` — one `it.runIf(hasDatabase)` per entry of `ROUTE_LOADER_CONTRACT`: each route's loader must execute against the migrated schema without a Postgres error (guards the 42703 / 42P18 outages named in its comments) and stay inside a query budget (`holder.count`).
3. `src/server/db/__tests__/route-loader-fixture.test.ts` — 3 `it.runIf(hasDatabase)` tests: ≥3 rows in every driving table (`accounts`, `clients`, `leads`, `quotes`, `engagements`, `tasks`), every `FIXTURE` id resolves to a real row, relationship index rows carry `relationship_health`. Note: filename has no `.integration.` marker but is gated identically.
4. `src/server/auth/__tests__/resource-ownership.integration.test.ts` — one `it.runIf(hasDatabase)` per `NEON_OWNED_RESOURCE_TYPES` entry plus one for a non-owned type; asserts `resolveOwnerProfileId` issues SQL the migrated schema accepts.

All four redirect the DB seam the same way: `vi.mock("@/server/db/neon.server", …)` re-implementing `query`/`queryOne`/`transaction` on top of a `pg.Pool` built from `DATABASE_TEST_URL`, so production code is untouched and the SQL text is identical.

**Where it is set:** `.github/workflows/database-contract.yml` runs a `pgvector/pgvector:pg17` service and sets `DATABASE_TEST_URL: postgres://clientops:clientops@localhost:5432/clientops_test`, then runs the *whole* suite (`bun run test`), not just the DB folder. `package.json` also exposes `test:database-contract` → `bunx vitest run src/server/db/__tests__/clientops-schema.integration.test.ts`.

Baseline (no `DATABASE_TEST_URL` locally): **4 skipped files / 53 skipped tests**, matching these four files exactly.

**Other env vars in tests are set, not gates** — `N8N_WORKFLOW_TOKEN`, `N8N_RELATIONSHIP_INTELLIGENCE_WEBHOOK_URL`, `DATABASE_URL`, `NEON_AUTH_URL` are assigned/deleted inside `beforeEach`/`afterEach` to drive behaviour; nothing skips on them. **Absent:** any `SUPABASE_URL` / `SUPABASE_ANON_KEY` test gate, any `describe.skipIf`, any `vi.stubEnv`.

Related but separate gate: `bun run build` itself is environment-gated on `DATABASE_URL` (`clientops:verify-schema` throws without it, so `vite build` never runs) — recorded in `docs/frontend-revision/baseline-gates.md` as G-1.

# C. `src/routes/__tests__/route-query-keys.test.ts`

File is 55 lines; imports `QueryClient` from `@tanstack/react-query` and `crmQueryKeys` from `@/lib/query-keys`. It does **not** render anything and has no jsdom pragma. Three tests inside `describe("crm query keys")`:

1. **"keeps detail and list entries separate"** — `setQueryData(crmQueryKeys.leads.detail("lead-1"), { id: "lead-1" })`, then asserts `getQueryData(crmQueryKeys.leads.list({}))` is `undefined` and the detail entry reads back equal. Proves detail and list namespaces do not collide.
2. **"keeps one record's sections separate from another's"** — writes `crmQueryKeys.clients.section("client-1", "quotes")`, then asserts `section("client-2","quotes")` and `section("client-1","job_sheets")` are both `undefined`, and `section("client-1","quotes")` reads back. Proves the section key discriminates on *both* record id and section name.
3. **"invalidates a whole domain without evicting another"** — seeds `leads.detail("lead-1")` and `quotes.detail("quote-1")`, awaits `invalidateQueries({ queryKey: crmQueryKeys.leads.all() })`, then asserts `getQueryState(leads.detail("lead-1")).isInvalidated === true` **and** `getQueryState(quotes.detail("quote-1")).isInvalidated === false`. Proves detail keys nest under the domain root so mutation-time domain invalidation reaches them, and does not leak across domains.

The file's own header comment is load-bearing context and should be preserved:
- It replaced grep-on-source assertions like `expect(source).toContain("crmQueryKeys.leads.detail")`. Those asserted a string was present; these assert the behaviour the string stood in for — a loader seeds the cache under a key and the component reads it back under the same key, so key-shape drift silently discards the loader's work and double-fetches every visit.
- **Deliberately absent** (do not "helpfully" add them): assertions that filter-key order and `undefined` filters produce a stable key. `normalizeQueryFilters` sorts and strips `undefined`, but react-query already hashes keys with `JSON.stringify` over sorted object keys, so removing the sort from `query-keys.ts` leaves such a test passing. The comment states the rule: "A test that cannot fail is worse than no test."

**Why the router plugin reports it as a route.** It sits inside `src/routes/`, which the TanStack Router plugin scans wholesale, and it is the only file in `src/routes/__tests__/` **without** the `-` prefix, so `routeFileIgnorePrefix: "-"` does not exclude it. Because it exports no `Route`, the plugin emits (verbatim, from `docs/frontend-revision/baseline/vite-build.log`, 3 occurrences — once per build environment):

```
Warning: Route file ".../src/routes/__tests__/route-query-keys.test.ts" does not export a Route. This file will not be included in the route tree.
  1. Rename the file to "...\src\routes\__tests__\-route-query-keys.test.ts" (prefix with "-")
  2. Use 'routeFileIgnorePattern' in your config to match this file
  routeFileIgnorePrefix: "-"
  routeFileIgnorePattern: undefined
```

It is warning-only: `src/routeTree.gen.ts` contains no `__tests__` entry. The repo's configured convention is the `-` prefix (13 sibling files already use it); the vitest include glob still matches a `-`-prefixed name, so renaming does not weaken discovery. This is tracked as Instruction §15 / plan step B9 in `docs/frontend-revision/`.

# D. Testing conventions

- **Library:** Vitest 4.1.9 + `@testing-library/react` ^16.3.2 + `@testing-library/user-event` ^14.6.1 + `jsdom` ^29.1.1. **Absent:** `@testing-library/jest-dom` — there is no `toBeInTheDocument` anywhere; DOM presence is asserted with `expect(screen.getByText(...)).toBeTruthy()`.
- **Custom render/wrapper: absent.** No `test-utils`, no `renderWithProviders`, no shared factory file anywhere in the repo. Every component test imports `render`, `screen`, `fireEvent`, `waitFor`, `cleanup`, `act` directly from `@testing-library/react`.
- **Cleanup:** each file declares its own `afterEach(cleanup)` (there is no global setup file to do it).
- **jsdom:** opted in per file with `// @vitest-environment jsdom` as the first line.
- **TanStack Query in tests:** provided inline, never via a helper. Component/route tests construct `new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })` and wrap in `<QueryClientProvider client={queryClient}>`; cache effects are asserted with `vi.spyOn(queryClient, "invalidateQueries")`. Hook tests use `renderHook` with a locally defined `wrapper` returning `<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>`.
- **TanStack Router in tests:** the router is **mocked, not instantiated**. `vi.mock("@tanstack/react-router", () => ({ createFileRoute: () => (options) => ({ options, fullPath: "/tasks", useLoaderData: vi.fn(), useSearch: () => ({...}) }), useNavigate: () => navigateMock }))`, then `import { Route } from "../tasks"` and render `Route.options.component as ComponentType`. Loader data is fed with `vi.mocked(Route.useLoaderData).mockReturnValue(...)`. Non-rendering route tests just import the real route module and assert on `Route.options.validateSearch` / `Route.options.loader`.
- **Server functions mocked, two layers:**
  - *Inside `src/server-functions/__tests__/`* (18 of 22 files): a `vi.hoisted` block builds a `createServerFnChain` stub — `{ validator() { return createServerFnChain }, handler(fn) { return fn } }` — and `vi.mock("@tanstack/react-start", () => ({ createServerFn: () => createServerFnChain }))`. The handler is therefore returned as a plain function and called directly. Auth/authz seams are mocked alongside: `vi.mock("@/server/auth/authorization.server", () => ({ requireCapability: requireCapabilityMock }))` and `vi.mock("@/lib/auth/neon-auth.server", () => ({ requireNeonAuthSession: requireNeonAuthSessionMock }))`, plus one `vi.mock` per repository module.
  - *In component/route tests* (19 occurrences): the whole module is stubbed — `vi.mock("@/server-functions/tasks", () => ({ getTasks: vi.fn(), createTask: createTaskMock, updateTask: updateTaskMock }))`.
- **Other standard stubs:** `vi.mock("sonner", () => ({ toast: { error, success, message } }))`; heavy shadcn primitives replaced with pass-through divs (`@/components/ui/select`, `@/components/ui/card`); `@/lib/format` and `@/lib/business-date` stubbed to freeze dates.
- **Mock handles** are always created via `vi.hoisted(() => vi.fn())` and reset in `beforeEach` with `.mockReset()`.
- **DB seam mocking** (integration files): `vi.mock("@/server/db/neon.server", …)` reimplementing `query`/`queryOne`/`transaction`/`getDatabaseUrl` over a real `pg.Pool`.

# E. Coding conventions to follow

**Feature components — per-domain folders under `src/components/`.** Domains present: `account/`, `admin/`, `auth/`, `dashboard/`, `job-sheets/`, `pipeline/`, `quotes/`, `relationship/`, `renewals/`, `reports/`, `sales/`. Cross-cutting shared components sit as flat files at `src/components/` root: `app-sidebar.tsx`, `empty-state.tsx`, `global-search.tsx`, `list-pagination.tsx`, `metric-card.tsx`, `notification-bell.tsx`, `page-header.tsx`, `status-badge.tsx`, `summary-row.tsx`, `theme-toggle.tsx`, `touchpoint-logger.tsx`. `src/components/ui/` is shadcn/ui — **do not hand-edit** (CLAUDE.md); add with `bunx shadcn@latest add <component>`. `components.json`: style `new-york`, baseColor `slate`, cssVariables true, icons `lucide`, css at `src/styles.css`.

**Barrels:** only one exists — `src/components/sales/index.ts` (`export { CommandHeader } from "./command-header"` etc.). Every other domain folder is imported by deep path. Do not add new barrels by default.

**Mutations — there is NO custom mutation hook, and `useMutation` is not used at all.** `grep -rn "useMutation" src` returns **0 matches** repo-wide. The actual pattern, e.g. `src/routes/tasks.tsx` and `src/routes/admin.access.tsx`:
1. plain `async function` in the component,
2. call the server function directly (`await updateTask({ data })` / `await decideAdminAccessRequestFn({ data: input })`),
3. optimistic path where relevant: `await queryClient.cancelQueries({ queryKey: crmQueryKeys.tasks.lists() })` → `queryClient.setQueriesData<Task[]>(...)` → rollback on throw,
4. `toast.success(...)` / `toast.error(...)`,
5. `await Promise.all(keys.map((queryKey) => queryClient.invalidateQueries({ queryKey, exact: true })))`.
In-flight de-duplication is hand-rolled (`pendingTaskIdsRef` Set in `tasks.tsx`).

`src/hooks/` contains **read** hooks only, all named `use-*.ts(x)`, all named exports: `use-client-now.ts`, `use-client-workspace-section.ts`, `use-company-workspace-section.ts`, `use-mobile.tsx`, `use-notifications.ts`, `use-quote-reference-data.ts`, `use-route-polling-refresh.ts`. `use-notifications.ts` is the closest thing to a mutation hook — it wraps `useQuery` plus imperative `markNotificationReadFn` callbacks with optimistic `markRead` and a `readMutationTokensRef` race guard.

Invalidation helpers that do exist: `src/lib/company-workspace/invalidation.ts` — `companyWorkspaceQueryKey`, `getCompanyWorkspaceMutationQueryKeys`, `invalidateCompanyWorkspaceMutation(queryClient, accountId, mutation)` (used by `src/routes/accounts.$id.tsx`). `src/lib/operational-invalidation.ts` exports `getOperationalMutationKeys` but has **zero production importers** — only its own test imports it.

**Toast: `sonner`.** `import { toast } from "sonner"` in 33 non-test files; called as `toast.success(...)`, `toast.error(...)`, `toast.message(...)`. `<Toaster richColors position="top-right" />` is mounted once in `src/routes/__root.tsx` (line 198) from `src/components/ui/sonner.tsx`.

**Dialog / sheet primitives in practice — two coexisting patterns, know which you are in:**
- Radix/shadcn `Dialog` (`@/components/ui/dialog`): `src/components/pipeline/won-conversion-dialog.tsx`, `src/components/relationship/workspace-view-switcher.tsx`, `src/components/touchpoint-logger.tsx`, and routes `approvals`, `campaigns`, `clients`, `clients.$id`, `leads`, `settings`, `tasks`.
- `AlertDialog`: `src/components/pipeline/stage-move-dialog.tsx`, `src/components/renewals/mark-renewed-ended-dialog.tsx`, `src/routes/approvals.tsx`, `src/routes/leads.tsx`.
- `Sheet` (side panels): `src/components/relationship/account-preview-panel.tsx`, `src/components/renewals/renewals-preview-panel.tsx`, `src/components/sales/context-panel.tsx`, `src/routes/quotes.$id.tsx`, and internally by `src/components/ui/sidebar.tsx`.
- **All five `src/components/admin/*-dialog.tsx` files are hand-rolled**, not Radix: `if (!open) return null` plus `<div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-4 md:items-center">` wrapping `<div role="dialog" aria-modal="true" aria-labelledby="...">`. (`invite-users-dialog`, `permission-override-dialog`, `user-lifecycle-dialog`, `user-role-dialog`, `organization-unit-dialog`.) Their tests query by `role`/`aria-label`, so replacing these with Radix will move focus/portal behaviour and must be verified against those tests.
- `Drawer` (vaul) and `Popover` are installed in `components/ui/` but have **zero** feature-code importers.

**File naming:** kebab-case for files (`invite-users-dialog.tsx`, `use-company-workspace-section.ts`); PascalCase for component identifiers; server-only modules end `.server.ts` (CLAUDE.md; ESLint blocks importing the `server-only` package instead). Route files use TanStack flat-dot naming (`admin.people.$id.tsx`, `quotes.$id_.pdf.tsx`).

**Export style: named exports only.** `grep -rn "^export default" src` (excluding `routeTree.gen.ts`) returns **0**. Routes export `export const Route = createFileRoute(...)({...})`; components export `export function Xxx(...)`.

**Forms — react-hook-form + zod is NOT the practice, despite the stack table.** `react-hook-form` is imported by exactly one file: `src/components/ui/form.tsx` (the unused shadcn primitive). `zodResolver` appears **nowhere** in `src`, and `@hookform/resolvers` has no importer. Real forms are plain controlled `useState` + a native `<form onSubmit>` handler, validating imperatively — e.g. `invite-users-dialog.tsx` uses local `useState` per field and calls `invitationInputSchema.parse({...})` from `src/lib/admin/schemas.ts`. Zod's live role is **route search-param validation**: `validateSearch: taskSearchSchema` with `z.enum([...]).default("all").catch("all")`, used in `src/routes/{tasks,leads,quotes,clients,campaigns,approvals,job-sheets,notifications,renewals,reports,quotes.new,agents.$name}.tsx` and `src/lib/admin/schemas.ts`.

**Query keys / loaders:** always `crmQueryKeys` from `src/lib/query-keys.ts` (`createRouteQueryKeys(route)` → `all()` / `lists()` / `list(filters)` / `detail(id)` / `section(id, section, filters?)`, filters passed through `normalizeQueryFilters`). Loaders call `context.queryClient.ensureQueryData(routeQueryOptions({ queryKey, queryFn }))`; `routeQueryOptions` (`src/lib/route-query.ts`) injects `staleTime: CRM_STALE_TIME_MS`. Components re-read the same key with `useQuery({ ...routeQueryOptions({...}), initialData: loaderData })`.

**ESLint (`eslint.config.js`)** — repo-specific rules: `no-restricted-imports` bans `server-only` with the message "TanStack Start does not use the Next.js `server-only` package. Rename the module to `*.server.ts` or mark it with `@tanstack/react-start/server-only`"; `react-refresh/only-export-components: ["warn", { allowConstantExport: true }]`; `@typescript-eslint/no-unused-vars: "off"`; ignores `dist/`, `.output/`, `.vinxi/`, `.tmp/`, `.worktrees/`. Prettier runs through `eslint-plugin-prettier/recommended`, so format violations are lint errors.

**Prettier (`.prettierrc`):** `printWidth: 100`, `semi: true`, `singleQuote: false`, `trailingComma: "all"`, `endOfLine: "auto"`.

**TS (`tsconfig.json`):** `strict: true`, `noFallthroughCasesInSwitch`, `noUncheckedSideEffectImports`, `noUnusedLocals: false`, `noUnusedParameters: false`, path alias `@/* → ./src/*`.

# F. Every rule stated in `CLAUDE.md` and `README.md`

## `CLAUDE.md`

*Stack (asserted facts to honour):* TypeScript 5.8 strict, **no `any`**; TanStack Start 1.x SSR + file-based Router; React 19 + shadcn/ui (Radix) + Tailwind 4; TanStack Query 5; **Neon Postgres with raw parameterized SQL, no ORM**; Neon Auth via `src/lib/auth/neon-auth.server.ts`; n8n webhooks → OpenRouter (`anthropic/claude-sonnet-4-6`); react-hook-form + zod 4 for forms/validation; Recharts; Vite 7 via `@lovable.dev/vite-tanstack-config` → Vercel; Bun.

*Build & run:* `bun install`, `bun run dev` (localhost:5173), `bun run test`, `bun run lint`, `bun run format`, `bunx tsc --noEmit`, `bun run build`. **Full verification gate before merging: `bun run test`, `bun run lint`, `bunx tsc --noEmit`, `bun run build`, `git diff --check`.**

*Request lifecycle (the layering rule):* `src/routes/*.tsx` (loader using `routeQueryOptions` + `crmQueryKeys`) → `src/server-functions/` `createServerFn` — **the BFF boundary**, running `requireCapability("…")` then `requireNeonAuthSession()` → `src/server/repositories/` (writes + single-entity reads) or `src/server/read-models/` (composed multi-table reads) → `src/server/db/neon.server.ts` (`query()`/`queryOne()`/`transaction()`) → Neon. n8n calls back through `src/routes/api/workflows/*`, each handler running `assertWorkflowToken(request)` then a writeback in `src/server/workflows/`.

*Conventions:*
1. Files kebab-case; components PascalCase. Server-only modules end `.server.ts` (no `server-only` package; ESLint blocks importing it).
2. Tests live in `__tests__/` next to source, named `*.test.ts(x)`. Vitest is `node` by default — component tests need `// @vitest-environment jsdom` at the top.
3. Query keys **always** via `crmQueryKeys` in `src/lib/query-keys.ts`; route loaders use `routeQueryOptions` so stale time stays consistent.
4. Dates **must** use `src/lib/format.ts` (fixed `en-GB` + UTC) to avoid SSR hydration mismatch.
5. Prettier 100 cols, double quotes, semicolons, trailing commas. Path alias `@/*` → `src/*`.
6. Commits: Conventional Commits, lowercase imperative (`feat:`, `fix:`, `perf:`, `test:`, `docs:`). Branches `codex/<slug>` (also `fix/<slug>`, `feat/<slug>`). **PRs land as merge commits, not squashes.**

*Hard constraints:*
7. **Do NOT add plugins to `vite.config.ts`** — `@lovable.dev/vite-tanstack-config` already bundles tanstackStart, viteReact, tailwindcss, tsConfigPaths; duplicating breaks the build.
8. **Do NOT edit `src/routeTree.gen.ts`** — generated by the router plugin.
9. **Do NOT hand-edit `src/components/ui/`** — install via `bunx shadcn@latest add <component>`.
10. **New DB work goes in `neon/migrations/`**; `supabase/migrations/` is frozen legacy.
11. `bunfig.toml` enforces a 24h `minimumReleaseAge` supply-chain guard — **confirm with the user before adding any package to `minimumReleaseAgeExcludes`** (currently only `@lovable.dev/vite-tanstack-config`).
12. **Never set `N8N_USER_INVITATION_WEBHOOK_URL` or `CLIENTOPS_BOOTSTRAP_SUPER_ADMIN_EMAIL`** without explicit operator approval (see README production gates).
13. Seed env vars (`CLIENTOPS_SEED_*`) **must never point at production**.

*Supabase → Neon migration state:* Neon is the target; Supabase runtime code is quarantined in `src/legacy-supabase/`. Still importing it (**do not add more**): `src/server/repositories/{automation-playbooks,customer-success,deals,engagement-events,projects}` (behind the repository seam, so `src/server-functions/` no longer touches Supabase), and `src/server/auth/resource-ownership.ts` — this one is on the **authorization** path, so `SUPABASE_URL` and `SUPABASE_ANON_KEY` are required at runtime; without them `createSupabaseServerClient()` throws and every guarded deal/project/contact/customer-success/automation route returns 500 from inside the capability check. Both are in `.env.example`.

*Trap:* `src/lib/mock-data.ts` (1689 lines) has zero importers but is **not** free-standing — `src/lib/__tests__/clientops-relationship-schema.test.ts` reads it off disk with `readFileSync` to assert the stale `role: "cs"` value never reappears. Deleting the file means dropping that assertion in the same change, or the test throws.

## `README.md`

1. **Local setup:** copy `.env.example` → `.env.local` and fill local Neon + Neon Auth values; `bun install`; `bun run dev`. `.env.local.example` holds the fuller local seed and workflow reference.
2. Invitation email delivery is **intentionally optional** — without `N8N_USER_INVITATION_WEBHOOK_URL` the Admin invitation flow returns a copyable activation link.
3. **Verification (PowerShell):** `bun run test`, `bun run lint`, `bunx tsc --noEmit`, `bun run build`, `git diff --check`. The build applies and verifies the ClientOps schema before producing the production bundle.
4. **Production gates:** configure `N8N_USER_INVITATION_WEBHOOK_URL` only after an operator explicitly approves the n8n workflow, recipient handling, and secret configuration. Set `CLIENTOPS_BOOTSTRAP_SUPER_ADMIN_EMAIL` only for the one-time guarded production bootstrap command, after explicit operator approval — **do not run the bootstrap command as part of a normal deploy**. Preview deployments must pass the test suite, lint, TypeScript check, build, schema verification, and browser checks before merging.
5. **Rollback:** to disable the Admin workspace, remove Admin navigation and revert the server-function authorization changes together with the migration-compatible application version. **Do not drop `admin_audit_logs`, access-request, membership, or other history tables during rollback** — preserve the schema so a later version can restore the workflow without losing actor references.