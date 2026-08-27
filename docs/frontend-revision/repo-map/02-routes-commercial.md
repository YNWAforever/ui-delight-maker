I have everything verified. Here is the inventory.

---

# Route Inventory — Phase C Commercial Spine

All paths are absolute under `C:/Users/laich/Documents/FIMMICK ClientOps/ui-delight-maker/`.

**Global findings that apply to all ten files:**
- `useMutation` — **absent in all ten files.** Zero `useMutation` calls exist. Every write is a bare `await serverFn({ data })` inside an async handler, followed by manual `queryClient.invalidateQueries(...)` and/or `router.invalidate(...)`.
- `useSuspenseQuery` — **absent in all of `src/routes/`** (verified repo-wide under `src/routes`).
- Client-side capability / permission checks — **absent in all ten files.** No `beforeLoad` guard, no `requireCapability`, no role gate on any control. Enforcement lives entirely server-side: `src/server-functions/quotes.ts:2` imports `requireCapability` from `@/server/auth/authorization.server` and calls it per handler (e.g. `quotes.view`, `quotes.create`, `quotes.update`, `quotes.request_approval`, `agents.run`). The only role-shaped code in these routes is cosmetic filtering of a reviewer/approver `<Select>` list from the static `APP_USERS` array.

Key-shape reference (`src/lib/query-keys.ts`): every `crmQueryKeys.<ns>` is built by `createRouteQueryKeys(route)` → `all() = [route]`, `lists() = [route,"list"]`, `list(f) = [route,"list",normalized(f)]`, `detail(id) = [route,"detail",id]`, `section(id,s,f?) = [route,"detail",id,"section",s]` (+ normalized filters when `f` given). `crmQueryKeys.dashboard() = ["dashboard"]`.

---

## 1. `src/routes/index.tsx`

- **Route path registered:** `/` — `createFileRoute("/")` (line 39)
- **Line count:** 397
- **Loader:** yes.
  ```
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(
      routeQueryOptions({
        queryKey: crmQueryKeys.dashboard(),
        queryFn: () => getDashboardRead(),
      }),
    ),
  ```
  Note: `loaderDeps: ({ search }) => ({ search })` is declared (line 41) but the loader signature destructures only `{ context }` — the deps are computed and unused.
- **routeQueryOptions / useQuery / useSuspenseQuery:**
  - `routeQueryOptions` in the loader — key `crmQueryKeys.dashboard()`
  - No `useQuery` / `useSuspenseQuery` in the component. Data comes from `Route.useLoaderData()` (line 63).
- **Server functions imported:**
  - `getDashboardRead` from `@/server-functions/dashboard`
  - `moveLeadStage`, `triggerLeadAgent`, `triggerLeadReplyDraft` from `@/server-functions/leads`
  - `triggerQuoteAgent` from `@/server-functions/quotes`
  - `createTask` from `@/server-functions/tasks`
- **Mutations (all hand-rolled, no `useMutation`):** all funnel through one helper (lines 75–81):
  ```
  const refreshDashboard = async (...queryKeys: ReadonlyArray<readonly unknown[]>) => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: crmQueryKeys.dashboard(), exact: true }),
      ...queryKeys.map((queryKey) => queryClient.invalidateQueries({ queryKey })),
    ]);
    await router.invalidate({ filter: (match) => match.routeId === "/" });
  };
  ```
  | handler | server fn | invalidation call (verbatim) |
  |---|---|---|
  | `confirmMove` (L113) | `moveLeadStage({ data: { id, status, reason } })` | `await refreshDashboard(crmQueryKeys.leads.all());` |
  | `moveLead` (L138) | `moveLeadStage({ data: { id: lead.id, status } })` | `await refreshDashboard(crmQueryKeys.leads.all());` |
  | `qualifyLead` (L150) | `triggerLeadAgent({ data: { leadId: lead.id } })` | `await refreshDashboard(crmQueryKeys.leads.all());` |
  | `draftReply` (L168) | `triggerLeadReplyDraft({ data: { leadId: lead.id } })` | `await refreshDashboard(crmQueryKeys.leads.all());` |
  | `draftQuote` (L186) | `triggerQuoteAgent({ data: { leadId: lead.id } })` | `await refreshDashboard(crmQueryKeys.leads.all(), crmQueryKeys.quotes.lists());` |
  | `createFollowUpTask` (L208) | `createTask({ data: { lead_id, title, priority, due_date } })` | `await refreshDashboard(crmQueryKeys.tasks.lists(), crmQueryKeys.leads.detail(lead.id));` |
- **validateSearch:** `revenueDeskSearchSchema` (from `@/lib/admin-ux-search`, L86–95) — `.passthrough()` object of `q` (optional trimmed string), `source` (`z.enum(LEAD_SOURCES)`), `owner` (optional string), `urgency` (`z.enum(SLA_STATES)`), `ai` (`z.enum(AI_REVIEW_STATES)`), `lead` (optional string). All `.optional().catch(undefined)`.
- **Controls that do NOT reach a server function:**
  - L205 (`summarizeTimeline`, wired to `DashboardInsights onSummarize`): `toast.message(\`Timeline summary is not connected yet for ${lead.company_name}.\`);`
  - Dead imports — `LeadPreviewPanel` (L7) and `PipelineBoard` (L8) are imported but never rendered anywhere in the file.

---

## 2. `src/routes/leads.tsx`

- **Route path registered:** `/leads` — `createFileRoute("/leads")` (line 65)
- **Line count:** 753
- **Loader:** yes.
  ```
  loader: ({ context, deps: { search } }) =>
    context.queryClient.ensureQueryData(
      routeQueryOptions({
        queryKey: crmQueryKeys.leads.list(search),
        queryFn: () => getLeadsPage({ data: search }),
      }),
    ),
  ```
  with `loaderDeps: ({ search }) => ({ search })`.
- **Query keys:** `crmQueryKeys.leads.list(search)` (loader only). No `useQuery` in this file.
- **Server functions imported:** `getLeadsPage`, `createLead`, `updateLead` — all from `@/server-functions/leads`.
- **Mutations:**
  | handler | server fn | invalidation call (verbatim) |
  |---|---|---|
  | `applyToSelected` (L142) — backs bulk assign + bulk mark-qualified/lost | `updateLead({ data: { id, updates: { assigned_to: uid } } })` (L368) and `updateLead({ data: { id, updates: { status } } })` (L374) | `await queryClient.invalidateQueries({ queryKey: crmQueryKeys.leads.lists() });` then `await router.invalidate({ filter: (match) => match.routeId === "/leads" });` |
  | `handleCreateLead` (L162) | `createLead({ data: formData })` | `await queryClient.invalidateQueries({ queryKey: crmQueryKeys.leads.lists() });` then `await router.invalidate({ filter: (match) => match.routeId === "/leads" });` |
- **validateSearch:** `leadListSearchSchema`, defined inline L58–63:
  ```
  page: z.coerce.number().int().min(1).default(1).catch(1),
  limit: z.coerce.number().int().min(1).max(100).default(50).catch(50),
  status: z.string().trim().min(1).optional().catch(undefined),
  source: z.string().trim().min(1).optional().catch(undefined),
  ```
- **Controls that do NOT reach a server function:**
  - L235 Import CSV: `onClick={() => toast.message("CSV import is mocked in this prototype.")}`
  - Owner filter `<Select>` (L323–330) renders only `<SelectItem value="all">All owners</SelectItem>` — no owner options are ever populated, so the filter can never narrow anything.
  - Search input, sort `<Select>`, and the owner filter are pure client-side `useState` over the loaded page (L125–129); only `status` and `source` round-trip through search params + loader.

---

## 3. `src/routes/leads.$id.tsx`

- **Route path registered:** `/leads/$id` — `createFileRoute("/leads/$id")` (line 62)
- **Line count:** 600
- **Loader:** yes, calls the server fn directly (no queryClient priming):
  ```
  loader: ({ params }) => getLeadWorkspaceRead({ data: { id: params.id } }),
  ```
- **Queries:**
  - `useQuery` (L113–120):
    ```
    queryKey: crmQueryKeys.leads.detail(leadId),
    queryFn: () => getLeadWorkspaceRead({ data: { id: leadId } }),
    initialData: initialRead,
    staleTime: 30_000,
    refetchInterval: 12_000,
    refetchIntervalInBackground: false,
    ```
  - No `routeQueryOptions`, no `useSuspenseQuery`.
- **Server functions imported:**
  - `triggerLeadAgent`, `updateLead` from `@/server-functions/leads`
  - `triggerQuoteAgent` from `@/server-functions/quotes`
  - `getLeadWorkspaceRead` from `@/server-functions/relationship-workspaces`
- **Mutations:** invalidation is table-driven (L90–107):
  ```
  const leadMutationQueryKeys = {
    status_change: (leadId: string) => [
      crmQueryKeys.leads.detail(leadId),
      crmQueryKeys.leads.lists(),
    ],
  } as const;
  ```
  | handler | server fn | invalidation call (verbatim) |
  |---|---|---|
  | `handleStatusChange` (L152) | `updateLead({ data: { id: lead.id, updates: { status: nextStatus } } })` | `await invalidateLeadMutation(queryClient, lead.id, "status_change");` → expands to `crmQueryKeys.leads.detail(leadId)` + `crmQueryKeys.leads.lists()` |
  | `handleGenerateQuote` (L147) | `triggerQuoteAgent({ data: { leadId: lead.id } })` | **none** — toast only, no invalidation |
  | `handleQualifyLead` (L159) | `triggerLeadAgent({ data: { leadId: lead.id } })` | **none** — toast only, no invalidation |
- **validateSearch:** `leadDetailSearchSchema` — `z.object({ tab: z.enum(LEAD_DETAIL_TABS).optional().catch(undefined) }).passthrough()`; `LEAD_DETAIL_TABS = ["overview","activity","quotes","files","comments","insights"]`.
- **Controls that do NOT reach a server function:**
  - L298 Notes send button: `<Button size="sm" aria-label="Send lead note" onClick={addNote}>` — `addNote` (L164) only pushes to local `notes` state; the `notes` array starts empty and is never persisted or read back.
  - L470 Comments send button: `<Button size="sm" aria-label="Send lead reply" onClick={addComment}>` — `addComment` (L180) is local `comments` state only.
  - L392 Files upload: `<Button size="sm" variant="outline" onClick={uploadMockFile}>` — `uploadMockFile` (L196) fabricates a fake `LeadFile` with `Math.random()`.
  - L418 file download: `onClick={() => toast.message(\`Downloading ${f.name}…\`)}`
  - L426 file remove: `onClick={() => removeFile(f.id)}` — local state filter only.
  - Note both `addNote` and `addComment` stamp `new Date("2026-05-20T10:00:00Z")` as `created_at`, a hardcoded fixture date.

---

## 4. `src/routes/quotes.tsx`

- **Route path registered:** `/quotes` — `createFileRoute("/quotes")` (line 48)
- **Line count:** 283
- **Loader:** yes.
  ```
  loader: ({ context, deps: { search } }) =>
    context.queryClient.ensureQueryData(
      routeQueryOptions({
        queryKey: crmQueryKeys.quotes.list(search),
        queryFn: () => getQuotesPage({ data: search }),
      }),
    ),
  ```
  with `loaderDeps: ({ search }) => ({ search })`.
- **Query keys:** `crmQueryKeys.quotes.list(search)` (loader only). No `useQuery`.
- **Server functions imported:** `getQuotesPage` from `@/server-functions/quotes` — that is the only one.
- **Mutations:** **none.** No write server function is imported into this file at all.
- **validateSearch:** `quoteListSearchSchema`, inline L43–46:
  ```
  page: z.coerce.number().int().min(1).default(1).catch(1),
  limit: z.coerce.number().int().min(1).max(100).default(50).catch(50),
  ```
- **Controls that do NOT reach a server function:** this is the densest file for stubs — the row-action dropdown is entirely local.
  - L121 comment: `// Keep local-only duplicate / archive until a server fn is available`
  - L125 `duplicate`: `toast.success(\`Duplicated ${q.number} (local preview — save to persist)\`);` — nothing is created.
  - L128–129 `archive`: `setRows((prev) => prev.filter((r) => r.id !== id));` / `toast.message("Quote archived");` — row vanishes from local state only, reappears on next loader run.
  - L250 `<DropdownMenuItem onClick={() => duplicate(q.id)}>` and L253 `<DropdownMenuItem onClick={() => archive(q.id)}>`.
  - Status tabs (L171) and the search `<Input>` (L182) filter `rows` in memory; they are not search params and do not refetch.
  - L40–41 `leadById` is a stub that always returns `undefined`, so the Lead column always renders `—` over the raw `lead_id`:
    ```
    const leadById = (_id: string | null | undefined): { company_name: string } | undefined =>
      undefined;
    ```

---

## 5. `src/routes/quotes.new.tsx`

- **Route path registered:** `/quotes/new` — `createFileRoute("/quotes/new")` (line 57)
- **Line count:** 871
- **Loader:** yes, direct server-fn call (no queryClient):
  ```
  loader: ({ deps }) => getQuoteCreateBootstrap({ data: deps }),
  ```
  with `loaderDeps: ({ search }) => ({ leadId: search.leadId, clientId: search.clientId, productId: search.productId })`.
- **Queries:** no `useQuery` written literally in this file, but three live queries are created via the `useQuoteReferenceData` hook (L102–104): `useQuoteReferenceData("lead", bootstrap.leads, leadId)`, `("client", bootstrap.clients, clientId)`, `("product", bootstrap.products, initialProductId)`. The hook (`src/hooks/use-quote-reference-data.ts:31`) issues:
  ```
  queryKey: crmQueryKeys.quotes.list({ resource: "quote-reference", ...filters }),
  queryFn: async () => (await getQuoteReferencePage({ data: filters })) as ReferencePage<T>,
  initialData: page === 1 && !deferredSearch ? initialData : undefined,
  placeholderData: (previousData) => previousData,
  staleTime: 30_000,
  ```
  where `filters = { kind, search: deferredSearch || undefined, selectedId: selectedId || undefined, page, limit: 25 }`. So the effective key is `["quotes","list",{ kind, limit, page, resource:"quote-reference", search?, selectedId? }]` (normalized/sorted by `normalizeQueryFilters`).
- **Server functions imported:**
  - `createQuote`, `requestQuoteApproval`, and type `CreateQuoteInput` from `@/server-functions/quotes`
  - `getQuoteCreateBootstrap` from `@/server-functions/quote-workspace`
  - (indirectly via the hook) `getQuoteReferencePage` from `@/server-functions/quote-workspace`
- **Mutations:** one — `submit` (L227–292): `createQuote({ data: payload })` then `requestQuoteApproval({ data: { id: quote.id } })` in a try/catch. Invalidation (L278–289, verbatim):
  ```
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: crmQueryKeys.quotes.lists() }),
    queryClient.invalidateQueries({ queryKey: crmQueryKeys.approvals.all() }),
    leadId
      ? queryClient.invalidateQueries({ queryKey: crmQueryKeys.leads.detail(leadId) })
      : Promise.resolve(),
    clientId
      ? queryClient.invalidateQueries({
          queryKey: crmQueryKeys.clients.section(clientId, "commercial"),
        })
      : Promise.resolve(),
  ]);
  ```
  Then `navigate({ to: "/quotes/$id", params: { id: quote.id } });`
- **validateSearch:** `searchSchema`, inline L51–55:
  ```
  leadId: z.string().optional(),
  clientId: z.string().optional(),
  productId: z.string().optional(),
  ```
  (no `.catch`, no `.passthrough`, unlike the shared schemas)
- **Controls that do NOT reach a server function:**
  - L739 **Save draft** — the only stub, and a significant one:
    ```
    <Button variant="outline" size="sm" onClick={() => toast.message("Draft saved")}>
    ```
    Nothing is written; a user who clicks "Save draft" instead of "Submit for approval" loses the entire builder state on navigation.
  - Step chips (L325–337 `onClick={() => setStep(s.id)}`), Back/Continue (L729/L734), `addItem`/`removeItem`/`updateItem`, `applyTemplate`, `applyQuoteTemplate`, and the discount `Input` are all local builder state until `submit` runs — expected for a wizard, listed for completeness.
  - `ReferencePager` prev/next buttons (L844, L854) call `reference.setPage(...)`, which *does* re-drive the `useQuoteReferenceData` query → reaches the server.
  - L114 `approver` state and its `<Select>` (L588) are collected but **never included in the `payload`** sent to `createQuote` (payload is L240–255) — the chosen approver is silently discarded.

---

## 6. `src/routes/quotes.$id.tsx`

- **Route path registered:** `/quotes/$id` — `createFileRoute("/quotes/$id")` (line 69)
- **Line count:** 1007
- **Loader:** yes, direct server-fn call:
  ```
  loader: ({ params }) => getQuoteDetailRead({ data: { id: params.id } }),
  ```
- **Queries — three `useQuery` calls plus one hook-driven query:**
  1. `detailQuery` (L150–155):
     ```
     queryKey: crmQueryKeys.quotes.detail(initialRead.quote.id),
     queryFn: () => getQuoteDetailRead({ data: { id: initialRead.quote.id } }),
     initialData: initialRead,
     staleTime: 30_000,
     ```
  2. `versionsQuery` (L166–172):
     ```
     queryKey: crmQueryKeys.quotes.section(quote.id, "versions", { page: versionPage }),
     queryFn: () =>
       getQuoteVersionsSection({ data: { id: quote.id, page: versionPage, limit: 25 } }),
     enabled: search.tab === "versions",
     staleTime: 30_000,
     ```
  3. `documentQuery` (L173–178):
     ```
     queryKey: crmQueryKeys.quotes.section(quote.id, "document"),
     queryFn: () => getQuoteDocumentRead({ data: { id: quote.id } }),
     enabled: search.tab === "preview",
     staleTime: 30_000,
     ```
  4. `QuotePricingCatalogue` (L913–919) calls `useQuoteReferenceData<PricingTemplate>("pricing", { items: [], total: 0, page: 1, limit: 25 })` → key `crmQueryKeys.quotes.list({ resource: "quote-reference", kind: "pricing", page, limit: 25, search?, selectedId? })`, fn `getQuoteReferencePage`.

  **Note the invalidation mismatch:** `versionsQuery` keys on `section(quote.id, "versions", { page: versionPage })` (a 6-element key ending in a filters object), while every invalidation entry uses `crmQueryKeys.quotes.section(quoteId, "versions")` (5-element, no filters). Prefix matching makes it work, but the two are not the same key expression.
- **Server functions imported:**
  - From `@/server-functions/quotes`: `acceptQuoteAndCreateJobSheet`, `approveAndIssueQuote`, `approveQuote`, `issueQuoteVersion`, `rejectQuote`, `requestQuoteApproval`, `updateQuote`
  - From `@/server-functions/quote-workspace`: `getQuoteDetailRead`, `getQuoteDocumentRead`, `getQuoteVersionsSection`
  - (indirectly via the hook) `getQuoteReferencePage`
- **Mutations** — table-driven invalidation map (L105–132, verbatim):
  ```
  const quoteMutationQueryKeys = {
    save: (quoteId: string) => [crmQueryKeys.quotes.detail(quoteId), crmQueryKeys.quotes.lists()],
    approval: (quoteId: string) => [
      crmQueryKeys.quotes.detail(quoteId),
      crmQueryKeys.quotes.lists(),
      crmQueryKeys.approvals.lists(),
    ],
    approval_issue: (quoteId: string) => [
      crmQueryKeys.quotes.detail(quoteId),
      crmQueryKeys.quotes.lists(),
      crmQueryKeys.approvals.lists(),
      crmQueryKeys.quotes.section(quoteId, "versions"),
      crmQueryKeys.quotes.section(quoteId, "document"),
    ],
    issue: (quoteId: string) => [
      crmQueryKeys.quotes.detail(quoteId),
      crmQueryKeys.quotes.lists(),
      crmQueryKeys.quotes.section(quoteId, "versions"),
      crmQueryKeys.quotes.section(quoteId, "document"),
    ],
    accept: (quoteId: string) => [
      crmQueryKeys.quotes.detail(quoteId),
      crmQueryKeys.quotes.lists(),
      crmQueryKeys.quotes.section(quoteId, "versions"),
      crmQueryKeys.quotes.section(quoteId, "document"),
      crmQueryKeys.jobSheets.lists(),
    ],
  } as const;
  ```
  dispatched by `invalidateQuoteMutation` (L134–144) which maps each key through `queryClient.invalidateQueries({ queryKey })`.

  | handler | server fn(s) | invalidation call (verbatim) |
  |---|---|---|
  | `saveEditableQuoteFields` (L249) | `updateQuote({ data: { id: quote.id, updates: { line_items: editItems, total_value: totalValue } } })` | none itself — callers invalidate |
  | `handleSaveDraft` (L268) | `saveEditableQuoteFields()` | `await invalidateQuoteMutation(queryClient, quote.id, "save");` |
  | `handleSubmitForApproval` (L281), no `approvalId` | `saveEditableQuoteFields()` + `requestQuoteApproval({ data: { id: quote.id } })` | `await invalidateQuoteMutation(queryClient, quote.id, "approval");` |
  | `approveAndIssueReviewedQuote` (L255) | `saveEditableQuoteFields()` + `approveAndIssueQuote({ data: { id: quote.id, approvalId } })` | `await invalidateQuoteMutation(queryClient, quote.id, "approval_issue");` then `navigate({ to: "/approvals" })` |
  | `handleRequestApproval` (L304) | `requestQuoteApproval({ data: { id: quote.id } })` | `await invalidateQuoteMutation(queryClient, quote.id, "approval");` |
  | `handleRejectQuote` (L311) | `rejectQuote({ data: { id: quote.id, approvalId } })` | `await invalidateQuoteMutation(queryClient, quote.id, "approval");` |
  | `handleApproveQuote` (L328) | `approveQuote({ data: { id: quote.id } })` (or delegates to `approveAndIssueReviewedQuote` when `approvalId` present) | `await invalidateQuoteMutation(queryClient, quote.id, "approval");` |
  | `handleIssueQuote` (L347) | `issueQuoteVersion({ data: { id: quote.id } })` | `await invalidateQuoteMutation(queryClient, quote.id, "issue");` |
  | `handleAcceptQuote` (L361) | `acceptQuoteAndCreateJobSheet({ data: { id: quote.id } })` | `await Promise.all([ invalidateQuoteMutation(queryClient, quote.id, "accept"), quote.client_id ? queryClient.invalidateQueries({ queryKey: crmQueryKeys.clients.section(quote.client_id, "commercial") }) : Promise.resolve(), quote.client_id ? queryClient.invalidateQueries({ queryKey: crmQueryKeys.clients.section(quote.client_id, "job_sheets") }) : Promise.resolve(), ]);` |
- **validateSearch:** `quoteDetailSearchSchema` — `.passthrough()` object of `edit: z.boolean().optional().catch(undefined)`, `approvalId: optionalSearchString`, `tab: z.enum(QUOTE_DETAIL_TABS).optional().catch(undefined)`; `QUOTE_DETAIL_TABS = ["items","comments","files","versions","preview"]`.
- **Controls that do NOT reach a server function:**
  - L680 comment send: `<Button size="sm" aria-label="Send quote comment" onClick={addComment}>` — `addComment` (L387) is local state; the seed array is `const quoteComments: Comment[] = [];` (L66), permanently empty.
  - L762 files upload: `<Button size="sm" variant="outline" onClick={uploadMockFile}>` — `uploadMockFile` (L403) fabricates a fake PDF record; seed is `const quoteFiles: QuoteFile[] = [];` (L67).
  - L788 file download: `onClick={() => toast.message(\`Downloading ${f.name}…\`)}`
  - L796 file remove: `onClick={() => removeFile(f.id)}` — local filter only.
  - `versionsQuery.refetch()` (L694), `documentQuery.refetch()` (L814), `catalogue.refetch()` (L934) and the version pager (L732/L748) **do** reach the server.

---

## 7. `src/routes/quotes.$id_.pdf.tsx`

- **Route path registered:** `/quotes/$id_/pdf` — `createFileRoute("/quotes/$id_/pdf")` (line 8)
- **Line count:** 42
- **Loader:** yes, direct server-fn call, no queryClient:
  ```
  loader: ({ params }) => getQuoteDocumentRead({ data: { id: params.id } }),
  ```
- **Queries:** **absent.** No `routeQueryOptions`, no `useQuery`, no `useSuspenseQuery`. This route never participates in the query cache — the `crmQueryKeys.quotes.section(id, "document")` invalidations fired from `quotes.$id.tsx` have no effect here; only a full loader re-run refreshes it.
- **Server functions imported:** `getQuoteDocumentRead` from `@/server-functions/quote-workspace` — the only one.
- **Mutations:** **absent.**
- **validateSearch:** **absent.**
- **Controls that do NOT reach a server function:**
  - L25 the sole button — browser-native print, no server call:
    ```
    <Button type="button" onClick={() => window.print()}>
    ```
    Labelled "Print or save PDF" (L26). There is no server-side PDF generation on this route.

---

## 8. `src/routes/approvals.tsx`

- **Route path registered:** `/approvals` — `createFileRoute("/approvals")` (line 72)
- **Line count:** 766
- **Loader:** yes.
  ```
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(
      routeQueryOptions({
        queryKey: approvalsQueryKey,
        queryFn: () => getApprovals({}),
      }),
    ),
  ```
  No `loaderDeps` — the `type` search param does not drive the loader; filtering is client-side over the full list.
- **Query keys:** one module-level constant (L70), reused everywhere:
  ```
  const approvalsQueryKey = crmQueryKeys.approvals.list({});
  ```
  → `["approvals","list",{}]`
  - `useQuery` (L94–101):
    ```
    ...routeQueryOptions({
      queryKey: approvalsQueryKey,
      queryFn: () => getApprovals({}),
    }),
    initialData: loadedApprovals,
    refetchInterval: 12_000,
    ```
    Note `getApprovals({})` is called with a bare `{}`, not `{ data: ... }`.
- **Server functions imported:**
  - `getApprovals`, `decideApproval` from `@/server-functions/approvals`
  - `approveAndIssueQuote`, `rejectQuote` from `@/server-functions/quotes`
- **Mutations:** all routed through `updateApprovalDecision` (L124–181), which does optimistic `setQueryData` + rollback with a `Symbol` mutation token, then on success (L177–180, verbatim):
  ```
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: approvalsQueryKey, exact: true }),
    queryClient.invalidateQueries({ queryKey: crmQueryKeys.aiReview.all() }),
  ]);
  ```
  It also opens with `await queryClient.cancelQueries({ queryKey: approvalsQueryKey, exact: true });` (L130).

  | handler | server fn |
  |---|---|
  | `decide` (L198) | `decideApproval({ data: { id, decision: status, notes } })` |
  | `approveApproval` (L213) | `approveAndIssueQuote({ data: { id: quoteId, approvalId: approval.id, ...(notes ? { notes } : {}) } })` when `approval_type === "quote_send"`, else `decideApproval({ data: { id: approval.id, decision: "approved", notes } })` |
  | `rejectApproval` (L240) | `rejectQuote({ data: { id: quoteId, approvalId: approval.id, ...(notes ? { notes } : {}) } })` when `quote_send`, else `decideApproval({ data: { id: approval.id, decision: "rejected", notes } })` |
  | `approveQuoteSendAsIs` (L231) / `rejectSelectedApproval` (L258) | wrap the two above via `updateApprovalDecision` |
  | `bulkApprove` (L279) / `bulkReject` (L289) | `Promise.all(selectedApprovals.map((approval) => approveApproval(approval)))` / `...rejectApproval(approval, notes)` |

  Two extra manual invalidations bound directly to Refresh buttons (L325 and L402, identical):
  ```
  queryClient.invalidateQueries({ queryKey: approvalsQueryKey, exact: true })
  ```
- **validateSearch:** `approvalSearchSchema`, inline L66–68:
  ```
  type: z.string().default("all").catch("all"),
  ```
  (unconstrained string — no enum against the four `<SelectItem>` values `all` / `quote_send` / `message_send` / `discount` / `scope_change`)
- **Controls that do NOT reach a server function:**
  - L303–309 `bulkAssign` — the file states this explicitly:
    ```
    // assignment not yet backed by server function — show toast only
    toast.success(`Assigned ${n} request${n > 1 ? "s" : ""} to ${userById(assignee)?.name}`);
    ```
    Reached from L379 `<Button size="sm" variant="outline" onClick={() => setAssignOpen(true)}>` ("Assign reviewer") and confirmed at L711 `<Button onClick={bulkAssign}>Assign</Button>`. The reviewer selection is discarded.
  - The type `<Select>` (L345) is a client-side filter over the already-loaded list (L112–118) — it changes the search param but triggers no refetch, since the loader has no `loaderDeps`.
  - "Request changes" maps to `decide(..., "escalated", ...)`, which **does** hit `decideApproval` — so despite the label it is server-backed.

---

## 9. `src/routes/job-sheets.tsx`

- **Route path registered:** `/job-sheets` — `createFileRoute("/job-sheets")` (line 30)
- **Line count:** 149
- **Loader:** yes.
  ```
  loader: ({ context, deps: { search } }) =>
    context.queryClient.ensureQueryData(
      routeQueryOptions({
        queryKey: crmQueryKeys.jobSheets.list(search),
        queryFn: () => getJobSheetsPage({ data: search }),
      }),
    ),
  ```
  with `loaderDeps: ({ search }) => ({ search })`.
- **Query keys:** `crmQueryKeys.jobSheets.list(search)` (loader only). No `useQuery`.
- **Server functions imported:** `getJobSheetsPage` from `@/server-functions/job-sheets` — the only one.
- **Mutations:** **absent.** No write server function imported.
- **validateSearch:** `jobSheetListSearchSchema`, inline L25–28:
  ```
  page: z.coerce.number().int().min(1).default(1).catch(1),
  limit: z.coerce.number().int().min(1).max(100).default(50).catch(50),
  ```
- **Controls that do NOT reach a server function:**
  - Only interactive elements are the `ListPagination` handler (L80–82, drives search params → loader → server, fine) and `<Link>` navigations. No stub controls.
  - Minor: `import type { JobSheet } from "@/lib/types";` (L19) appears unused in the file body.

---

## 10. `src/routes/job-sheets.$id.tsx`

- **Route path registered:** `/job-sheets/$id` — `createFileRoute("/job-sheets/$id")` (line 78)
- **Line count:** 653
- **Loader:** yes, direct server-fn call:
  ```
  loader: ({ params }) => getJobSheetRead({ data: { id: params.id } }),
  ```
- **Queries:** one `useQuery` (L96–101):
  ```
  queryKey: crmQueryKeys.jobSheets.detail(initialRead.jobSheet.id),
  queryFn: () => getJobSheetRead({ data: { id: initialRead.jobSheet.id } }),
  initialData: initialRead,
  staleTime: 30_000,
  ```
  No `routeQueryOptions`, no polling.
- **Server functions imported:**
  - `acceptJobSheetForAccounting`, `updateJobSheetPortions`, `updatePortionXeroReference` from `@/server-functions/job-sheets`
  - `getJobSheetRead` from `@/server-functions/operations` (note: the read lives in `operations.ts`, not `job-sheets.ts`)
- **Mutations:** invalidation is delegated to a lib helper (L150–156):
  ```
  const invalidateJobSheetReads = async (mutation: JobSheetMutation) => {
    await Promise.all(
      getJobSheetMutationQueryKeys(jobSheet, mutation).map((queryKey) =>
        queryClient.invalidateQueries({ queryKey }),
      ),
    );
  };
  ```
  `getJobSheetMutationQueryKeys` (`src/lib/job-sheet-editor.ts:208–229`) resolves to:
  ```
  const queryKeys: QueryKey[] = [crmQueryKeys.jobSheets.detail(jobSheet.id)];
  if (mutation === "accept") queryKeys.push(crmQueryKeys.jobSheets.lists());
  if (jobSheet.client_id) {
    queryKeys.push(crmQueryKeys.clients.section(jobSheet.client_id, "job_sheets"));
    if (mutation === "accept") {
      queryKeys.push(crmQueryKeys.clients.section(jobSheet.client_id, "commercial"));
    }
  }
  if (mutation === "accept" && jobSheet.account_id) {
    queryKeys.push(
      crmQueryKeys.companyWorkspace.section(jobSheet.account_id, "delivery_finance"),
      crmQueryKeys.companyWorkspace.section(jobSheet.account_id, "commercial"),
    );
  }
  ```
  | handler | server fn | invalidation call (verbatim) |
  |---|---|---|
  | `savePortions` (L202) | `updateJobSheetPortions({ data: { id: jobSheet.id, portions: payload } })` | `await invalidateJobSheetReads("billing");` → `jobSheets.detail(id)` [+ `clients.section(client_id,"job_sheets")`] |
  | `accept` (L237) | `acceptJobSheetForAccounting({ data: { id: jobSheet.id } })` | `await invalidateJobSheetReads("accept");` → `jobSheets.detail(id)`, `jobSheets.lists()`, `clients.section(client_id,"job_sheets")`, `clients.section(client_id,"commercial")`, `companyWorkspace.section(account_id,"delivery_finance")`, `companyWorkspace.section(account_id,"commercial")` |
  | `saveXeroReference` (L265) | `updatePortionXeroReference({ data: { portion_id: portionId, ...buildXeroSavePayload(draft) } })` | `await invalidateJobSheetReads("xero");` → `jobSheets.detail(id)` [+ `clients.section(client_id,"job_sheets")`] |
- **validateSearch:** **absent.** No search schema on this route.
- **Capability/permission-shaped gating (not capability checks, but the closest thing in any of these files):** this route has real client-side *state* gating via `src/lib/job-sheet-editor.ts` helpers — `isJobSheetCommercialLocked(jobSheet.status, jobSheet.locked_at)` (L157), `canShowAcceptAndLockAction(...)` (L318), `isAcceptAndLockDisabled({ editorBusy, hasUnsavedBillingChanges, hasUnsavedXeroChanges, acceptanceOk })` (L322–327), `getAcceptBlockedReason(...)` (L238) and `canAcceptJobSheet(...)` from `@/lib/quote-to-cash` (L182). These are business-rule locks (accepted sheets are immutable, unsaved drafts block accept), **not** user-permission checks.
- **Controls that do NOT reach a server function:**
  - L342–349 Discard billing changes: `onClick={() => setPortionDrafts(resetBillingDrafts(portions))}` — local draft reset (correct by design).
  - L478–485 Discard Xero changes: `onClick={() => setXeroDrafts(resetXeroDrafts(portions))}` — local draft reset.
  - All portion field inputs/selects (`updateDraft`, L192–200) are local drafts until Save.
  - No refresh/export/replay/retry control exists on this route — there is no manual refetch button even though `jobSheetQuery` is a live query.