# VERIFICATION PASS — repo `C:/Users/laich/Documents/FIMMICK ClientOps/ui-delight-maker` (branch `feat/clientops-frontend-revision`)

Everything below was re-checked against the real files. Reports were not taken on trust.

---

## A. CONTRADICTIONS BETWEEN REPORTS

Only three real disagreements exist; the ten reports are otherwise mutually consistent on everything I checked.

| # | Disagreement | Settling file | Verdict |
|---|---|---|---|
| 1 | **`routes-c`** says the root gate treats `isPublicAuthPath` as true for "`/login`, `/login/*`, and `/invite/*`". **`shell`** says the same but adds `AUTH_BASE_PATH = "/login"` and `getLoginAuthPath`. No report states whether `/invite/$token` therefore renders **without** the sidebar shell. | `C:/Users/laich/Documents/FIMMICK ClientOps/ui-delight-maker/src/lib/auth/auth-routes.ts` + `src/routes/__root.tsx:143-155` | Both correct; the consequence is unstated everywhere: `/invite/*` and `/login*` render a **bare `<Outlet/>` inside `QueryClientProvider` only** — no sidebar, no header, no `<Toaster/>`. 4 route files total. |
| 2 | **`shell`** asserts "There is **no authenticated layout route**… no pathless layout files exist". **`routes-b`/`routes-c`** describe `/accounts`, `/agents`, `/campaigns`, `/clients`, `/leads`, `/quotes`, `/job-sheets` as "layout-style routes" rendering `<Outlet/>`. | `grep -rln "<Outlet" src/routes` | Both true, different senses. There are **zero pathless (`_`-prefixed) layouts**, but **8 non-root path layout routes** render `<Outlet/>`: `accounts.tsx, admin.tsx, agents.tsx, campaigns.tsx, clients.tsx, job-sheets.tsx, leads.tsx, quotes.tsx`. Seven of the eight gate on `useIsExactPath` (`src/lib/routing-utils.ts:8`); `admin.tsx` alone always wraps in `<AdminShell>`. The map must not say "no layout routes". |
| 3 | **`libs`** reports `crmQueryKeys` domain traffic as "`clients.section` (21), `shell` (15), `admin.section` (12)…". **`routes-a`/`routes-b`** imply `leads` and `quotes` dominate. | `src/lib/query-keys.ts` + full-repo grep | Different granularity, not a conflict. Domain totals (incl. tests): `quotes` 29, `clients` 29, `admin` 26, `leads` 22, `tasks` 14, `aiReview`/`approvals`/`campaigns` 9 each, `agents` 8, `jobSheets` 7, `engagements`/`notifications` 6, `accounts`/`renewals` 5, `companyWorkspace` 4, `account`/`products` 3, `relationships`/`reports` 2, `contacts`/`settings` 1, **`deals`/`pipeline`/`projects` 0**. |

---

## B. GAPS — questions from the seven that **no** report answers

1. **Q1/Q2 — routes never covered by any report.** `src/routes/account.tsx` (`/account`), `src/routes/admin.index.tsx` (`/admin/`) and `src/routes/clients.import.tsx` (`/clients/import`) appear in no report's route inventory. `clients.import.tsx` is the **only authenticated route with no `loader` at all** (and no `validateSearch`); `admin.tsx` is the only other loader-less one (it has `beforeLoad` instead).
2. **Q2 — server functions reached through child components/hooks.** Every route report lists only the *route file's* imports. 14 further server-function import sites live in components/hooks and are invisible in the reports:
   - `src/components/global-search.tsx` → `@/server-functions/search`
   - `src/components/pipeline/won-conversion-dialog.tsx` → `leads`
   - `src/components/relationship/relationship-command-center.tsx` → `relationship-signals`
   - `src/components/relationship/workspace-view-switcher.tsx` → `workspace-preferences`
   - `src/components/renewals/renewals-preview-panel.tsx` → `engagements` (×2), `client-contacts`
   - `src/components/renewals/mark-renewed-ended-dialog.tsx` → `engagements`
   - `src/components/touchpoint-logger.tsx` → `touchpoints`, `ai-note-tidy`
   - `src/hooks/use-client-workspace-section.ts` → `client-workspace`; `use-company-workspace-section.ts` → `company-workspace`; `use-notifications.ts` → `notifications`; `use-quote-reference-data.ts` → `quote-workspace`
   Consequence: `/renewals` reads as a one-server-function route in the reports (`getRenewalsRead`) when its preview panel actually reaches three more.
3. **Q3 — the second shell.** `src/components/admin/admin-shell.tsx` is a full second navigation shell (its own `<aside>`, `aria-label="Admin navigation"`, own active-path logic incl. the `/admin` vs `/admin/` special case at line 47-50). Only `shell` mentions it, in one line. Also unlisted as shell surface: `src/components/global-search.tsx`, `src/components/notification-bell.tsx`, `src/components/theme-toggle.tsx`, `src/components/ui/sidebar.tsx`, `src/components/ui/sonner.tsx`.
4. **Q3 — how navigation gating actually works.** No report states it: the sidebar's five workflow groups are **hard-coded arrays with zero capability gating** (`src/components/app-sidebar.tsx:41-67`). The *only* gated entry is the single "Admin workspace" item, shown when `adminNavigation.length > 0` and pointed at `adminNavigation[0].href`. Gating is computed server-side in `getAdminNavigationFn` (`src/server-functions/admin-users.ts:119-137`): `requireAnyCapability(["users.view","teams.view","permissions.view","audit.view"])`, then per-item `requireCapability` with `FORBIDDEN`/`OUTSIDE_SCOPE` swallowed to `null`. A `read_only` user still sees all 15 workflow links.
5. **Q5 — no report answers whether a status-label map or an error sanitizer exists.** (Answers in §C.)
6. **Q7 — environment gating is unanswered by every report.** `config` covers *build-time* env only. (Answer in §C.)
7. **Q1 — `/account` is orphaned from navigation.** Zero `Link to="/account"` anywhere in `src`. Its only inbound path is `src/routes/invite.$token.complete.tsx:16` → `throw redirect({ href: "/account?welcome=1" })`.

---

## C. CORRECTIONS — claims I checked

**Claims verified CORRECT** (use as-is): `crmQueryKeys` surface exactly as `libs` describes — 23 `createRouteQueryKeys` domains + `shell()`/`dashboard()` + the odd-shaped `companyWorkspace`, and the 5-element no-filter `section()`; `deals`/`pipeline`/`projects` have literally **0** call sites repo-wide. All `src/styles.css` token values in `tokens` (39 `:root` decls, 38 `.dark`, `--radius` light-only, `--accent` polarity flip). `useMutation` and `useSuspenseQuery` = **0 occurrences repo-wide** (not just `src/routes`). 184 `export const … = createServerFn` across 40 files. 169 test files (138 `.test.ts` + 31 `.test.tsx`). `redirect` imported unused at `src/routes/__root.tsx:10`. `LeadPreviewPanel`/`PipelineBoard` imported but never rendered in `src/routes/index.tsx:7-8`. Only two `beforeLoad` in the tree: `__root.tsx:84`, `admin.tsx:7`. Line counts (index 397, leads 753, accounts 356, accounts.$id 833, ai-review 250, agents 285). All `package.json` scripts verbatim, including the duplicate `clientops:migrate-relationship-schema` alias.

**Corrections / material additions:**

| # | Claim | Correction | Evidence |
|---|---|---|---|
| C1 | Reports imply all loaders go through `queryClient.ensureQueryData` + `routeQueryOptions`. | **9 of 33 authenticated loaders bypass the query client entirely** and call the server function directly, so their data is never in the React Query cache and `invalidateQueries` cannot refresh them — only `router.invalidate()` can: `accounts.$id`, `campaigns.$id`, `clients.$id`, `job-sheets.$id`, `leads.$id`, `quotes.$id`, `quotes.$id_.pdf`, `quotes.new`, `relationships`. The other 24 use `ensureQueryData`. | e.g. `src/routes/relationships.tsx:16`, `src/routes/accounts.$id.tsx:46`, `src/routes/quotes.new.tsx:64` |
| C2 | `relationships.tsx` follows the `routeQueryOptions` convention. | It does **not** import `routeQueryOptions` at all; it hand-writes `useQuery({ queryKey: crmQueryKeys.relationships.list(...), staleTime: 30_000, placeholderData })` — a duplicated magic number of `CRM_STALE_TIME_MS`. | `src/routes/relationships.tsx:1-32` |
| C3 | `routes-a`: index.tsx `loaderDeps` "computed and unused". | Correct, and it is not unique — this is a router-level cache-key bug class. `index.tsx:41` declares `loaderDeps: ({ search }) => ({ search })` while `loader: ({ context }) =>` at line 42 ignores it. | `src/routes/index.tsx:40-42` |
| C4 | `shell`: nav is 5 groups + admin. | Add: the sidebar has **no entries** for `/account`, `/notifications`, `/clients/import`, or `/quotes/new`. `/notifications` is reachable only from `src/components/notification-bell.tsx:148`; `/clients/import` only from `src/routes/clients.tsx:141`. | grep, above |
| C5 | Reports treat "the page header" as one pattern. | There are **two mutually exclusive header components** with a clean 15/10 split and **zero overlap**: `PageHeader` (`src/components/page-header.tsx`) on `accounts, accounts.$id, agents, agents.$name, campaigns, campaigns.$id, clients.$id, clients.import, leads.$id, notifications, quotes.$id, quotes.new, relationships, reports, settings`; `CommandHeader` (`src/components/sales/command-header.tsx`) on `ai-review, approvals, clients, index, job-sheets, job-sheets.$id, leads, quotes, renewals, tasks`. The remaining 10 (`account`, 8 `admin.*`, `quotes.$id_.pdf`) use neither. | `comm -12` of the two grep sets |
| C6 | `config`/reports do not mention runtime feature gates. | **Q7 answer.** Seven runtime env gates, all server-side, all silently degrading: `N8N_WORKFLOW_TOKEN` (`src/lib/n8n.ts:7` — gates *every* n8n trigger, and `src/server/workflows/assert-workflow-token.server.ts:2` gates all 9 inbound `/api/workflows/*` routes); `N8N_QUALIFY_LEAD_WEBHOOK_URL` (`server-functions/leads.ts:154`); `N8N_DRAFT_REPLY_WEBHOOK_URL` (`leads.ts:211`); `N8N_DRAFT_QUOTE_WEBHOOK_URL` (`quotes.ts:148`); `N8N_RELATIONSHIP_INTELLIGENCE_WEBHOOK_URL` (`accounts.ts:88`); `N8N_SCORE_RENEWAL_RISK_WEBHOOK_URL` (`engagements.ts:101`, `server/workflows/retention-sweep.server.ts:78`); `N8N_USER_INVITATION_WEBHOOK_URL` (`server/admin/invitation-email.server.ts:25`). All six webhook gates return the sentinel `{ triggered:false, reason:"missing_webhook" }` rather than throwing. Plus `OPENROUTER_API_KEY`/`OPENROUTER_MODEL` (`server-functions/ai-note-tidy.ts:11,16`) — this one **throws** `"OPENROUTER_API_KEY is not configured"`, but is the **only gate exposed to the client**, via `isAiNoteTidyAvailable()` polled in `src/components/touchpoint-logger.tsx:69`. Also `APP_BASE_URL`/`VERCEL_PROJECT_PRODUCTION_URL` (invite links), `VITE_NEON_AUTH_URL` (`src/lib/auth/neon-auth.server.ts:62`), `DATABASE_URL` (`src/server/db/neon.server.ts:71`). No `import.meta.env` reads exist anywhere in `src`. |
| C7 | `server-fns` gives per-function capability checks. | Add the client-side consequence: **`missing_webhook` is handled inconsistently.** `src/routes/index.tsx:157,175,193` and `src/components/renewals/renewals-preview-panel.tsx:92` and `src/components/admin/invite-users-dialog.tsx:86` each branch on it separately; `src/routes/accounts.$id.tsx` (which calls `triggerRelationshipIntelligence`) and `src/routes/leads.$id.tsx` (which calls `triggerLeadAgent`/`triggerQuoteAgent`) do **not** — those two silently report success when the webhook is unset. | grep `missing_webhook` |

---

## D. PLAN CORRECTIONS

### (a) "shared feature components should live in `src/components/workspace/`" — **FALSE**

`src/components/workspace/` **does not exist** (`ls` → `No such file or directory`). The established home for shared feature components is **`src/components/sales/`**, which already has a barrel export and is imported by 10 routes:

```
src/components/sales/index.ts:
export { CommandHeader } from "./command-header";
export { SalesContextPanel } from "./context-panel";
export { MetricStrip, type SalesMetric } from "./metric-strip";
export { WorkSurfaceEmpty } from "./work-surface-empty";
```

Consumers: `ai-review.tsx, approvals.tsx, clients.tsx, index.tsx, job-sheets.$id.tsx, job-sheets.tsx, leads.tsx, quotes.tsx, renewals.tsx, tasks.tsx`. The rest of the tree is domain-foldered (`account/ admin/ auth/ dashboard/ job-sheets/ pipeline/ quotes/ relationship/ renewals/ reports/ sales/ ui/`) with 9 cross-cutting components loose at `src/components/` root (`app-sidebar, empty-state, global-search, list-pagination, metric-card, notification-bell, page-header, status-badge, summary-row, theme-toggle, touchpoint-logger`). Creating `workspace/` adds a **fourth** convention. It is the only barrel in the tree — `src/components/sales/index.ts` is the sole `index.ts` under `src/components/`.

### (b) "`src/lib/status-labels.ts` does not exist and must be created" — **TRUE (file), but the premise is incomplete**

`src/lib/status-labels.ts`: **absent**. `grep -rn "STATUS_LABELS\|statusLabel\|STATUS_LABEL"` over `src` → **zero matches**. There is no central label map.

But a central status **style** map already exists and must be reconciled, not bypassed: `src/components/status-badge.tsx` holds `STATUS_STYLES: Record<string, string>` with 30 keys across 6 domains (leads/quotes/tasks/approvals/agent-runs/priority), and derives its label with `label ?? normalizedValue.replace(/_/g, " ")` plus CSS `capitalize`. That fallback is duplicated at **29 sites in 20 files** (`grep -rn 'replace(/_/g'`), including `src/lib/pipeline.ts`, `src/lib/sales-workspace.ts`, `src/lib/relationship/timeline.ts`, `src/server/repositories/approvals.ts`, `src/server/repositories/leads.ts`, `src/server/workflows/writebacks.ts`, and 9 route files. A new `status-labels.ts` must feed `StatusBadge` or the two will drift.

### (c) "`src/lib/errors.ts` does not exist and must be created" — **TRUE**

`src/lib/errors.ts`: **absent**. `grep -rn "sanitiz" src` (excluding tests) → **zero matches**. No sanitizer exists at any layer.

Adjacent files that are **not** substitutes and must not be mistaken for one:
- `src/lib/error-capture.ts` — a 27-line global `error`/`unhandledrejection` recorder with a 5s TTL, for recovering stacks in `server.ts`. Not user-facing.
- `src/lib/error-page.ts` — a hard-coded static HTML 500 page string.
- `src/server/db/postgres-error.ts` — exports `isPostgresError`, `classifyDatabaseFailure` returning `"schema_mismatch" | "query_timeout" | "query_failed"`. Server-side classification only; nothing consumes it for UI messaging.

Current behaviour: raw `error.message` is rendered straight to the user in **18 sites** (`error instanceof Error ? error.message : …`) plus the root `errorComponent` (`src/routes/__root.tsx:59`), which prints `{error.message}` verbatim. Postgres driver text is therefore reachable by end users.

### (d) "`src/lib/invalidate.ts` must be created (vs `src/lib/operational-invalidation.ts` already doing this)" — **FALSE as stated; the premise is half right**

`src/lib/invalidate.ts` is absent, but **two partial helpers already exist** and a third would be the third convention:

1. `src/lib/operational-invalidation.ts` — `getOperationalMutationKeys(mutation)` for exactly 4 mutation types (`task-status`, `approval-decision`, `notification-read`, `agent-run`). **Returns key arrays only; it never calls `queryClient`.**
2. `src/lib/company-workspace/invalidation.ts` — the fuller pattern: `companyWorkspaceQueryKey()`, `getCompanyWorkspaceMutationQueryKeys()`, and a real executor `invalidateCompanyWorkspaceMutation(queryClient, accountId, mutation)` doing `Promise.all(... invalidateQueries({ queryKey, exact: true, refetchType: "active" }))` — covering 2 mutations.

Between them they cover 6 mutations. Every other write in the app hand-rolls its invalidation inline (e.g. the `refreshDashboard` closure at `src/routes/index.tsx:75-81`, the `accounts.tsx` toggle-favorite pair at lines 326-352). The correct plan item is **consolidate/extend these two into one module**, not create a third alongside them. Note also C1: for the 9 direct-loader routes, `invalidateQueries` is a no-op and `router.invalidate()` is mandatory.

### (e) "`src/lib/csv.ts` does not exist and must be created" — **TRUE (file), and there is real duplication to fold in**

`src/lib/csv.ts`: **absent**. Two independent CSV **parsers** already exist and disagree:
- `src/lib/csv-import.ts:3` `parseClientImportCsv(raw)` — its own inline `splitLine` with `""`-escape handling, `.trim()`s every field, drops blank lines.
- `src/lib/relationship/event-import.ts:50` `parseCsvLine(line)` + `:124` `parseEventAttendeeCsv(csv)` — a second, separate implementation that lowercases headers.

There is **no CSV serializer/export anywhere in the repo**. The one "export" control, `src/routes/admin.audit.tsx:86`, emits **JSON**, not CSV: `new Blob([JSON.stringify(result.items, null, 2)], …)`, backed by `exportAdminAuditLogsFn` (`src/server-functions/admin-access.ts:195-201`), which requires `audit.export` and returns rows, not a file. So `csv.ts` is genuinely new *for export*, but must absorb or replace the two existing parsers or the codebase will hold three.

### (f) "`rg -n supabase src` can be reduced to zero matches" — **FALSE**

**244 matches across 21 files.** Supabase is live runtime code with an explicit, documented quarantine and stated exit criteria that are not met.

- `src/legacy-supabase/server.ts` exports `createSupabaseServerClient` / `createSupabaseServiceClient` (`@supabase/ssr`), reading `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
- **Six non-test modules import it**, one of them on the authorization hot path: `src/server/auth/resource-ownership.ts:1`, plus repositories `automation-playbooks.ts`, `customer-success.ts`, `deals.ts`, `engagement-events.ts`, `projects.ts`.
- `src/server/auth/resource-ownership.ts` defines `SUPABASE_OWNED_RESOURCE_TYPES` (line 66) — a Set of resource types whose ownership is resolved against the **other database**, with a comment noting the two carry incompatible ids. Deleting this changes authorization outcomes.
- `src/legacy-supabase/README.md` states the exit criteria verbatim: port the remaining legacy server-functions to Neon, remove route-level imports, then remove the Supabase packages. None are done.
- A dedicated invariant test exists on the measurement tooling: `src/lib/__tests__/measure-supabase-surface.test.ts` (against `scripts/clientops/measure-supabase-surface`), whose whole point is that a sampled "0 rows" verdict must **not** license deleting code. Driving the grep to zero is exactly the action that test was written to block without a full-table census.

Two of the 244 matches are cosmetic and *are* safely removable: a comment at `src/routes/agents.$name.tsx:311` and one at `src/lib/money.ts:12`.

### (g) "there are exactly 31 authenticated routes" — **FALSE. There are 35.**

`grep -rho 'createFileRoute("…")' src/routes | sort -u` → **49 registrations**: 10 `/api/*`, 4 public (`/login`, `/login/$authPath`, `/invite/$token`, `/invite/$token/complete`), **35 authenticated**.

The plan's table (`docs/frontend-revision/execution-plan.md:247-278`) lists 31. The **4 it omits**:

1. `/account` — `src/routes/account.tsx`, 7 server functions from `@/server-functions/account`, loader `ensureQueryData(accountQueryOptions())`. Orphaned from nav; only inbound link is the post-invite redirect.
2. `/notifications` — `src/routes/notifications.tsx`, `validateSearch: notificationSearchSchema`, loader → `getNotifications`. Reachable from `notification-bell.tsx:148`.
3. `/clients/import` — `src/routes/clients.import.tsx`, `commitClientImportFn` + `validateClientImportRows`. **No loader, no validateSearch.** Linked from `clients.tsx:141`.
4. `/admin/` — `src/routes/admin.index.tsx` is a **separate registration** from the `/admin` layout in `admin.tsx`. The plan's row 25 `/admin` collapses two routes into one; `AdminShell` itself distinguishes them (`admin-shell.tsx:47`: `pathname === "/admin" || pathname === "/admin/"`).

Two further plan inaccuracies in that table: it writes `/quotes/$id/pdf` where the registered id is **`/quotes/$id_/pdf`** (file `quotes.$id_.pdf.tsx` — the `_` suffix opts the route out of the `/quotes/$id` layout); and it assigns `/campaigns` and `/campaigns/$id` to the "Acquire" sidebar group, whereas `src/components/app-sidebar.tsx:52` puts Campaigns in **`convertItems`**.

**Corroborating in-repo sources of truth** (both disagree with 31, and with each other, which the map should note):
- `src/lib/performance/route-performance.ts:37-79` `APP_ROUTE_FAMILIES` — 34 authenticated paths in 18 families; it *has* `/account`, `/notifications`, `/clients/import`, but collapses `/admin` + `/admin/` and also spells the PDF route `/quotes/$id/pdf`.
- `src/server/db/route-loader-contract.ts` `ROUTE_LOADER_CONTRACT` (34 entries) + `ACKNOWLEDGED_UNCOVERED_ROUTES` (`["invite.$token.complete"]`) — enumerates **all 35 route files that define a `loader`**, enforced by `src/server/db/__tests__/route-loader-completeness.test.ts`. Of those 35, 33 are authenticated (`invite.$token` and `invite.$token.complete` are the two public ones). The 2 authenticated routes with **no loader**: `admin.tsx` (has `beforeLoad`) and `clients.import.tsx` (has nothing).

Adding the 4 missing routes also invalidates the derived counts at `execution-plan.md:89`, `:247`, `:822`, `:939` and `baseline-gates.md:135` (screenshot matrix: 31×4 widths → **35×4**).