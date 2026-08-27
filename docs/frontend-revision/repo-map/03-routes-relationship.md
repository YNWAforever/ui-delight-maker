# Phase D Route Inventory — Relationship Spine

**Global facts verified across all 11 files:** `useMutation` appears **zero times** in `src/routes/**` (grep for `useMutation` and `useSuspenseQuery` across `src/routes/*.tsx` returns no hits). Every write in these routes is an imperative `await serverFn({ data })` inside an async handler, followed by manual `queryClient.invalidateQueries` / `router.invalidate`. No route file contains a capability or permission check — capability enforcement lives in the server functions (e.g. `requireCapabilitySet(["accounts.view"], …)` in `src/server-functions/client-workspace.ts:52`).

Supporting definitions used below:
- `routeQueryOptions` — `C:\Users\laich\Documents\FIMMICK ClientOps\ui-delight-maker\src\lib\route-query.ts` (thin `queryOptions` wrapper, defaults `staleTime: CRM_STALE_TIME_MS`).
- `crmQueryKeys` — `C:\Users\laich\Documents\FIMMICK ClientOps\ui-delight-maker\src\lib\query-keys.ts`. Factory shape: `all() => [route]`, `lists() => [route,"list"]`, `list(f) => [route,"list",normalized(f)]`, `detail(id) => [route,"detail",id]`, `section(id,section,f?) => [route,"detail",id,"section",section] (+ normalized filters)`. Special: `companyWorkspace.section(accountId, section) => ["company-workspace", accountId, section]`, `shell() => ["shell"]`.

---

## 1. `src\routes\accounts.tsx`

- **Route path registered:** `/accounts` — `createFileRoute("/accounts")` (line 26). Layout-style route: `AccountsRoute` returns `<Outlet />` unless `useIsExactPath("/accounts")`.
- **Line count:** 356
- **validateSearch:** `companiesSearchSchema` (from `@/lib/admin-ux-search`). Shape (`src\lib\admin-ux-search.ts:121`): `{ lifecycle: enum(ACCOUNT_LIFECYCLE_STAGES).optional, sort: enum(COMPANY_SORT_KEYS).optional, account: optionalSearchString, page: coerce.number.int.min(1).default(1), limit: coerce.number.int.min(1).max(100).default(50) }.passthrough()`. `COMPANY_SORT_KEYS = ["last_activity_at:desc","name:asc","relationship_health:asc","relationship_health:desc"]`.
- **loaderDeps:** `({ search }) => ({ search })`
- **Loader (lines 29–38):** `context.queryClient.ensureQueryData(routeQueryOptions({...}))` calling `getAccountsIndexRead({ data: { lifecycle_stage: search.lifecycle, page: search.page, limit: search.limit } })`.
- **routeQueryOptions / query keys (verbatim):**
  - loader: `queryKey: crmQueryKeys.accounts.list(search)`
  - invalidation: `queryKey: crmQueryKeys.accounts.list(search)` with `exact: true`
  - invalidation: `queryKey: crmQueryKeys.shell()` with `exact: true`
  - **No `useQuery` in this file** — the preview panel is fed by a raw `useEffect` + `Promise.all` (lines 138–161), uncached and outside React Query.
- **Server functions imported:**
  - `getCompanyWorkspaceCore` from `@/server-functions/company-workspace`
  - `getClientsPage` from `@/server-functions/clients`
  - `getAccountsIndexRead` from `@/server-functions/accounts-index`
  - `togglePersonalWorkspaceFavorite` from `@/server-functions/workspace-preferences`
- **Mutations (no `useMutation`; imperative, lines 326–352):** `onToggleFavorite` → `await togglePersonalWorkspaceFavorite({ data: { kind: "account", label: selectedSummary.displayName, href: \`/accounts/${selectedSummary.id}\`, accountId: selectedSummary.id } })`, then invalidates:
  ```ts
  queryClient.invalidateQueries({ queryKey: crmQueryKeys.accounts.list(search), exact: true }),
  queryClient.invalidateQueries({ queryKey: crmQueryKeys.shell(), exact: true }),
  ```
  followed by `await router.invalidate({ filter: (match) => match.routeId === "__root__" || match.routeId === "/accounts" })`.
- **Capability / permission checks:** absent.
- **Controls that do NOT reach a server function:**
  - `onChange` on `<select id="account-lifecycle">` (line 197) and `<select id="account-sort">` (line 231) — navigate search only; lifecycle does re-run the loader (server), **sort does not** (sorting is done client-side in `useMemo` at lines 87–107, over the current page only).
  - `WorkspaceViewSwitcher onSelect` (line 258): `setSavedViewConfig(config);` + `navigate({...})` — local state only in this file (the switcher's own "Save view" button calls `savePersonalWorkspaceView`, in `src/components/relationship/workspace-view-switcher.tsx:45`).
  - Card button `onClick={() => navigate({ search: (current) => ({ ...current, account: account.id }) })}` (line 293) — search-param only; the resulting fetch is the raw `useEffect`, not a query.
  - `onRetry={() => setRetryKey((value) => value + 1)}` (line 324) — bumps local state which re-triggers the `useEffect` fetch (indirect).

---

## 2. `src\routes\accounts.$id.tsx`

- **Route path registered:** `/accounts/$id` — `createFileRoute("/accounts/$id")` (line 44).
- **Line count:** 833
- **validateSearch:** `accountDetailSearchSchema` — `z.object({ tab: z.enum(ACCOUNT_DETAIL_TABS).optional().catch(undefined) }).passthrough()`; `ACCOUNT_DETAIL_TABS = ["overview","stakeholders","timeline","events","tasks"]`.
- **Loader (line 46):** direct server call, **not** through `queryClient.ensureQueryData`:
  `loader: ({ params }) => getCompanyWorkspaceRead({ data: { accountId: params.id, sections: [] } })`
- **Queries and keys (verbatim):**
  - `const overviewQueryKey = companyWorkspaceQueryKey(accountId, "overview");` → resolves to `["company-workspace", accountId, "overview"]` (`src\lib\company-workspace\invalidation.ts:15`).
  - `useQuery({ queryKey: overviewQueryKey, queryFn: async () => { const next = await getCompanyWorkspaceRead({ data: { accountId, sections: [] } }); … } , initialData: initialRead, staleTime: COMPANY_WORKSPACE_STALE_TIME_MS, refetchOnWindowFocus: true })` (lines 58–71).
  - Three section queries via the hook `useCompanyWorkspaceSection(account.id, <section>, { enabled: … })` — `"commercial"`, `"delivery_finance"`, `"activity"`. The hook (`src\hooks\use-company-workspace-section.ts:22`) uses `const queryKey = companyWorkspaceQueryKey(accountId, section);` and calls `getCompanyWorkspaceSection({ data: { accountId, section } })`, `staleTime: 30_000`, `retry: false`, one manual 250 ms retry on retryable errors.
  - Enablement gated by `getCompanyWorkspaceSectionEnablement(search.tab ?? "overview")` (line 76).
- **Server functions imported:**
  - `triggerRelationshipIntelligence` from `@/server-functions/accounts`
  - `getCompanyWorkspaceRead` from `@/server-functions/company-workspace`
  - `dismissRelationshipSignalFn` from `@/server-functions/relationship-signals`
  - (indirectly `getCompanyWorkspaceSection` via `useCompanyWorkspaceSection`)
- **Mutations (imperative):**
  1. `dismissSignal` (lines 119–154): `await dismissRelationshipSignalFn({ data: { id: signal.id, reason: reason.trim() } })` → `void invalidateCompanyWorkspaceMutation(queryClient, account.id, "dismiss_relationship_signal")`. That helper invalidates `["company-workspace", accountId, "overview"]` and `["company-workspace", accountId, "intelligence"]` with `{ queryKey, exact: true, refetchType: "active" }`.
  2. `runRelationshipIntelligence` (lines 156–188): `await triggerRelationshipIntelligence({ data: { accountId: account.id } })` → on `result.triggered`, `void invalidateCompanyWorkspaceMutation(queryClient, account.id, "run_relationship_intelligence")` (same two keys).
- **Capability / permission checks:** absent in file (server-side only).
- **Controls that do NOT reach a server function:**
  - `<Tabs … onValueChange={(tab) => navigate({ search: … , replace: true })}` (lines 274–282) — URL-only, but it flips section-query `enabled` flags, so it indirectly triggers server reads.
  - `onClick={() => onStartDismiss(signal)}` / `onCancelDismiss` / the reason `<Input onChange>` (lines 794, 810, 822) — local dismiss-form state only.
  - Every `onRetry={() => void <query>.refetch()}` reaches the server via React Query.
  - Note the leads/quotes links in `CommercialList` use raw anchors: `<a className="font-medium hover:underline" href={item.href}>` (line 740) — full page loads instead of `<Link>`.

---

## 3. `src\routes\clients.tsx`

- **Route path registered:** `/clients` — `createFileRoute("/clients")` (line 56). Layout route: renders `<Outlet />` unless `useIsExactPath("/clients")`.
- **Line count:** 442
- **validateSearch:** locally defined `clientListSearchSchema` (lines 50–54):
  ```ts
  const clientListSearchSchema = z.object({
    page: z.coerce.number().int().min(1).default(1).catch(1),
    limit: z.coerce.number().int().min(1).max(100).default(50).catch(50),
    tier: z.string().trim().min(1).optional().catch(undefined),
  });
  ```
- **loaderDeps:** `({ search }) => ({ search })`
- **Loader (lines 59–65):** `context.queryClient.ensureQueryData(routeQueryOptions({ queryKey: crmQueryKeys.clients.list(search), queryFn: () => getClientsPage({ data: search }) }))`
- **Query keys (verbatim):**
  - loader: `queryKey: crmQueryKeys.clients.list(search)`
  - invalidation: `queryKey: crmQueryKeys.clients.lists()`
  - **No `useQuery` in this file** — the table renders from `Route.useLoaderData()` mirrored into local `useState` (`const [rows, setRows] = useState<ClientRow[]>(loaderClients);`, line 105).
- **Server functions imported:** `getClientsPage`, `createClient` — both from `@/server-functions/clients`.
- **Mutation (imperative, lines 150–161):** `NewClientDialog onCreate` → `const created = await createClient({ data: c });` then `setRows(...)`, then:
  ```ts
  await queryClient.invalidateQueries({
    queryKey: crmQueryKeys.clients.lists(),
  });
  await router.invalidate({
    filter: (match) => match.routeId === "/clients",
  });
  ```
  then `toast.success(\`Created client ${created.company_name}\`)`.
- **Capability / permission checks:** absent.
- **Controls that do NOT reach a server function:**
  - `<Select value={riskFilter} onValueChange={(v) => setRiskFilter(v as typeof riskFilter)}>` (line 223) — client-side only, filters the loaded page.
  - `<Select value={windowFilter} onValueChange={(v) => setWindowFilter(v as typeof windowFilter)}>` (line 236) — client-side only.
  - `<Select value={sortKey} onValueChange={(v) => setSortKey(v as typeof sortKey)}>` (line 249) — client-side sort of the current page only.
  - `onClick={() => { setTier("all"); setRiskFilter("all"); setWindowFilter("all"); }}` (lines 327–331) — "Clear filters"; only the tier part touches the URL/loader.
  - Tier `<Select>` (line 202) and `ListPagination onPageChange` (line 173) **do** reach the server (loader re-runs).

---

## 4. `src\routes\clients.$id.tsx`

- **Route path registered:** `/clients/$id` — `createFileRoute("/clients/$id")` (line 38). Has a `notFoundComponent`.
- **Line count:** 702
- **validateSearch:** `clientDetailSearchSchema` — `z.object({ tab: z.enum(CLIENT_DETAIL_TABS).optional().catch(undefined) }).passthrough()`; `CLIENT_DETAIL_TABS = ["overview","contacts","engagements","quotes","job-sheets","tasks","timeline"]`.
- **Loader (line 40):** direct call, not via `ensureQueryData`:
  `loader: ({ params }) => getClientWorkspaceRead({ data: { clientId: params.id } })`
- **Queries and keys (verbatim):**
  - `useClientWorkspaceSection(clientId, "contacts", { enabled: activeTab === "contacts" })`
  - `useClientWorkspaceSection(clientId, "commercial", { enabled: activeTab === "quotes" })`
  - `useClientWorkspaceSection(clientId, "engagements", { enabled: activeTab === "engagements" })`
  - `useClientWorkspaceSection(clientId, "job_sheets", { enabled: activeTab === "job-sheets" })`
  - `useClientWorkspaceSection(clientId, "activity", { enabled: activeTab === "timeline" })`
    → hook key (`src\hooks\use-client-workspace-section.ts:43`): `const queryKey = crmQueryKeys.clients.section(clientId, section);`, calls `getClientWorkspaceSection({ data: { clientId, section } })`, `enabled: Boolean(clientId) && options.enabled === true`.
  - `useQuery({ queryKey: crmQueryKeys.products.list({ activeOnly: true }), queryFn: () => getProducts({ data: { activeOnly: true } }), enabled: activeTab === "engagements", staleTime: 5 * 60_000 })` (lines 77–82)
  - `useQuery({ queryKey: crmQueryKeys.tasks.list({ client_id: clientId }), queryFn: () => getTasks({ data: { client_id: clientId } }), enabled: activeTab === "tasks", staleTime: 60_000 })` (lines 86–91)
  - `useQuery({ queryKey: crmQueryKeys.clients.section(clientId, "touchpoints"), queryFn: () => getTouchpointsByClient({ data: { clientId } }), enabled: activeTab === "timeline", staleTime: 60_000 })` (lines 92–97)
- **Server functions imported:**
  - `createClientContact`, `deleteClientContact` from `@/server-functions/client-contacts`
  - `getTouchpointsByClient` from `@/server-functions/touchpoints`
  - `getTasks` from `@/server-functions/tasks`
  - `getProducts` from `@/server-functions/products`
  - `getClientWorkspaceRead` from `@/server-functions/client-workspace`
  - (indirectly `getClientWorkspaceSection` via the hook)
- **Mutations (imperative, in `ClientContactsPanel`):**
  1. `create` (lines 483–495): `await createClientContact({ data: { client_id: clientId, name: name || "Unnamed", title, email, phone } })` → `await refreshContacts()`.
  2. `remove` (lines 497–501): `await deleteClientContact({ data: { id } })` → `await refreshContacts()`.
  - Shared invalidation (lines 478–481, verbatim):
    ```ts
    const refreshContacts = () =>
      queryClient.invalidateQueries({
        queryKey: crmQueryKeys.clients.section(clientId, "contacts"),
      });
    ```
- **Capability / permission checks:** none executed in the file, but the file *renders* the server's capability outcome: `function formatWorkspaceCount(count: number | null) { return count === null ? "Restricted" : String(count); }` (line 417–419) and `CountedTabLabel` (line 421). Nulls come from `getClientWorkspaceRead`, which derives per-section visibility from `requireCapabilitySet(["accounts.view"], { optional: ["contacts.view","engagements.view","quotes.view","job_sheets.view"] })`. The tabs remain clickable when restricted; the section query then errors into `DeferredTab`'s "Client details are temporarily unavailable."
- **Controls that do NOT reach a server function:**
  - `<Tabs … onValueChange={(tab) => navigate({ search: … , replace: true })}` (lines 163–171) — URL-only, but flips `enabled` on the section queries (indirect server read).
  - All `onRetry` handlers call `.refetch()` (server).
  - Dialog field `onChange` handlers (lines 525, 538, 553, 567) — local form state, as expected.

---

## 5. `src\routes\clients.import.tsx`

- **Route path registered:** `/clients/import` — `createFileRoute("/clients/import")` (line 20). Renders inside the `/clients` layout `<Outlet />`.
- **Line count:** 163
- **Loader:** **absent.** Route options are only `head` and `component`.
- **validateSearch:** absent.
- **routeQueryOptions / useQuery / useSuspenseQuery:** **absent** — no React Query usage at all; everything is local `useState`.
- **Server functions imported:** `commitClientImportFn`, `validateClientImportRows` — both from `@/server-functions/client-import`.
- **Mutations (imperative, no `useMutation`, no invalidation anywhere):**
  1. `onFile` (lines 37–52): `parseClientImportCsv(text)` locally, then `const result = await validateClientImportRows({ data: { rows: parsed } });`
  2. `commit` (lines 54–65): `const result = await commitClientImportFn({ data: { rows: valid } });` → sets local summary + toast. **No `queryClient.invalidateQueries` and no `router.invalidate`** — after a successful import the `/clients` list cache and loader data are left stale.
- **Capability / permission checks:** absent.
- **Controls that do NOT reach a server function:** none of the buttons are dead; both the file `<input type="file" … onChange>` (line 95) and the commit `<Button onClick={commit} …>` (line 141) hit server functions. The only local-only interaction is the file picker label.

---

## 6. `src\routes\relationships.tsx`

- **Route path registered:** `/relationships` — `createFileRoute("/relationships")` (line 15).
- **Line count:** 95
- **validateSearch:** **absent** — pagination is `useState`, not URL state (`const [relationshipPage, setRelationshipPage] = useState(1);`, line 26). No `loaderDeps`.
- **Loader (line 16):** direct call, not via `ensureQueryData`, and it always fetches page 1:
  `loader: () => getRelationshipIndexRead({ data: initialRelationshipFilters })` where `const initialRelationshipFilters = { page: 1, limit: RELATIONSHIP_PAGE_SIZE } as const;` (`RELATIONSHIP_PAGE_SIZE = 50`).
- **Query (verbatim, lines 28–34):**
  ```ts
  const relationshipQuery = useQuery({
    queryKey: crmQueryKeys.relationships.list(relationshipFilters),
    queryFn: () => getRelationshipIndexRead({ data: relationshipFilters }),
    initialData: relationshipPage === 1 ? initialRead : undefined,
    placeholderData: (previousData) => previousData,
    staleTime: 30_000,
  });
  ```
- **Server functions imported:** `getRelationshipIndexRead` from `@/server-functions/relationship-workspaces`.
- **Mutations in this file:** none. It exposes an invalidation callback only (lines 44–46, verbatim):
  ```ts
  const refreshAfterDismiss = () => {
    void queryClient.invalidateQueries({ queryKey: crmQueryKeys.relationships.lists() });
  };
  ```
  The actual dismiss write happens in `src/components/relationship/relationship-command-center.tsx`, which imports `dismissRelationshipSignalFn` from `@/server-functions/relationship-signals` and calls `onDismissed?.()` afterwards.
- **Capability / permission checks:** absent.
- **Controls that do NOT reach a server function:** none dead — both pager buttons drive the query:
  - `onClick={() => setRelationshipPage((page) => Math.max(1, page - 1))}` (line 77)
  - `onClick={() => setRelationshipPage((page) => Math.min(totalPages, page + 1))}` (line 86)
  These change the query key, so they do fetch; the page number is just not reflected in the URL.

---

## 7. `src\routes\renewals.tsx`

- **Route path registered:** `/renewals` — `createFileRoute("/renewals")` (line 63).
- **Line count:** 276
- **validateSearch:** locally defined `renewalSearchSchema` (lines 55–61):
  ```ts
  const renewalSearchSchema = z.object({
    risk: z.enum(["all", "high", "medium", "low"]).default("all").catch("all"),
    productId: z.string().default("all").catch("all"),
    renewalWindow: z.enum(["all", "overdue", "30", "60", "90", "later"]).default("all").catch("all"),
    page: z.coerce.number().int().min(1).default(1).catch(1),
    limit: z.coerce.number().int().min(1).max(50).default(50).catch(50),
  });
  ```
- **loaderDeps (lines 65–71):** `({ search }) => ({ risk: search.risk, productId: search.productId, renewalWindow: search.renewalWindow, page: search.page, limit: 50 })` — note `limit` is hard-coded to 50, so the `limit` search param never reaches the server.
- **Loader (lines 72–78):** `context.queryClient.ensureQueryData(routeQueryOptions({ queryKey: crmQueryKeys.renewals.list(deps), queryFn: () => getRenewalsRead({ data: deps }) }))`
- **Query keys (verbatim):** `queryKey: crmQueryKeys.renewals.list(deps)` — loader only. **No `useQuery` in this file.**
- **Server functions imported:** `getRenewalsRead` from `@/server-functions/operations`.
- **Mutations:** **none in this file**, and no `invalidateQueries` calls. Writes are delegated to `RenewalsPreviewPanel` (`src/components/renewals/renewals-preview-panel.tsx`), which imports `triggerRiskScoreAgent` and `getEngagementsByClient` from `@/server-functions/engagements` and `getClientContacts` from `@/server-functions/client-contacts`, and owns its own `invalidateRenewalMutation` calls.
- **Capability / permission checks:** absent.
- **Type note:** `const renewalRead = Route.useLoaderData() as unknown as RenewalsView;` (line 92) — a double cast that erases the loader's real return type.
- **Controls that do NOT reach a server function:**
  - `<RenewalCard … onSelect={() => setSelectedId(engagement.id)} />` (line 262) — local selection only.
  - `<RenewalsPreviewPanel engagement={selected} onClose={() => setSelectedId(null)} />` (line 273) — local.
  - The three `<Select>` filters and both pager buttons write to search → loader re-runs (server).

---

## 8. `src\routes\tasks.tsx`

- **Route path registered:** `/tasks` — `createFileRoute("/tasks")` (line 51).
- **Line count:** 453
- **validateSearch:** locally defined `taskSearchSchema` (lines 40–43):
  ```ts
  const taskSearchSchema = z.object({
    priority: z.enum(["all", "high", "medium", "low"]).default("all").catch("all"),
    assignee: z.string().default("all").catch("all"),
  });
  ```
- **loaderDeps:** `({ search }) => ({ priority: search.priority, assignee: search.assignee })`
- **Loader (lines 57–63):** `context.queryClient.ensureQueryData(routeQueryOptions({ queryKey: crmQueryKeys.tasks.list(deps), queryFn: () => getTasks({ data: getTaskReadInput(deps) }) }))`
- **Queries and keys (verbatim):**
  - `const tasksQueryKey = crmQueryKeys.tasks.list(filters);` (line 98)
  - ```ts
    const tasksQuery = useQuery({
      ...routeQueryOptions({
        queryKey: tasksQueryKey,
        queryFn: () => getTasks({ data: getTaskReadInput(filters) }),
      }),
      initialData: loaderTasks,
    });
    ```
    (lines 99–105)
  - Loader key uses `deps` (`{priority, assignee}`); component key uses `filters` (`Route.useSearch()`) — same normalized shape.
- **Server functions imported:** `getTasks`, `createTask`, `updateTask` — all from `@/server-functions/tasks`.
- **Mutations (imperative, optimistic):**
  1. `move` (lines 129–163) → `await updateTask({ data: { id, updates: { status } } })`. Before the call:
     ```ts
     await queryClient.cancelQueries({ queryKey: crmQueryKeys.tasks.lists() });
     queryClient.setQueriesData<Task[]>({ queryKey: crmQueryKeys.tasks.lists() }, (current) =>
       current ? replaceOnlyTaskStatus(current, id, status) : current,
     );
     ```
     On failure it rolls back with the same `setQueriesData({ queryKey: crmQueryKeys.tasks.lists() }, …)` restoring `previousStatus` and toasts `"Task move failed. Try again."`. On success:
     ```ts
     await Promise.all([
       queryClient.invalidateQueries({
         queryKey: crmQueryKeys.tasks.detail(id),
         exact: true,
       }),
       queryClient.invalidateQueries({ queryKey: crmQueryKeys.tasks.lists() }),
     ]);
     ```
     with a `catch` toasting `"Task saved, but the board could not refresh."`
  2. `NewTaskDialog onCreate` (lines 172–180) → `const created = await createTask({ data: t });` then
     ```ts
     queryClient.setQueryData<Task[]>(tasksQueryKey, (current) => [
       created,
       ...(current ?? []),
     ]);
     await queryClient.invalidateQueries({ queryKey: crmQueryKeys.tasks.lists() });
     ```
- **Capability / permission checks:** absent.
- **Controls that do NOT reach a server function:** none dead. Both `<Select>` filters write to search → loader + query re-run; drag-drop (`onDrop` line 240) and keyboard `ArrowLeft`/`ArrowRight` (line 269–276) both funnel into `move()` → `updateTask`.
  - Minor: `const filtered = useMemo(() => rows, [rows]);` (line 117) is an identity memo — filtering is fully server-side, so `${filtered.length} of ${rows.length} tasks` (line 169) always prints identical numbers.

---

## 9. `src\routes\campaigns.tsx`

- **Route path registered:** `/campaigns` — `createFileRoute("/campaigns")` (line 44). Layout route: `<Outlet />` unless `useIsExactPath("/campaigns")`.
- **Line count:** 358
- **validateSearch:** locally defined `campaignListSearchSchema` (lines 36–42):
  ```ts
  const campaignListSearchSchema = z.object({
    page: z.coerce.number().int().min(1).default(1).catch(1),
    limit: z.coerce.number().int().min(1).max(100).default(50).catch(50),
    status: z.string().trim().min(1).optional().catch(undefined),
    type: z.string().trim().min(1).optional().catch(undefined),
    owner: z.string().trim().min(1).optional().catch(undefined),
  });
  ```
  **`status`, `type` and `owner` have no UI control anywhere in the file** — they are accepted and passed to the server but unreachable from the page.
- **loaderDeps:** `({ search }) => ({ search })`
- **Loader (lines 47–54):** returns an object wrapper:
  ```ts
  loader: async ({ context, deps: { search } }) => ({
    campaignPage: await context.queryClient.ensureQueryData(
      routeQueryOptions({
        queryKey: crmQueryKeys.campaigns.list(search),
        queryFn: () => getCampaignsPage({ data: search }),
      }),
    ),
  }),
  ```
- **Query keys (verbatim):** `queryKey: crmQueryKeys.campaigns.list(search)` — loader only. **No `useQuery` in this file.**
- **Server functions imported:** `createCampaign`, `getCampaignsPage` — both from `@/server-functions/campaigns`.
- **Mutation (imperative, lines 77–82):**
  ```ts
  const create = async (payload: CreateCampaignPayload) => {
    const campaign = await createCampaign({ data: payload });
    toast.success("Campaign created.");
    setNewCampaignOpen(false);
    navigate({ to: "/campaigns/$id", params: { id: campaign.id } });
  };
  ```
  **Invalidates nothing** — no `queryClient` is even instantiated in this file, so `crmQueryKeys.campaigns.list(...)` stays stale after a create (masked because it navigates away to the detail route).
- **Capability / permission checks:** absent.
- **Controls that do NOT reach a server function:**
  - The whole status/type/owner search-param surface has no control at all (filters exist in the schema, not in the UI).
  - `ListPagination onPageChange` (line 106) and the campaign `<Link to="/campaigns/$id">` cards do reach the server.

---

## 10. `src\routes\campaigns.$id.tsx`

- **Route path registered:** `/campaigns/$id` — `createFileRoute("/campaigns/$id")` (line 36).
- **Line count:** 387
- **validateSearch:** **absent** — attendee pagination is local state (`const [attendeePage, setAttendeePage] = useState(1);`, line 81).
- **Loader (line 37):** direct call, not via `ensureQueryData`:
  `loader: ({ params }) => getCampaignWorkspaceRead({ data: { id: params.id } })`
- **Queries and keys (verbatim):**
  - ```ts
    const workspaceQuery = useQuery({
      queryKey: crmQueryKeys.campaigns.detail(campaignId),
      queryFn: () => getCampaignWorkspaceRead({ data: { id: campaignId } }),
      initialData: initialRead,
      staleTime: 30_000,
    });
    ```
    (lines 73–78)
  - ```ts
    const attendeeQuery = useQuery({
      queryKey: crmQueryKeys.campaigns.section(campaign.id, "attendees", attendeeFilters),
      queryFn: () =>
        getCampaignWorkspaceSection({
          data: { campaignId: campaign.id, ...attendeeFilters },
        }),
      staleTime: 30_000,
      placeholderData: (previousData) => previousData,
    });
    ```
    (lines 83–91), with `const attendeeFilters = { page: attendeePage, limit: ATTENDEE_PAGE_SIZE };` and `ATTENDEE_PAGE_SIZE = 50`.
- **Server functions imported:**
  - `createCampaignFollowUpTasksFn` from `@/server-functions/campaigns`
  - `commitEventImportFn`, `validateEventImportRowsFn` from `@/server-functions/event-import`
  - `getCampaignWorkspaceRead`, `getCampaignWorkspaceSection` from `@/server-functions/relationship-workspaces`
- **Invalidation table (verbatim, lines 44–68):**
  ```ts
  const campaignMutationQueryKeys = {
    attendee_import: (campaignId: string) => [
      crmQueryKeys.campaigns.detail(campaignId),
      crmQueryKeys.campaigns.section(campaignId, "attendees"),
      crmQueryKeys.accounts.lists(),
      crmQueryKeys.contacts.lists(),
    ],
    follow_up_tasks: (campaignId: string) => [
      crmQueryKeys.campaigns.detail(campaignId),
      crmQueryKeys.campaigns.section(campaignId, "attendees"),
      crmQueryKeys.tasks.lists(),
    ],
  } as const;

  async function invalidateCampaignMutation(queryClient, campaignId, mutation) {
    await Promise.all(
      campaignMutationQueryKeys[mutation](campaignId).map((queryKey) =>
        queryClient.invalidateQueries({ queryKey }),
      ),
    );
  }
  ```
  Note the invalidation uses the **filterless** `campaigns.section(id, "attendees")` key (`["campaigns","detail",id,"section","attendees"]`) while the live query key includes filters (`[…,"attendees",{limit:50,page:n}]`) — prefix-matching makes this work.
- **Mutations (imperative):**
  1. `onFile` (lines 108–142): `const result = await validateEventImportRowsFn({ data: { rows: parsedRows } });` — read/validate only, no invalidation.
  2. `importRows` (lines 144–177): `const result = await commitEventImportFn({ data: { campaignId: campaign.id, rows } });` → on success `setAttendeePage(1); await invalidateCampaignMutation(queryClient, campaign.id, "attendee_import");`
  3. `createFollowUpTasks` (lines 179–197): `const result = await createCampaignFollowUpTasksFn({ data: { campaignId: campaign.id } });` → `await invalidateCampaignMutation(queryClient, campaign.id, "follow_up_tasks");`
- **Capability / permission checks:** absent.
- **Controls that do NOT reach a server function:**
  - `onClick={() => fileInputRef.current?.click()}` (line 288) — proxy click for the hidden `<input type="file">`; the input's `onChange` does call the server.
  - `onPageChange={setAttendeePage}` (line 258) — local state, but it changes the attendee query key, so it does refetch (page number just isn't in the URL).
  - `onRetry` → `void attendeeQuery.refetch()` (line 246) reaches the server.

---

## 11. `src\routes\account.tsx` — what this route actually is

**It is a real, authenticated, first-party route — not a redirect, not a stub, not an alias of `/accounts`.**

- **Route path registered:** `/account` (singular) — `createFileRoute("/account")` (line 25). It is a genuine entry in the generated tree: `src/routeTree.gen.ts:29` imports `Route as AccountRouteImport from './routes/account'`, and lines 148–149 register `id: '/account', path: '/account'`. It is distinct from `/accounts` and from the server route `/api/workflows/context/account` (`src/routes/api/workflows/context/account.ts`).
- **What it renders:** the signed-in user's own **self-service account settings** page — `<AccountSettings … />` from `@/components/account/account-settings`, covering profile, availability, app-session revocation, delegations, and access requests. It is a "my account" page, not a CRM object page.
- **Why it is absent from the 31-route inventory:** it has **no navigation entry anywhere** — `grep -rn 'to="/account"|href="/account"'` across `src/**/*.tsx` returns zero hits, so no sidebar or user-menu link points at it. Its only in-app entry point is a redirect from invite activation: `throw redirect({ href: "/account?welcome=1" });` at `src/routes/invite.$token.complete.tsx:16`. It is nonetheless tracked as a first-class route by the performance config: `{ id: "account", paths: ["/account"] }` in `src/lib/performance/route-performance.ts:65`.
- **Authentication:** enforced server-side. Every one of its server functions runs under the session guard — `getMyAccount` begins `const session = await requireNeonAuthSession();` (`src/server-functions/account.ts:93–94`), and the root route's `beforeLoad` additionally ensures `getAppShellRead()` (which calls `loadAuthenticatedShell`) for any non-public path.
- **Note it also accepts a `?welcome=1` param it never reads** — the route declares no `validateSearch` and never calls `Route.useSearch()`, so the invite redirect's `welcome=1` has no effect on the page.

Full inventory for it:

- **Line count:** 92
- **Loader (line 29):** `loader: ({ context }) => context.queryClient.ensureQueryData(accountQueryOptions())`, where (lines 17–23):
  ```ts
  const accountQueryKey = crmQueryKeys.account.detail("me");

  const accountQueryOptions = () =>
    routeQueryOptions({
      queryKey: accountQueryKey,
      queryFn: () => getMyAccount(),
    });
  ```
  `crmQueryKeys.account.detail("me")` resolves to `["account","detail","me"]` — a literal `"me"` id, not the real profile id.
- **Query (verbatim, lines 36–39):**
  ```ts
  const accountQuery = useQuery({
    ...accountQueryOptions(),
    initialData: loadedAccount,
  });
  ```
- **validateSearch:** absent.
- **Server functions imported (all from `@/server-functions/account`):** `cancelMyDelegation`, `createMyAccessRequest`, `createMyDelegation`, `getMyAccount`, `revokeMyAppSessions`, `updateMyAvailability`, `updateMyProfile`.
- **Mutations:** six, all routed through one imperative helper `runMutation` (lines 41–65) — no `useMutation`. Shared invalidation (verbatim):
  ```ts
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: accountQueryKey, exact: true }),
    ...(refreshShell
      ? [
          queryClient.invalidateQueries({
            queryKey: crmQueryKeys.shell(),
            exact: true,
          }),
        ]
      : []),
  ]);
  ```
  Wiring (lines 71–88):
  | Prop | Server function | Shell invalidated |
  |---|---|---|
  | `onUpdateProfile` | `updateMyProfile({ data: input })` | yes (`refreshShell = true`) |
  | `onUpdateAvailability` | `updateMyAvailability({ data: input })` | no |
  | `onRevokeSessions` | `revokeMyAppSessions({ data: {} })` | no |
  | `onCreateDelegation` | `createMyDelegation({ data: input })` | no |
  | `onCancelDelegation` | `cancelMyDelegation({ data: { id } })` | no |
  | `onCreateAccessRequest` | `createMyAccessRequest({ data: input })` | no |
- **Capability / permission checks:** none in the route file. Worth flagging for the revision project: `src/server-functions/account.ts:88–90` carries a self-documenting comment that this endpoint duplicates the admin schema and that `permissions.override` "stayed requestable here after being blocked there."
- **Controls that do NOT reach a server function:** none — every callback passed to `<AccountSettings>` invokes a server function.