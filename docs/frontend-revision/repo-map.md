# Repository Map

Produced in step A1. **Every later step reads this before editing.** Per plan §0.1 the repository is the authority: where this map and the execution plan disagree, this map wins and the disagreement is logged in [PROGRESS.md](./PROGRESS.md) under "Plan corrections".

## How this was produced, and how far to trust it

Ten parallel readers covered config, routes, shell, libraries, server functions, read models, tokens and tests; an eleventh re-verified their load-bearing claims against the files. Their full reports are kept as appendices in [`repo-map/`](./repo-map/) — they are the exhaustive catalogues (184 server functions, every token, every route's query keys) that this summary would otherwise have to repeat.

Everything in the **Verified facts** section below was re-checked directly by hand after the readers finished, with the command shown. Treat the appendices as well-researched but secondary; treat this file as checked.

---

## Verified facts

These eight findings change the plan. Each was confirmed by a command run against the working tree.

### VF-1 — There are 35 authenticated routes, not 31

`createFileRoute` registrations outside `__tests__`: **49 total = 10 API + 4 public + 35 authenticated.**

The plan's route table (§3) lists 31. The four it omits are all real authenticated routes:

| Route | File | Why it was missed |
|---|---|---|
| `/account` | `account.tsx` | Not in the sidebar. Only inbound path is the post-invite redirect in `invite.$token.complete.tsx`. |
| `/notifications` | `notifications.tsx` | Not in the sidebar. Reached from `notification-bell.tsx`. |
| `/clients/import` | `clients.import.tsx` | Not in the sidebar. Linked from `clients.tsx`. |
| `/admin/` | `admin.index.tsx` | A **separate registration** from the `/admin` layout in `admin.tsx`. The plan's row 25 collapses the two. |

Also: the registered id is **`/quotes/$id_/pdf`**, not `/quotes/$id/pdf`. The `_` suffix opts the route out of the `/quotes/$id` layout — it is meaningful, not a typo.

Consequences: the parity map needs 35 rows; the F1 screenshot matrix is 35 × 4 widths, not 31 × 4; the plan's counts at §1.1, §3 and §11.10 are all off by four.

### VF-2 — `useMutation` is not used anywhere in this repository

```
grep -rn "useMutation"      src --include=*.ts --include=*.tsx | wc -l   ->  0
grep -rn "useSuspenseQuery" src --include=*.ts --include=*.tsx | wc -l   ->  0
```

Every write in the app is an imperative `await someServerFn({ data })` inside an async handler, followed by hand-written invalidation. There is no mutation-hook layer at all.

This is the single most consequential correction for Phases C–E. The plan's §6 step 4 and §2.3 assume `useMutation` semantics — `isPending` for disabling controls, optimistic updates with rollback, `onError` feedback. **None of that machinery exists.** Adopting `useMutation` across 35 routes would be a rewrite far beyond a frontend revision and would touch every write path in the product.

Decision to record in A6 and A7: keep the repository's imperative pattern and give it the guarantees the Instruction actually requires (§12.3: in-progress state, success feedback, failure feedback, correct invalidation, no duplicate submission) through a small shared helper that wraps the existing `await serverFn(...)` shape — rather than importing a different state-management idiom. Optimistic updates stay out of scope except where a rollback path already exists, because §2.3 permits them only with tested rollback and there is nothing to build on.

### VF-3 — Whether `invalidateQueries` can refresh a route depends on the component, not the loader

> **This entry was corrected during A4.** My first version claimed the discriminator was `ensureQueryData` vs. a direct loader call, and named nine routes. That was wrong, and the adversarial crosscheck caught it. The corrected analysis below is what later steps must use.

A TanStack Router loader is **not** a React Query observer. `invalidateQueries` repaints a page only if the **component** subscribes to the invalidated key with `useQuery`. How the loader fetched the data is irrelevant: a route can put data in the cache via `ensureQueryData` and still be unrefreshable, and a route can bypass the cache in its loader and still refresh fine because the component re-reads through `useQuery` with `initialData`.

Classifying all 35 authenticated routes by how the component actually reads:

| Class | Count | Routes | Can `invalidateQueries` repaint? |
|---|---|---|---|
| Subscribes via `useQuery` | 23 | incl. `accounts.$id`, `clients.$id`, `leads.$id`, `quotes.$id`, `job-sheets.$id`, `campaigns.$id`, `relationships`, all 8 `admin.*`, `agents`, `agents.$name`, `ai-review`, `approvals`, `reports`, `settings`, `tasks`, `account` | **yes** |
| `useLoaderData` only, but calls `useRouter` | 4 | `index`, `leads`, `accounts`, `clients` | no — and they correctly use scoped `router.invalidate({filter})` |
| **`useLoaderData` only, no `useRouter`** | 6 | **`campaigns`, `job-sheets`, `quotes`, `renewals`**, plus `quotes.new` and `quotes.$id_/pdf` | **no — and they have no working alternative** |
| No data hook | 3 | `admin` (layout), `clients.import`, `notifications` | n/a |

The six in the third class are the real hazard. Two of them are actively broken today:

- **`/renewals`** — loads through `ensureQueryData`, renders `Route.useLoaderData()` at line 92, and the file contains neither `useQuery` nor `useRouter`. Its child components (`renewals-preview-panel`, `mark-renewed-ended-dialog`, `touchpoint-logger`) refresh through `invalidateQueries` alone, so **the board cannot repaint** after a renewal, an ending, a risk-score run or a touchpoint.
- **`/campaigns`** — same shape, and `createCampaign` invalidates nothing at all. Because `ensureQueryData` serves the cached page for `CRM_STALE_TIME_MS` (30 s), a newly created campaign can be missing from the index for up to 30 seconds.

`quotes.new` and `quotes.$id_/pdf` are benign: the first navigates away after its write, the second is read-only.

**The rule to encode in the shared invalidation helper:**

- Component subscribes with `useQuery` → invalidate the narrowest `crmQueryKeys` entries.
- Component reads `useLoaderData` only → `router.invalidate({ filter: (match) => match.routeId === "<id>" })`, scoped, never bare.
- A mutation that affects both kinds of surface → do both.

The plan's §2.3 rule ("never call `router.invalidate()` for a small mutation") is therefore too absolute: for the third class it is the *only* mechanism that works. The repo already uses the scoped form correctly in `index`, `leads`, `accounts` and `clients`. Only `use-route-polling-refresh.ts` and `__root.tsx` call bare `router.invalidate()`.

One further trap, specific to `crmQueryKeys`: the filterless `section(id, section)` key is a strict **prefix** of the filtered form, so invalidating it does match an active paged section query. Several existing call sites rely on this, and it is correct — but it means an "exact: true" invalidation of the filterless key would silently miss.

### VF-4 — Two competing page-header components already exist, with a clean split and zero overlap

| Component | File | Routes |
|---|---|---|
| `PageHeader` | `src/components/page-header.tsx` | 15: `accounts`, `accounts.$id`, `agents`, `agents.$name`, `campaigns`, `campaigns.$id`, `clients.$id`, `clients.import`, `leads.$id`, `notifications`, `quotes.$id`, `quotes.new`, `relationships`, `reports`, `settings` |
| `CommandHeader` | `src/components/sales/command-header.tsx` | 10: `ai-review`, `approvals`, `clients`, `index`, `job-sheets`, `job-sheets.$id`, `leads`, `quotes`, `renewals`, `tasks` |
| neither | — | 10: `account`, the 8 `admin.*` routes, `quotes.$id_.pdf` |

`comm -12` of the two sets is empty — no route uses both. This *is* the inconsistency Instruction §3.6 describes, and it is why the product "feels like unrelated templates".

B3 therefore **converges these two into one** rather than adding a third. `CommandHeader` is the closer ancestor of the Instruction's §8.3 contract and already lives in the shared barrel.

### VF-5 — Shared feature components belong in `src/components/sales/`, not a new `workspace/` folder

`src/components/workspace/` does not exist. `src/components/sales/index.ts` is the **only barrel** under `src/components/`, and it already exports the shared workspace vocabulary consumed by 10 routes:

```ts
export { CommandHeader } from "./command-header";
export { SalesContextPanel } from "./context-panel";
export { MetricStrip, type SalesMetric } from "./metric-strip";
export { WorkSurfaceEmpty } from "./work-surface-empty";
```

The rest of the tree is domain-foldered (`account/ admin/ auth/ dashboard/ job-sheets/ pipeline/ quotes/ relationship/ renewals/ reports/ sales/ ui/`) with cross-cutting components loose at the root.

Creating `workspace/` would add a fourth convention next to three existing ones. The plan's §5 explicitly allows adapting: "adapt names and props to the conventions recorded in `repo-map.md`". **Decision: extend `src/components/sales/` and its barrel.** The folder name is historical and slightly narrow, but renaming it would touch 10 routes for no functional gain and is out of scope; A6 records the naming caveat.

### VF-6 — `MetricStrip` already exists

`src/components/sales/metric-strip.tsx`, exported from the barrel as `MetricStrip` with a `SalesMetric` type, already in use. Plan step B4 is **extend**, not create. Its current shape must be reconciled with the Instruction's four-primary-metric cap and `tabular-nums` requirement rather than replaced.

### VF-7 — The Supabase surface cannot be reduced to zero

240 matches across 20 files in `src`. Six **non-test** modules import `@/legacy-supabase/server`:

```
src/server/auth/resource-ownership.ts          <- authorization hot path
src/server/repositories/automation-playbooks.ts
src/server/repositories/customer-success.ts
src/server/repositories/deals.ts
src/server/repositories/engagement-events.ts
src/server/repositories/projects.ts
```

`resource-ownership.ts` defines a set of resource types whose ownership is resolved against the Supabase database because the two systems carry incompatible ids. Removing it would change authorization outcomes — which plan §0.4 forbids outright.

`src/legacy-supabase/README.md` states the exit criteria (port the remaining server functions to Neon, remove route-level imports, then drop the packages); none are met. A dedicated test, `src/lib/__tests__/measure-supabase-surface.test.ts`, exists specifically to stop a sampled "0 rows" reading from licensing deletion.

The repository's own `CLAUDE.md` independently confirms all of this and adds a runtime consequence that matters for any environment running this branch:

> `SUPABASE_URL` and `SUPABASE_ANON_KEY` are **required at runtime**. Without them `createSupabaseServerClient()` throws, and every guarded deal / project / contact / customer-success / automation route answers **500 from inside the capability check** rather than degrading gracefully.

So a preview deployment missing those two variables will not merely hide Supabase-backed data — it will hard-fail those routes during authorization. F6 must check for this explicitly before reporting a preview as healthy, and any 500 seen there must be attributed correctly rather than blamed on the revision.

The plan's F3 gate `rg -n "supabase" src` **must be zero** is therefore unachievable and must be restated. The achievable and meaningful gate is: **no new Supabase import, and no Supabase import reachable from a route component** — which matches Instruction §4.3's actual wording ("Do not add new Supabase imports"). F3 uses that instead. Two matches are pure comments and are safe to tidy in passing.

### VF-8 — `crmQueryKeys` is a clean, complete factory; inline keys are already near-zero

`src/lib/query-keys.ts` is 71 lines: a `normalizeQueryFilters` serializer (recursive, sorts object keys, drops `undefined` — so filter objects produce stable keys) and a `createRouteQueryKeys(route)` factory giving `all / lists / list(filters) / detail(id) / section(id, section, filters?)` for 23 domains, plus `shell()`, `dashboard()`, and a differently-shaped `companyWorkspace`.

`grep queryKey:\s*\[` outside `query-keys.ts` matches **only a test file**. The repository already enforces the plan's §2.3 rule. This is a strength to preserve, not a defect to fix.

Note `companyWorkspace` does **not** follow the factory shape — its `detail` is `["company-workspace", accountId]` (no `"detail"` segment) and its `section` takes no filters. Any invalidation helper must special-case it.

---

## Scripts and gates

Full table in [`repo-map/01-config-and-gates.md`](./repo-map/01-config-and-gates.md). What matters here:

| Script | Needs DB? | Note |
|---|---|---|
| `dev` | at request time | Vite dev server, forced to `host "::"`, `port 8080` by the Lovable config wrapper |
| `build` | **yes, hard** | `migrate-schema && verify-schema && vite build && seed-on-deploy`; `verify-schema` throws without `DATABASE_URL` |
| `lint` / `typecheck` / `test` | no | |
| `test:database-contract` | skips cleanly | gated on `DATABASE_TEST_URL` |
| `performance:bundles` | no | reads the Vite manifest; requires a prior build |

See [baseline-gates.md](./baseline-gates.md) G-1 for how the build gate was worked around for evidence.

**`vite.config.ts` does not import the router plugin directly.** It uses `defineConfig` from `@lovable.dev/vite-tanstack-config`, which composes `tailwindcss`, `tsConfigPaths`, `tanstackStart`, `viteReact` and dev-only tooling internally. Plan §0.4's "never add a duplicate plugin" is therefore a live risk: adding any of those plugins by hand would duplicate one the wrapper already injects. The repository's own additions are limited to `build.manifest`, a `manualChunks` function isolating `vendor-charts` (recharts/d3/victory-vendor), `onlyExplicitManualChunks`, `nitro: false` and the Vercel preset.

This also settles B9: the router plugin's own warning names the fix, and the repository already follows that convention — every other file in `src/routes/__tests__/` carries the `-` prefix. B9 is a rename.

## Router configuration and route inventory

- `routeQueryOptions` (`src/lib/route-query.ts`, 17 lines) is a thin `queryOptions` wrapper whose only job is defaulting `staleTime` to `CRM_STALE_TIME_MS`. It carries no other policy.
- Only two `beforeLoad` guards exist: `__root.tsx` and `admin.tsx`.
- Two authenticated routes have no loader: `admin.tsx` (uses `beforeLoad`) and `clients.import.tsx` (has neither).
- `relationships.tsx` does not import `routeQueryOptions` at all; it hand-writes `useQuery` with a duplicated `staleTime: 30_000` literal instead of the `CRM_STALE_TIME_MS` constant.
- `index.tsx` declares `loaderDeps: ({ search }) => ({ search })` but its `loader` ignores the deps — a cache-key bug, since the loader will not re-run when search changes.
- `index.tsx` imports `LeadPreviewPanel` and `PipelineBoard` but renders neither. `__root.tsx` imports `redirect` unused.

Two in-repo route registries already exist and should be updated alongside any route work, because tests enforce them:

- `src/lib/performance/route-performance.ts` — `APP_ROUTE_FAMILIES`, 34 authenticated paths in 18 families.
- `src/server/db/route-loader-contract.ts` — `ROUTE_LOADER_CONTRACT` (34 entries) plus `ACKNOWLEDGED_UNCOVERED_ROUTES`, enforced by `route-loader-completeness.test.ts`.

Neither agrees exactly with the other or with VF-1; both spell the PDF route `/quotes/$id/pdf` rather than the registered `/quotes/$id_/pdf`. A3 reconciles all three.

Per-route detail — loader, query keys verbatim, server functions, invalidation calls, and controls that reach no server function — is in
[`repo-map/02-routes-commercial.md`](./repo-map/02-routes-commercial.md),
[`repo-map/03-routes-relationship.md`](./repo-map/03-routes-relationship.md),
[`repo-map/04-routes-ai-admin.md`](./repo-map/04-routes-ai-admin.md).

## Shell components

Full detail in [`repo-map/05-shell.md`](./repo-map/05-shell.md).

Current sidebar groups, verbatim from `src/components/app-sidebar.tsx`:

| Group | Items |
|---|---|
| Today | Revenue Desk `/` |
| Acquire | Leads, AI Review |
| Convert | Quotes, **Job Sheets**, Approvals, **Campaigns** |
| Retain & Grow | Accounts, Active Clients, Relationships, Renewals, Tasks |
| Operate | **Agents**, Reports, Settings |
| Administration | capability-gated, with first-destination resolution |

Gap against Instruction §6.1, and therefore B1's exact work:

- **Campaigns** moves Convert → Acquire.
- **Job Sheets** moves Convert → a new **Deliver** group.
- **Agents** is relabelled **AI Ops** (§21 forbids "Agent Monitor"; "Agents" is also not the target label).
- Four authenticated routes have no nav entry by design and stay that way: `/account`, `/notifications`, `/clients/import`, `/quotes/new`. Each has a real inbound path; §4.3 requires a working page and data source before adding navigation, and none of these belongs in a lifecycle group.

`isSidebarItemActive` (`src/lib/sidebar-active.ts`, 23 lines) already implements the prefix rule the plan asks for, including the exact-match exception for `/`. B1 keeps it.

`Sidebar` is `collapsible="icon"` and `SidebarMenuButton` already receives `tooltip={item.title}`, so collapsed-mode accessible names are already handled.

## Libraries

Full detail in [`repo-map/06-libraries.md`](./repo-map/06-libraries.md).

| Concern | Status | Plan step affected |
|---|---|---|
| `crmQueryKeys` | complete and enforced (VF-8) | §2.3 — already satisfied |
| `routeQueryOptions` | exists, staleTime only | — |
| `src/lib/format.ts` | exists, SSR-safe formatters | §2.4 — use it |
| `src/lib/status-labels.ts` | **absent** | B7 — create, but must feed `StatusBadge` |
| `src/lib/errors.ts` | **absent** | B5 — create |
| `src/lib/csv.ts` | **absent** | E4 — create |
| invalidation helper | **two partial ones exist** | §2.3 — consolidate, don't add a third |

**Status labels.** No central label map exists, but a central *style* map does: `src/components/status-badge.tsx` holds `STATUS_STYLES` with 30 keys across 6 domains and derives its label by `replace(/_/g, " ")` plus CSS `capitalize`. That same fallback is duplicated at ~29 sites in 20 files, including server repositories. B7 must make `status-labels.ts` the source that `StatusBadge` consumes, or the two will drift.

**Errors.** No sanitizer at any layer. `error-capture.ts` (a global error recorder) and `error-page.ts` (a static 500 page) are not substitutes. `src/server/db/postgres-error.ts` classifies driver failures server-side but nothing consumes it for UI messaging. Raw `error.message` reaches users at 22 call sites, including two rendered directly into the page body (`leads.$id.tsx`, and the root `errorComponent` in `__root.tsx`). B5's `toSafeErrorMessage` is genuinely needed.

**Invalidation.** Two partial helpers exist and together cover six mutations:

- `src/lib/operational-invalidation.ts` — `getOperationalMutationKeys(mutation)` for `task-status`, `approval-decision`, `notification-read`, `agent-run`. Returns key arrays; never calls `queryClient`.
- `src/lib/company-workspace/invalidation.ts` — the fuller pattern, including a real executor that awaits `invalidateQueries({ queryKey, exact: true, refetchType: "active" })`, covering two mutations.

Every other write hand-rolls invalidation inline. The plan's proposed `src/lib/invalidate.ts` would be a third convention. **Decision: extend these two into one module**, and make it handle VF-3's router-invalidate case, which neither currently does.

**CSV.** Two independent CSV *parsers* already exist and disagree (`csv-import.ts` and `relationship/event-import.ts`). There is no serializer anywhere. The one control labelled "export", in `admin.audit.tsx`, emits **JSON**, not CSV. E4's `csv.ts` is genuinely new for export and should absorb the parsers rather than become a third.

**`src/lib/mock-data.ts` has no production importer** — 1689 lines of dead fixture code, referenced only from a comment in `src/lib/types.ts` and from two test files. It is relevant to A4 as cleanup, not as a live "sample data" defect. See [baseline-gates.md](./baseline-gates.md) BF-1 for why it nonetheless reddens the local test run.

**It is not free-standing, though.** `src/lib/__tests__/clientops-relationship-schema.test.ts` reads the file off disk with `readFileSync` to assert that the stale `role: "cs"` value never reappears. Deleting `mock-data.ts` means dropping that assertion in the same change, or the test throws. The repository's `CLAUDE.md` calls this out explicitly. A4 records the coupling; removal is a deliberate two-part change, not a tidy-up.

## Server function catalogue

184 exported server functions across 40 files, all via `createServerFn`. Full table — name, method, validator, capability check, return shape, repository call — in [`repo-map/07-server-functions.md`](./repo-map/07-server-functions.md).

## Read models and repositories

Full detail in [`repo-map/08-read-models-and-repos.md`](./repo-map/08-read-models-and-repos.md), including the company-workspace section-loading contract, pagination, N+1 risks, and the `quotes.account_id` question that governs D2 and C4.

### Runtime environment gates that silently degrade

Seven server-side gates change product behaviour when unset, and the UI mostly does not say so:

| Variable | Gates | Behaviour when unset |
|---|---|---|
| `N8N_WORKFLOW_TOKEN` | every n8n trigger and all 9 inbound `/api/workflows/*` routes | — |
| `N8N_QUALIFY_LEAD_WEBHOOK_URL` | lead qualification | returns `{ triggered: false, reason: "missing_webhook" }` |
| `N8N_DRAFT_REPLY_WEBHOOK_URL` | draft reply | same sentinel |
| `N8N_DRAFT_QUOTE_WEBHOOK_URL` | draft quote | same sentinel |
| `N8N_RELATIONSHIP_INTELLIGENCE_WEBHOOK_URL` | relationship intelligence | same sentinel |
| `N8N_SCORE_RENEWAL_RISK_WEBHOOK_URL` | renewal risk scoring | same sentinel |
| `N8N_USER_INVITATION_WEBHOOK_URL` | invitation email | same sentinel |
| `OPENROUTER_API_KEY` / `OPENROUTER_MODEL` | AI note tidy | **throws**; the only gate exposed to the client, via `isAiNoteTidyAvailable()` |

**This is an integrity finding, not just configuration.** The `missing_webhook` sentinel is handled at five call sites but **ignored at two**: `accounts.$id.tsx` and `leads.$id.tsx` do not branch on it, so when the webhook is unset those pages report success for an AI action that never ran. That is precisely Instruction §3.4 — success feedback for something that did not happen. A4 records it; C3 and D2 fix it.

## Design tokens and breakpoints

Full token table in [`repo-map/09-design-tokens.md`](./repo-map/09-design-tokens.md).

`src/styles.css` is 179 lines with an explicit cascade-layer order (`theme, base, neon-auth, components, utilities`): 39 `:root` custom properties and 38 `.dark` overrides. **Dark mode exists and is nearly complete** — `--radius` is light-only (correctly, it is not a colour) and `--accent` flips polarity between schemes. A6 must define every new token role for both schemes.

## Test layout and environment gates

Full detail in [`repo-map/10-tests-and-conventions.md`](./repo-map/10-tests-and-conventions.md).

169 test files (138 `.ts`, 31 `.tsx`). `vitest.config.ts` sets `environment: "node"`, includes `src/**/*.test.ts(x)` and `scripts/**/*.test.ts`, has **no setup file** and no coverage config. Files under `src/routes/__tests__/` carry a `-` prefix so the router plugin does not treat them as routes — the one exception is the cause of baseline warning W-1.

## Repository conventions this plan must follow

1. **Writes are imperative**, not `useMutation` (VF-2).
2. **Shared feature components live in `src/components/sales/`** behind its barrel (VF-5).
3. **Query keys always come from `crmQueryKeys`** — already enforced (VF-8).
4. **Invalidation depends on how the route loads** (VF-3).
5. **Toasts come from `sonner`**, imported as `import { toast } from "sonner"`.
6. **Forms use `react-hook-form` + `zod`** via `@hookform/resolvers`.
7. **Server functions are `createServerFn`** with a validator and an explicit capability check.
8. **Path alias `@` → `src/`.**
9. **Prettier is enforced through ESLint** (`eslint-plugin-prettier`), so formatting violations fail `bun run lint`.
10. **`bunfig.toml` sets `minimumReleaseAge = 86400`** — a supply-chain rule. Any new package must be at least a day old, and plan §0.6 requires human approval regardless.

---

## Open questions carried into A3–A6

1. `quotes.account_id` — whether a canonical link exists or quotes are matched to accounts by company name. Governs C4 and D2. (Appendix 08 §F.)
2. Which of the 53 skipped tests are environment-gated and on which variables. Governs `validation-report.md`.
3. Whether the `admin.index.tsx` / `admin.tsx` split needs one parity row or two.
