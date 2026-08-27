# ClientOps read-path map — read-models, repositories, company-workspace

Every claim below comes from a file opened in this pass. Paths are absolute-repo-relative from `C:/Users/laich/Documents/FIMMICK ClientOps/ui-delight-maker`.

---

## A. Read-model catalogue

All files in `src/server/read-models/`. "Queries" = SQL round-trips issued (`query`/`queryOne` calls), excluding those inside `Promise.all` counted once each.

| # | Export | File | Inputs | View-model shape (field names) | Aggregates | Paginates | SQL queries |
|---|---|---|---|---|---|---|---|
| 1 | `getAccountsIndexReadModel` | `accounts-index.ts:70` | `(profileId: string, filters: AccountPageFilters = {})` | `accounts`, `accountCounts` (`Record<accountId, {linkedClientCount, openSignalCount}>`), `pagination{total,page,limit}`, `preferences{views,favorites}` | yes — 2 `group by account_id` counts over `clients` and `relationship_signals` | yes — delegates to `listAccountsPage` → `normalizePagination` | **6** (4 if page empty): `listAccountsPage` rows + count, `listWorkspaceViews`, `listWorkspaceFavorites`, then 2 batched count queries keyed by `any($1::uuid[])` |
| 2 | `loadAgentDirectoryRead` | `agent-workspaces.ts:55` | none | `agents[]` = `AGENT_DEFINITIONS[n] & {runs_24h, avg_confidence, sparkline: number[14]}`, `recentRuns: AgentRunSummary[]` | yes — 24h count + `avg(confidence_score)`, hourly bucket rollup | no — fixed `DIRECTORY_RUN_LIMIT = 50` | **3** parallel |
| 3 | `loadAgentHistoryPage` | `agent-workspaces.ts:114` | `{agent: string, page: number, limit: number}` (pre-normalized by `normalizeAgentHistoryInput`, `src/server-functions/agent-runs.ts:26`) | `items: SerializableAgentRun[]`, `total`, `page`, `limit`, `summary{runs_24h, avg_confidence}` | yes | yes — **own** offset math, clamps `page` to `lastPage`; does **not** use `normalizePagination` | **3** (count first, then 2 parallel) |
| 4 | `loadAiReviewRead` | `agent-workspaces.ts:159` | none | `approvals: SerializableHumanApproval[]`, `humanReviewRuns: AgentRunSummary[]` | no | no — hardcoded `limit 100` on both | **2** parallel |
| 5 | `loadClientWorkspaceRead` | `client-workspace.ts:127` | `(clientId, requestId = crypto.randomUUID(), visibility: ClientWorkspaceVisibility = all)` | `requestId`, `identity{id, accountId, primaryContactId, companyName, industry, tier, createdAt}`, `ownership{accountOwnerId}`, `relationship{healthScore, onboardingStatus, renewalDate, renewalRisk, arr}`, `counts{contacts, engagements, quotes, jobSheets}` | yes — one query with 4 scalar sub-selects, each gated by a `case when $n::boolean` visibility flag → `null` when the caller lacks the capability | no | **2** parallel (`getClient` = 1, counts = 1) |
| 6 | `loadClientWorkspaceSection` | `client-workspace.ts:196` | `(clientId, section: "contacts"\|"activity"\|"commercial"\|"engagements"\|"job_sheets", requestId?)` | `{status:"ready"\|"empty", data}` \| `{status:"error", error{code, requestId, retryable, section}}`; data per section: `{contacts}`, `{activityLogs}`, `{quotes}`, `{engagements}`, `{jobSheets}` | no | no | **1** for contacts/commercial/engagements/job_sheets; **2 sequential** for `activity` (engagements → activity logs) |
| 7 | `getDashboardReadModel` (alias `getDashboardRead`) | `dashboard.ts:38` | none | `leads, quotes, tasks, approvals, agentRuns, activityLogs, products, pipelineTotals{openLeads, activeQuoteValue, openTasks, pendingApprovals}, productSummary: Record<category, count>` | yes — 1 totals query with 4 scalar sub-selects; `productSummary` computed in JS | no — fixed `DASHBOARD_LIMITS` (leads 40, quotes 40, tasks 60, approvals 30, agentRuns 30, activityLogs 20, products 50) | **8** parallel |
| 8 | `loadRenewalsRead` | `operations.ts:42` | `RenewalsReadFilters` (`asOf`, `renewalWindow`, `risk`, `productId`, `page`, `limit`) | `rows, total, page, limit, metrics{annualizedValue, arrAtRisk, dueSoon, stale}, products, asOf` | yes | yes — **own** clamp in `listRenewalsRead` (`engagements.ts`), default 25, max **50** | **3** parallel |
| 9 | `loadReportSummary` | `operations.ts:55` | `{range: "7d"\|"30d"\|"90d"}` | `range, metrics{revenue, pipelineValue, leads, wonLeads, conversionRate, agentRuns, successfulAgentRuns, openTasks}, reports: ReportDefinition[]` | yes — 7 scalar sub-selects in one statement | no | **1** |
| 10 | `loadReportDataset` | `operations.ts:176` | `{report: "revenue"\|"pipeline"\|"conversion"\|"agents"\|"tasks", range}` | `{report, range, data: Record<string, string\|number\|null>[]}` | yes — all five are `group by` | no | **1** |
| 11 | `loadQuoteCreateBootstrap` | `quote-workspace.ts:32` | `{leadId?, clientId?, productId?}` | `pricingTemplates, quoteTemplates, pdfTemplates, leads, clients, products` (last three are `QuoteReferencePage{items,total,page,limit}`) | no | yes — 3 reference pages, page 1 / limit 25 | **9–12** (3 template lists + 3× `listQuoteReferencePage`, each 2 queries or 3 when `selectedId` given) |
| 12 | `loadQuoteDocumentRead` | `quote-workspace.ts:100` | `(id: string)` | `{quote, client, lead, versions: QuoteVersion[]}` (0 or 1 version) | no | no | **2–4** in 2 sequential rounds; asserts the snapshot is immutable via `assertImmutableDocumentVersion` |
| 13 | `loadLeadWorkspaceRead` | `relationship-workspaces.ts:18` | `(id: string)` | `{lead, qualification{status, score, data}, activityLogs: SerializableActivityLog[], quotes: LeadQuoteSummary[]}` | no (but see C.9) | no — fixed limits (activity 20, quotes 25) | **3** parallel |

Notes:
- `clientWorkspaceSections` (`client-workspace.ts:20`) is an exported const array, not a function.
- `src/server/read-models/quote-workspace.ts:16` imports `listQuoteVersionSummariesPage` and **never uses it** — dead import (the live caller is `src/server-functions/quote-workspace.ts:132`).
- `relationship-workspaces.ts` carries a comment (lines 7–17) recording that the campaign and relationship-index read models were deleted as pure delegations; callers import those repositories directly.

---

## B. Section-loading design — confirmed and corrected

**Files:** `src/server/company-workspace/{types,errors,loaders}.ts`, `src/lib/company-workspace/{invalidation,section-enablement,section-state}.ts`, `src/hooks/use-company-workspace-section.ts`, `src/server-functions/company-workspace.ts`, `src/routes/accounts.$id.tsx`.

### How sections are requested

Two entry points, both in `src/server-functions/company-workspace.ts`:

- `getCompanyWorkspaceRead({accountId, sections: CompanyWorkspaceSection[]})` → `loadCompanyWorkspaceRead(accountId, sections, requestId, now)`. Validator rejects unknown sections and duplicates.
- `getCompanyWorkspaceSection({accountId, section})` → one section.
- `getCompanyWorkspaceCore({accountId})` → core only (used by `src/routes/accounts.tsx:139`, the list page's preview panel).

All three call `requireCapability("accounts.view", {resourceType:"account", resourceId})`.

The section union (`types.ts:15`) is **`"commercial" | "delivery_finance" | "activity" | "intelligence"`**.

### Correction 1 — there is no "header/people/overview" section

`core` and `overview` are **not** sections. `loadCompanyWorkspaceRead` (`loaders.ts:128`) always loads both, unconditionally, in parallel with whatever sections were requested:
- `core` = `{company: Account, ownership{accountOwnerId, csOwnerId}, contacts: AccountContact[]}` — `getAccount` + `listAccountContacts`, 2 queries.
- `overview` = `{linkedClientCount, activeEngagementCount, quoteCount, quoteTotals[{currency, quoteCount, totalValue}], openSignalCount, openSignals}` — 3 queries; `openSignals` is `signals.slice(0, 5)` (`loaders.ts:70`).

So the project's "initial view loads header/people/overview" is right in spirit: the initial payload is core (header + people) + overview. But those are fixed parts of the read, not requestable sections.

### Correction 2 — the route never uses the batch-sections capability

`src/routes/accounts.$id.tsx:46`:
```ts
loader: ({ params }) => getCompanyWorkspaceRead({ data: { accountId: params.id, sections: [] } }),
```
and again at line 61 for the refetch. `sections` is **always `[]`**. Every section arrives through the per-section server function via `useCompanyWorkspaceSection`. The `sections` parameter of `loadCompanyWorkspaceRead`, and the `cache.sections` map it populates, are exercised only by tests.

### Correction 3 — the tab→section mapping

`getCompanyWorkspaceSectionEnablement` (`src/lib/company-workspace/section-enablement.ts:14`), against the tab labels in `accounts.$id.tsx:286–290`:

| Tab value | UI label | Sections enabled |
|---|---|---|
| `overview` (default) | Overview | none |
| `stakeholders` | People | none |
| `timeline` | Activity | `activity` |
| `events` | **Commercial** | `commercial` + `delivery_finance` + `activity` |
| `tasks` | **Delivery & Finance** | `commercial` + `delivery_finance` |

So "Activity, Commercial, Delivery&Finance load on tab open" is correct, but the Commercial tab pulls **three** sections, not one, and Delivery&Finance pulls two. Only `commercial`, `delivery_finance` and `activity` queries exist on the route (`accounts.$id.tsx:77–85`).

### Correction 4 — `intelligence` is dead on this route

No tab enables it, and `accounts.$id.tsx` creates no query for it. The account page's signals come from `overview.openSignals`. `intelligence` remains in the section union, in `loadCompanyWorkspace` (the all-sections variant, `loaders.ts:159`, which has no caller outside tests), and as an invalidation target in `src/lib/company-workspace/invalidation.ts:11–12`.

### Partial-failure behaviour

- **Per section:** `loadCompanyWorkspaceSection` (`loaders.ts:115`) wraps `loadSectionData` in try/catch and returns `{status:"error", error}` instead of throwing. Because each section swallows its own failure, the `Promise.all` in `loadCompanyWorkspaceRead` can never reject on a section.
- **Overview:** also wrapped (`loaders.ts:73`), but its error carries **no `section` field**.
- **Core is NOT wrapped.** `loadCompanyWorkspaceCore` propagates — a failing `getAccount`/`listAccountContacts` fails the whole route loader. That is the deliberate boundary between "page cannot render" and "one panel is degraded".
- **Error shape** (`types.ts:28`): `{code: CompanyWorkspaceErrorCode, requestId, retryable: boolean, section?}`. `CompanyWorkspaceErrorCode = DatabaseFailureKind | "company_not_found" | "access_denied"`. `toCompanyWorkspaceError` (`errors.ts:25`) maps the two app-level sentinel `error.code` values to `retryable: false`; everything else goes to `classifyDatabaseFailure`, which owns the SQLSTATE→retryable decision for every read path.
- **Empty vs error:** `isEmptySection` returns `"empty"` when every value in the section payload is a zero-length array (`loaders.ts:111`).
- **Stale data:** `SectionState`'s error variant declares `staleData?: T`, but the **server never populates it**. It is filled client-side by `retainCompanyWorkspaceSectionData` (`src/lib/company-workspace/section-state.ts:3`), which reads the previous cache entry (`ready`/`empty` → its `data`; a previous `error` → its `staleData`).
- **Client retry:** `useCompanyWorkspaceSection` sets `retry: false` on React Query and instead does **one** manual re-fetch after `transientRetryDelayMs = 250` when `first.error.retryable` is true (`use-company-workspace-section.ts:36–44`). The identical shape is duplicated in `src/hooks/use-client-workspace-section.ts`. A code comment at `src/server/read-models/client-workspace.ts:205` records why: the old blanket `query_failed`/`retryable: true` made a permanent 42703 retry forever.

### Cache metadata — confirmed 30s, with a caveat

`CompanyWorkspaceCacheMetadata = {fetchedAt: string; freshForMs: number}` (`types.ts:86`). `loadCompanyWorkspaceRead` returns:
```ts
cache: {
  core: cacheMetadata,
  overview: cacheMetadata,
  sections: Object.fromEntries(requestedSections.map((section) => [section, cacheMetadata])),
}
```
built from a single object stamped **before any query runs** (`loaders.ts:134`): `{fetchedAt: now().toISOString(), freshForMs: 30_000}`. Consequences:

1. All three cache entries are the **same object** with the same timestamp — per-section freshness is not actually tracked.
2. `getCompanyWorkspaceSection` returns **no cache metadata at all** — only `SectionState`. Since the route loads all sections through that function, no section on the live page ever carries cache metadata.
3. Nothing in `src/hooks/` or `src/components/` reads `cache`, `fetchedAt`, or `freshForMs` — only tests do. The 30s freshness reaches the client through a **duplicated constant**: `COMPANY_WORKSPACE_STALE_TIME_MS = 30_000` at `src/hooks/use-company-workspace-section.ts:12`, re-exported as `CLIENT_WORKSPACE_STALE_TIME_MS` at `src/hooks/use-client-workspace-section.ts:12`. Both hooks also set `refetchOnWindowFocus: true`.

So: **30s freshness confirmed**, but it is enforced by a client constant, not by the server's `cache` block, and the two can drift.

### Invalidation

`src/lib/company-workspace/invalidation.ts:10` maps mutations to query targets:
- `dismiss_relationship_signal` → `["overview", "intelligence"]`
- `run_relationship_intelligence` → `["overview", "intelligence"]`

Invalidated with `{exact: true, refetchType: "active"}`. `"overview"` is the key the route's `getCompanyWorkspaceRead` query uses (`accounts.$id.tsx:57`). `"intelligence"` has no active query on the route, so that half is a no-op today.

### Client workspace (`/clients/$id`) — same architecture, three differences

`src/server/read-models/client-workspace.ts` + `src/server-functions/client-workspace.ts`. Sections: `contacts | activity | commercial | engagements | job_sheets`. Differences from company workspace:
1. **No cache metadata at all** — `ClientWorkspaceRead` has no `cache` field.
2. **Per-section capability sets** (`src/server-functions/client-workspace.ts:31`), e.g. `commercial` needs `["accounts.view","quotes.view"]`; the top-level read uses `requireCapabilitySet(["accounts.view"], {optional: [...]})` and feeds the results into the count-visibility flags so a caller without `quotes.view` gets `counts.quotes === null` rather than a number.
3. Error code union is `DatabaseFailureKind` only — no `company_not_found`/`access_denied` equivalents.

---

## C. N+1 and performance risks

### Read path — per-row / repeated work

1. **`getAccountTimelineData`** (`src/server/repositories/account-timeline.ts:15`) — the Activity tab. **9 parallel queries, each `limit 100`**, and most are `select *`: `touchpoints`, `activity_logs` (two unioned indexed branches, 100 each, then outer 100), `tasks`, `quotes` (**full `line_items` + `document_sections` jsonb**), `human_approvals` (full `context_data`), `agent_runs` (**full `input_data` + `output_data`**), `campaign_members`, `leads` (column-listed, good), `engagements` (column-listed, good). Two of these already prove the fix is cheap.
2. **`loadAgentHistoryPage`** (`src/server/read-models/agent-workspaces.ts:124`) — `select * from agent_runs … limit $2 offset $3` then `serializeAgentRun`, which explicitly re-serializes `input_data` and `output_data` (`src/lib/serializable.ts:82`). 25 rows per page (`AGENT_HISTORY_LIMIT = 25`) of **full AI run input and output payloads**. The summary shape already exists 60 lines above in the same file — `AgentRunSummary` (`agent-workspaces.ts:23`), 10 columns, used by `loadAgentDirectoryRead` and `loadAiReviewRead`. This is the single clearest "summary would do" case.
3. **`listAgentRuns` / `listRecentAgentRuns`** (`src/server/repositories/agent-runs.ts:27,40`) — `select *`, `limit 200` / `limit 50`, full payloads.
4. **`loadAiReviewRead`** (`agent-workspaces.ts:161`) — asymmetric: the runs half uses the column list, the approvals half is `select * from human_approvals … limit 100` including full `context_data`.
5. **Unbounded account-scoped lists** feeding the Company Workspace sections (`src/server/company-workspace/loaders.ts:82–108`). None of these has a `LIMIT`: `listClients` (`clients.ts:87`), `listLeads` (`leads.ts:66`), `listQuotes` (`quotes.ts:108`, **`select *` incl. `line_items`**), `listTasks` (`tasks.ts:47`), `listJobSheets` (`job-sheets.ts:137`), `listRelationshipSignals` (`relationship-signals.ts:17`), `listEngagementsByClientIds` (`engagements.ts:22`), `listAccountContacts` (`account-contacts.ts:45`). Paginated twins exist for most (`listClientsPage`, `listLeadsPage`, `listQuotesPage`, `listJobSheetsPage`) and are not used here.
6. **Commercial section batching is guarded, but is a second round trip.** `loaders.ts:83–88` runs `listClients`/`listLeads`/`listQuotes` in parallel, then **awaits** `listEngagementsByClientIds(clients.map(c => c.id))` sequentially. The batching itself is correct (`where client_id = any($1::uuid[])`) and is pinned by `src/server/company-workspace/__tests__/performance-contract.test.ts`, which asserts `listEngagementsByClientIds` is called exactly `MAX_ENGAGEMENT_QUERIES_PER_WORKSPACE` times for 25 clients and that `listEngagementsByClient` is never called. **This is the one N+1 in the app that is actively defended by a test.**
7. **Client-workspace `activity` section** (`src/server/read-models/client-workspace.ts:167–172`) — two **sequential** round trips: `listEngagementsByClient(clientId)` then `listActivityLogsByClientAndEngagementIds`. The second is properly batched (`any($2::uuid[])`, `limit 100`), but the round trips cannot overlap.
8. **`clients.ts` rollup subquery** — `ROLLUP_SELECT` (`clients.ts:~35–68`) left-joins a `select … from engagements where status='active' group by client_id` derived table with **no client filter pushed into it**. `getClient(id)` (`clients.ts:148`) therefore aggregates every active engagement in the database to fetch one client, and `listClientsPage` runs `select count(*) from (${scopedRollup}) scoped_clients` — the whole rollup, twice per page.
9. **`getLeadWorkspaceData`** (`src/server/repositories/leads.ts:177–186`) — correlated per-row subselect `(select count(*) from quote_line_items qli where qli.quote_id = q.id) as line_item_count`. One round trip, but per-row work in the DB; bounded to 25 quotes.
10. **`listRecentQuoteTemplates`** (`quote-templates.ts:41`) — `left join quotes q on q.quote_template_id = qt.id … group by qt.id order by max(q.created_at)`: joins the entire `quotes` table to order 10 templates.
11. **`loadReportDataset`** (`operations.ts:176`) — none of the five report queries has a `LIMIT`. All are `group by`, so bounded by the range in practice, but there is no ceiling in the SQL.

### Write path — genuine per-row loops (each iteration is a DB round trip)

| Location | Loop | Round trips |
|---|---|---|
| `quotes.ts:352` `replaceQuoteLineItems` | `for (const [index, item] of items.entries())` | 1 `insert … returning *` **per line item** (plus 1 delete). A quote with 40 lines = 41 round trips. |
| `relationship-signals.ts:176` `upsertRelationshipSignals` | `for (const draft of drafts)` | 1 upsert per draft |
| `approvals.ts:80` `createApproval` | `for (const userId of approverIds)` | 1 `createNotification` **per approver**, sequential |
| `campaign-follow-ups.ts:73` `createCampaignFollowUpTasks` | `for (const member of members)` | `createTask` + `update campaign_members` = **2 per member** |
| `client-import.ts:34` `commitClientImport` | `for (const row of rows)` | up to ~8 per row (client lookup, insert/update, contact lookup, contact insert, product lookup, profile lookup, engagement lookup, engagement insert). Memoized only on client id by dedupe key. |
| `event-import.ts:93` `commitEventImport` | `for (const row of input.rows)` | `createAccount` + `createAccountContact` + `createCampaignMember` per row |
| `job-sheets.ts:327` `saveJobSheetPortions` | `for (const {portion, current} of matched)` | 1 update/insert per portion |

All of these run inside a `transaction(...)`, so they are correct — but they scale linearly in round trips, and the import paths are the ones fed user-sized CSVs.

---

## D. Pagination — the shared contract

`src/server/repositories/pagination.ts` (32 lines, complete):

```ts
export type PaginationInput = { page?: number; limit?: number };
export type PaginatedResult<T> = { items: T[]; total: number; page: number; limit: number };
export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_LIMIT = 50;
export const MAX_PAGE_LIMIT = 100;
export function normalizePagination(input: PaginationInput = {}) { … return { page, limit, offset: (page - 1) * limit }; }
export function parseCount(row: { total: number | string } | null) { return Number(row?.total ?? 0); }
```

- `normalizePositiveInteger` coerces non-finite/non-number to the fallback, then `Math.max(1, Math.trunc(value))`. `limit` is then `Math.min(requestedLimit, MAX_PAGE_LIMIT)`. **There is no upper clamp on `page`** — a huge `page` yields a huge `offset` and an empty page (except `loadAgentHistoryPage`, which clamps to `lastPage` itself).
- `parseCount` exists because the driver returns `count(*)` as a string.

**Adopters (7 files, 9 call sites):** `accounts.ts:105` (`listAccountsPage`), `campaigns.ts:69` (`listCampaignsPage`) and `campaigns.ts:214` (`listCampaignAttendeeImportSection`), `clients.ts:123` (`listClientsPage`), `job-sheets.ts:163` (`listJobSheetsPage`), `leads.ts:96` (`listLeadsPage`), `quotes.ts:140` (`listQuotesPage`), `relationship-signals.ts:65` (`listRelationshipIndexPage`).

**Ordering contract:** `src/server/repositories/__tests__/pagination-order.test.ts` drives each `*Page` function and asserts the emitted SQL ends its `ORDER BY` in a unique column (`… , id desc`). Its header comment explains that the previous file-regex version could pass on a tie-breaker belonging to a different query. Covered: accounts, clients, leads, campaigns, quotes, job sheets.

**Five parallel pagination implementations that do NOT use the shared contract:**

| Where | Default | Max | Notes |
|---|---|---|---|
| `quotes.ts:440` `normalizeQuoteReferencePagination` | 25 | **25** | for `listQuoteReferencePage`; also adds `+1` to `total` when a pinned `selectedId` falls outside the search (`quotes.ts:583`) |
| `quote-versions.ts:81` `normalizeQuoteVersionPagination` | 25 | **25** | byte-identical logic to the above |
| `engagements.ts` `listRenewalsRead` | 25 | **50** | inline in the function body |
| `src/server-functions/agent-runs.ts:26` `normalizeAgentHistoryInput` | 25 | **25** (`AGENT_HISTORY_LIMIT`) | normalization lives in the server-function layer, not the repository |
| `admin-users.ts:221` and `admin-access.ts` | 50 / — | 100 | inline `Math.min(100, Math.max(1, Math.trunc(…)))` |

`PaginatedResult<T>` is additionally **re-declared verbatim, twice**, as `Paginated<T>` at `admin-access.ts:72` and `admin-users.ts:96` — identical `{items, total, page, limit}` shape, no import of the shared type.

`MAX_PAGE_LIMIT` and `DEFAULT_PAGE_LIMIT` are referenced **nowhere outside `pagination.ts` itself** — no route or server function reads them to bound a URL parameter.

---

## E. Supabase — exact remaining surface

### The repo-wide grep result

`import … from "@/legacy-supabase/server"` or `@supabase/*`, across all of `src/` (non-test):

```
src/legacy-supabase/server.ts:1              import { createServerClient } from "@supabase/ssr";
src/server/auth/resource-ownership.ts:1      import { createSupabaseServerClient } from "@/legacy-supabase/server";
src/server/repositories/automation-playbooks.ts:1  "
src/server/repositories/customer-success.ts:1      "
src/server/repositories/deals.ts:1                 "
src/server/repositories/engagement-events.ts:1     "
src/server/repositories/projects.ts:1              "
```

Test files that `vi.mock("@/legacy-supabase/server")`: `src/server/auth/__tests__/authorization.test.ts:15`, `src/server/repositories/__tests__/deals.test.ts:13`, plus `src/server/auth/__tests__/resource-ownership.integration.test.ts`.

**`src/server/repositories/supabase-writes.ts` contains NO Supabase import.** It is a pure-helper module — `pickColumns(source, columns)` (a write-column allowlist, keyed on `!== undefined` so an explicit `null` writes and an absent key is skipped) and `supabaseOperationFailed(description, cause)` (returns `new Error(\`Could not ${description}\`, {cause})` so PostgREST's table/column names stay off the response body). Its doc comment references `src/server/auth/resource-ownership.ts` as the pattern it copies — that reference is a comment, not an import.

**`src/legacy-supabase/`** holds exactly two files: `server.ts` (35 lines — `createSupabaseServerClient()` cookie-backed and `createSupabaseServiceClient()` service-role, both throwing on missing env) and `README.md` (lists the Mini-CRM paths that must stay Supabase-free, states the exit criteria: port the remaining server-functions to Neon, drop route-level imports, remove the packages).

### What still uses Supabase, and for what

**1. Five quarantined repositories** — tables live only in the Supabase project:

| Repository | Supabase tables touched |
|---|---|
| `deals.ts` | `deals`, `engagement_events`, `projects`, `tasks` |
| `projects.ts` | `projects`, `engagement_events`, `tasks`, `customer_success_profiles`, `deals` |
| `customer-success.ts` | `customer_success_profiles`, `success_touchpoints`, `projects`, `tasks` |
| `engagement-events.ts` | `engagement_events`, `campaign_members`, `channel_identities` |
| `automation-playbooks.ts` | `automation_playbooks`, `automation_runs` |

Reached by exactly one server-function module each — `src/server-functions/{deals,projects,customer-success,engagement-events,automation-playbooks}.ts` — which contain capability checks and nothing else (per the comment at `src/server/repositories/deals.ts:10`). **No file under `src/routes/`, `src/components/`, or `src/hooks/` imports any of those five server-function modules.** They are currently orphaned from the router.

**2. `src/server/auth/resource-ownership.ts` — the one on the hot path.** This is the important one for a frontend revision. It splits ownership resolution by store:
- `NEON_OWNERSHIP_QUERIES` (line 36): 14 resource types resolved in Neon — `account, client, lead, campaign, task, engagement, human_approval, quote, job_sheet, job_sheet_portion, account_contact, client_contact, touchpoint, relationship_signal`.
- `SUPABASE_OWNED_RESOURCE_TYPES` (line 66): 9 types resolved via `createSupabaseServerClient()` — `supabase_account, automation_playbook, automation_run, customer_success_profile, engagement_event, contact, channel_identity, deal, project`.

`resource-ownership.ts` is imported by `src/server/auth/authorization.server.ts`, which is imported by **~30 server-function modules** (accounts, admin-*, agent-runs, approvals, campaigns, clients, company-workspace, dashboard, engagements, job-sheets, leads, operations, products, …). The module-level Supabase import therefore sits behind almost every authorized read in the app — though `createSupabaseServerClient()` is only *called* when the resource type is one of the nine. `CLAUDE.md:103–108` states the consequence: without `SUPABASE_URL`/`SUPABASE_ANON_KEY` at runtime, "every guarded deal / project / contact / customer-success / automation route answers 500 from inside the capability check rather than degrading."

**3. Packages** — `package.json:56–57`: `"@supabase/ssr": "^0.10.3"`, `"@supabase/supabase-js": "^2.106.1"`.

**4. Non-runtime** — `supabase/migrations/{001_schema,002_rls,003_seed,004_lifecycle_crm}.sql` and `supabase/config.toml` (frozen legacy; `CLAUDE.md:87`: "New DB work goes in `neon/migrations/`"). `scripts/clientops/measure-supabase-surface.ts` is a **read-only** Phase-0 measurement tool (its own header: every call is a `select`, no DDL, safe against production) with unit coverage at `src/lib/__tests__/measure-supabase-surface.test.ts`. Env templates: `.env.example:13–16`, `.env.local.example:19–22`. `docs/frontend-revision/execution-plan.md` also mentions Supabase.

### Bottom line for the "no NEW Supabase imports" gate

A repo-wide grep on `@/legacy-supabase` / `@supabase/` should return exactly **6 non-test source files** (`src/legacy-supabase/server.ts` + the 5 repositories + `resource-ownership.ts` = 7 including the quarantine file itself), 3 test files that mock it, `package.json`, `bun.lock`, the two `.env` examples, the measurement script + its test, `CLAUDE.md`, `docs/frontend-revision/execution-plan.md`, and the `supabase/` migration directory. **`supabase-writes.ts` will not appear in an import grep and should not be flagged.** Anything else is new.

---

## F. `quotes.account_id` — canonical FK, but unpopulated by the app

**Verdict: `quotes` has a real, canonical `account_id` foreign key to `accounts(id)`, indexed. There is NO company-name string matching between quotes and accounts anywhere in the codebase. However, neither of the two application write paths that create a quote ever sets `account_id` — only the seed script does. Every account-scoped quote read filters on `account_id`, so for real data those reads return nothing.**

### The schema says canonical

`neon/migrations/003_client_relationship_360.sql:105`:
```sql
alter table quotes add column if not exists account_id uuid references accounts(id) on delete set null;
```
and the guarded constraint at lines 138–150:
```sql
    alter table quotes
      add constraint quotes_account_id_fkey
      foreign key (account_id) references accounts(id) on delete set null
      not valid;
```
`neon/migrations/004_clientops_schema_hardening.sql:13,33`:
```sql
alter table quotes add column if not exists account_id uuid;
create index if not exists quotes_account_id_idx on quotes(account_id);
```
Type side: `src/lib/types.ts:229` — `account_id: string | null;` on `interface Quote`.

### Every read filters on it

`src/server/repositories/company-workspace.ts:27` (the account overview metric):
```sql
(select count(*)::int from quotes where account_id = $1) as quote_count,
```
`src/server/repositories/company-workspace.ts:44` (quote totals by currency):
```sql
select currency, count(*)::int as quote_count, coalesce(sum(total_value), 0)::float8 as total_value
from quotes
where account_id = $1
group by currency
```
`src/server/repositories/account-timeline.ts:75` (Activity tab):
```ts
query<Quote>("select * from quotes where account_id = $1 order by created_at desc limit 100", [accountId]),
```
`src/server/company-workspace/loaders.ts:86` (Commercial section): `listQuotes({ account_id: accountId })`, which lands on the `["account_id", filters.account_id]` filter at `src/server/repositories/quotes.ts:113`.

Authorization uses it too — `src/server/auth/resource-ownership.ts:44`:
```sql
select coalesce(q.created_by, a.account_owner) as owner_profile_id
from quotes q left join accounts a on a.id = q.account_id where q.id = $1
```

### But nothing writes it

The column is accepted throughout the write layer: `CreateQuoteInput` includes `account_id` (`quotes.ts:30–49`), the INSERT binds it as `$5` (`quotes.ts:244–256`), and it is in `editableQuoteUpdateColumns` (`quotes.ts:64`). Yet only two call sites of `createQuote` exist in `src/`:

**(a) The quote-create UI — `src/routes/quotes.new.tsx:240–255`.** The payload is enumerated in full and contains no `account_id`:
```ts
const payload = {
  lead_id: mode === "lead" ? leadId || null : null,
  client_id: mode === "client" ? clientId || null : null,
  currency: "HKD",
  valid_until: validUntil,
  quote_template_id: quoteTemplateId || null,
  cover_text: documentDraft.cover_text,
  assumptions: documentDraft.assumptions,
  payment_terms: documentDraft.payment_terms,
  document_sections: documentDraft.document_sections,
  line_items: pricedItems.map(({ id: _id, ...rest }) => ({ id: _id, ...rest })),
  total_value: total,
} satisfies CreateQuoteInput;

const quote = await createQuote({ data: payload });
```

**(b) The draft-quote agent writeback — `src/server/workflows/writebacks.ts:336–346`.** Also no `account_id`:
```ts
const quote = await createQuote(
  {
    lead_id: payload.lead_id,
    number: payload.quote.number ?? null,
    currency: payload.quote.currency,
    total_value: payload.quote.total_value,
    valid_until: payload.quote.valid_until ?? null,
    line_items: payload.quote.line_items,
  },
  db,
);
```

The server function in between (`src/server-functions/quotes.ts:105–111`) only adds `created_by`:
```ts
return createQuoteInNeon({ ...data, created_by: session.profile.id });
```

The only writer of `quotes.account_id` in the repository is `scripts/clientops/seed-smoke-data.ts:1004–1016`, whose INSERT column list includes `account_id`.

### There is no derivation and no backfill

- No `update quotes set account_id …` exists in `neon/migrations/` or `scripts/`.
- Nothing derives `quotes.account_id` from `clients.account_id` or `leads.account_id` on read or write — the account-scoped quote queries above have no `join clients` / `coalesce` fallback.
- No name matching: the only company-name matching in the codebase is `clients` dedupe by `trim(lower(company_name))` (`src/server/repositories/client-import.ts:45`) and account matching via `normalizeAccountName` during event import (`src/server/repositories/event-import.ts:94–105`). Neither touches `quotes`.
- `getQuoteWorkspaceDetail` (`quotes.ts:604`) resolves `client` and `lead` for a quote but never the account.

### Practical consequence for the frontend revision

On an account page (`/accounts/$id`) whose quotes were created through the app, `overview.quoteCount` is `0`, `overview.quoteTotals` is `[]`, the Commercial section's `quotes` array is empty (which makes `isEmptySection` report `"empty"`, not `"error"` — the UI shows an empty state, not a failure), and no quote entries appear in the Activity timeline. The link exists and is correct in the schema; it is simply never set. Fixing this is a **write-path** change (populate `account_id` at create time from the selected client/lead, plus a one-time backfill), not a read-path or UI change — but any account-page work that assumes quotes will render must account for it.