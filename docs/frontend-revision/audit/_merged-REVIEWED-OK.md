### Revenue Desk `/`, Leads `/leads`, Lead detail `/leads/$id`

Controls I opened, traced and judged sound. Verdict in brackets so every interactive element on these three routes carries exactly one.

**`/` — `src/routes/index.tsx`**
- "New lead" header button `:249-254` — `<Link to="/leads">`, real route, real nav entry. [READ-ONLY] Could deep-link to the create dialog, but nothing is broken.
- "Review leads" empty-state button `:293-295` — `<Link to="/leads">`. [READ-ONLY]
- Lead card `:301` selection and `lead-card.tsx:55-58` — writes `search.lead`, drives `selectedLead` `:96-97`. [READ-ONLY]
- "Open lead" `lead-preview-panel.tsx:113-118` — `<Link to="/leads/$id">`. [READ-ONLY]
- "Qualify" `ai-sales-desk.tsx:51`, "Draft reply" `:55`, "Draft quote" `:59` — reach `triggerLeadAgent`, `triggerLeadReplyDraft`, `triggerQuoteAgent` and, unlike the lead-detail page, correctly branch on `already_running` and `missing_webhook` (`index.tsx:150-202`) and invalidate. [REAL] Their only defect is the raw error text, filed as IF-C1-07.
- `StageMoveDialog` reason textarea `stage-move-dialog.tsx:46-52` and Cancel `:55`. [READ-ONLY] The `disabled={!reason.trim()}` on Confirm is explained by the description at `:39-42`, so it is *not* a "disabled action without explanation".
- `WonConversionDialog` product Select `:92`, value `:109`, billing period `:123`, start date `:142`, renewal date `:155` — local builder state consumed by `convertWonLead`; the renewal auto-fill with a touched-flag override (`:55-61`) is careful work. [READ-ONLY]
- `refreshDashboard` `:75-81` — the invalidation shape is correct for VF-3: this route *is* in the cache, so `invalidateQueries(dashboard, exact)` works, and the `router.invalidate` is scoped by `routeId`, never bare. No stale-invalidation finding here.
- Not a control, noted: `LeadPreviewPanel` (`:7`) and `PipelineBoard` (`:8`) are imported but appear nowhere in the JSX — they are rendered only inside the lazily-loaded `DashboardInsights` (`:33-37`, `dashboard-insights.tsx:49, 60`). The eager imports pull both components plus `AiSalesDesk`, `LeadCard` and `EmptyState` into the route chunk, defeating the `lazy()` boundary the file went out of its way to create.
- Not a control, noted: `getDashboard` (`dashboard.ts:10-19`) checks `requireCapability("leads.view")` but never calls `requireNeonAuthSession()`, unlike every other read on these routes.
- Not a control, noted: the board's fifth column, "Won/Lost" (`src/lib/pipeline.ts:48`), can never populate on this route because the read model excludes those statuses (`read-models/dashboard.ts:53`), so a confirmed won/lost move makes the card vanish rather than move.

**`/leads` — `src/routes/leads.tsx`**
- Status filter `:285-309` and Source filter `:310-322` — both write search params, both are in `loaderDeps`, both reach `getLeadsPage` -> `listLeadsPage` where-clause (`repositories/leads.ts:89-90`), and both reset `page` to 1. [REAL]
- `ListPagination` `:245-252` and its buttons `list-pagination.tsx:25, 36` — page into search params -> loader -> server; disabled bounds are computed from `total`, and the range readout is `aria-live`. [REAL]
- Filter chips `:344-352` and "Clear all" `:353-358`. [READ-ONLY]
- Select-all checkbox `:387-393` and per-row checkbox `:420-424` with `stopPropagation` on the cell `:419`. [READ-ONLY]
- Row click `:411` and keyboard handler `:412-417` — the `e.target !== e.currentTarget` guard and Space-preventDefault are correct; the company cell also carries a real `<Link>` `:427-433`. [READ-ONLY]
- Bulk-bar "Clear" `:689-691`, assign-dialog "Cancel" `:717-719`, `AlertDialogCancel` `:739`. [READ-ONLY]
- Empty-state "New lead" `:477` and "Clear filters" `:481` — the branch at `:476` picks the right one based on `hasActiveFilters`. [READ-ONLY]
- `NewLeadDialog` fields `:556, :569, :582, :597, :614` and Cancel `:625`. [READ-ONLY]
- Confirm dialogs for bulk status `:732-750` — a real confirmation step with per-action copy, which is why bulk status is safer here than the single-click bulk assign.
- Not a control, noted: `/leads/$id` nests under this route (`routeTree.gen.ts:177-181`), so opening any lead also runs `getLeadsPage` for up to 50 rows that are never rendered.

**`/leads/$id` — `src/routes/leads.$id.tsx`**
- "All leads" `:223-227` — `<Link to="/leads">`. [READ-ONLY]
- "New quote" `:237-241` — `<Link to="/quotes/new" search={{leadId}}>`; `/quotes/new` reads `leadId` from its own `loaderDeps`, so the deep link is real. [READ-ONLY]
- Tabs `:250-270` — tab state round-trips through `leadDetailSearchSchema` (`src/lib/admin-ux-search.ts:163-165`) against `LEAD_DETAIL_TABS` (`:53-60`), with `overview` normalized to `undefined`. All six panels render from the single workspace read; no tab triggers a fetch. [READ-ONLY]
- Related-quote links `:364-370` and their `StatusBadge` `:379`. [READ-ONLY]
- Note textarea `:290-297` and comment textarea `:462-469` — inert drafts feeding IF-C1-19/20. [READ-ONLY]
- AI insights panel `:476-540` — reads through `normalizeQualificationData` (`:130-132`), which is what stops one malformed agent payload from killing the page; the empty branch `:530-539` is honest about the agent not having run. [READ-ONLY]
- Profile card fields `:570-593`. [READ-ONLY]
- `notFoundComponent` `:77-84` — heading plus a link back to `/leads`. [READ-ONLY]
- Not a control, noted: `staleTime: 30_000` at `:117` duplicates `CRM_STALE_TIME_MS` (`src/lib/performance/query-policy.ts:3`) instead of using `routeQueryOptions` (`src/lib/route-query.ts:10-17`) — the same drift the repo map recorded for `relationships.tsx`.
- Not a control, noted: `loadLeadWorkspaceRead` returns a `qualification` block (`read-models/relationship-workspaces.ts:22-30`) that the page never reads, re-deriving the same values from `lead.qualification_data` at `:130`.

---

### Quotes `/quotes`, Builder `/quotes/new`, Detail `/quotes/$id`, PDF `/quotes/$id_/pdf`

Controls I opened, traced and judged sound. This list is evidence, not filler.

**`/quotes` — `src/routes/quotes.tsx`**
- `ListPagination` `:148-155` → `onPageChange` writes `page` into search params, which are `loaderDeps` (`:50`), so the loader re-runs `getQuotesPage`. Genuinely server-backed pagination. The shared component itself (`src/components/list-pagination.tsx:12-48`) has correct `aria-label`s, an `aria-live` range readout and both edges disabled at the bounds.
- `useEffect(() => setRows(loaderQuotes), [loaderQuotes])` `:90` — correct resync of local rows to loader data.
- `Route.useLoaderData()` `:86` reads through the same key the loader primed; no duplicate fetch.
- `WorkSurfaceEmpty` empty state `:262-276` uses the shared component with a real recovery action.
- `StatusBadge` `:230` — `STATUS_STYLES` (`src/components/status-badge.tsx:13-18`) covers draft/pending_approval/sent/viewed/accepted/rejected and falls back to a neutral style, so `expired` and `revised` degrade gracefully rather than breaking.
- `formatCurrencyAmount(q.total_value, q.currency)` `:233` correctly honours per-row currency (contrast IF-C2-05).

**`/quotes/new` — `src/routes/quotes.new.tsx`**
- Lead and client search inputs `:384-389`, `:409-414` → `useQuoteReferenceData.setSearch` → deferred value → `getQuoteReferencePage`. Real server search with `useDeferredValue` debouncing (`use-quote-reference-data.ts:23`).
- `ReferencePager` prev/next `:838-857` → `setPage` re-drives the same query; both buttons disable at the bounds **and** while `isFetching`, which is the double-submit guard the Submit button lacks.
- Lead/client `Select` `:390-401`, `:415-426` → values land in the payload at `:241-242` → `createQuote`.
- "Apply template" select `:439-450` and "+ Row" `:451-453` → `applyTemplate`/`addItem` build `items`, which become `pricedItems` and reach `createQuote` at `:250-253`. Line-item field inputs `:471-523` and remove `:526-533` likewise.
- Discount input `:542-552` → `pricedItems` `:138-147` applies the discount to the unit prices themselves, and `total` is derived from the discounted items with the same `calculateQuoteTotal` the detail page uses. The comment at `:128-137` documents the contradiction this fixed; the arithmetic is right.
- Quote-template select `:604-615` → `applyQuoteTemplate` `:190-200` seeds `documentDraft`, which reaches `createQuote` as `quote_template_id`, `cover_text`, `assumptions`, `payment_terms`, `document_sections` (`:245-249`).
- `QuoteDocumentTools` (`:631`, lazy at `:45-49`) → `QuoteDocumentEditor` (`src/components/quotes/quote-document-editor.tsx`): cover/assumptions/payment textareas `:56-82`, add-section `:92-94`, per-section visible `Switch` `:111-115`, move up/down `:120-141` (correctly disabled at both ends), remove `:142-151`, title/label/body `:157-179`. All feed `documentDraft` and are persisted by `createQuote`. **Note the Switch is not an IF-C2 finding**: unlike the §16 "local-only switch" pattern, `section.visible` really is written to `quotes.document_sections`.
- `QuoteDocumentToolsSkeleton` `:863-870` — labelled loading state for the lazy chunk.
- Back/Continue `:725-736` and step chips `:325-337` are wizard navigation over local state, correct by design. Worth noting for C-phase work but not an integrity defect: neither validates before advancing, so a user can jump straight to step 5 and submit; `submit` does catch the three fatal cases (`:228-239`).
- Initial-product auto-apply `:209-225` — matches on the real `pricing_templates.product_id` FK first, falls back to a name match, and **warns** when neither hits (`:220`) rather than staying silent. Exemplary handling; the comment at `:202-208` explains why.
- Invalidation after submit `:278-289` correctly covers `quotes.lists()`, `approvals.all()` and the conditional lead/client keys. `approvals.all()` (`["approvals"]`) prefix-matches the `approvals.list({})` key that `/approvals` uses.
- The `requestQuoteApproval` failure path `:266-276` is well built: it names exactly what happened ("Quote saved as a draft, but requesting approval failed") and suppresses the success toast via `approvalRequested` (`:290`). The comment at `:259-265` records the bug it fixed.

**`/quotes/$id` — `src/routes/quotes.$id.tsx`**
- Tab list `:473-495` writes `tab` into search params via `navigate({ replace: true })`, and `versionsQuery`/`documentQuery` are `enabled` on it (`:170`, `:176`) — tab state is shareable and the sections load lazily.
- Line-item qty/price inputs `:521-546` and remove `:552-560` → `editItems` → `saveEditableQuoteFields` `:249-253` → `updateQuote`. Both carry per-row `aria-label`s.
- Service-catalogue `Sheet` `:579-593` renders `QuotePricingCatalogue` only when open (`:589`), so the catalogue query does not fire until needed. Its search `:924-929`, retry `:934`, select `:946-956` and pager `:964-984` all reach `getQuoteReferencePage`; the pager disables on bounds and `isFetching`.
- "Save draft" `:603-605` → `handleSaveDraft` `:268-279`: `setSaving` true/false in `finally`, `toast.success`, `toast.error` on failure, then `invalidateQuoteMutation(…, "save")`. This is the pattern the rest of the repo should copy.
- `handleAcceptQuote` `:361-385` — the most thorough invalidation in the slice: the `accept` key set plus both `clients.section(client_id, …)` entries, and a success toast that names the created job sheet number.
- `invalidateQuoteMutation` `:105-144` — every key comes from `crmQueryKeys`; no inline keys anywhere in the file (consistent with VF-8).
- The `section(id,"versions",{page})` vs `section(id,"versions")` shape difference is **not** a defect: `createRouteQueryKeys.section` (`src/lib/query-keys.ts:30-33`) emits a 5-element key without filters and appends the normalized filters as a 6th element, so the invalidation key is a true prefix of the query key and prefix matching is exact, not accidental.
- Versions Retry `:694`, PDF-preview Retry `:814` and catalogue Retry `:934` all re-invoke real server functions; the versions pager `:726-751` disables correctly on both edges.
- Loading states `:687-690` and `:807-810`, `QuoteDocumentPreviewSkeleton` `:1000-1006` (labelled), empty states `:668-670`, `:720-722`, `:766-769`.
- `previewQuote` `:216-223` overlays unsaved edits onto the document preview only when `isEditMode` — the preview tells the truth about what is and is not saved.
- `versionPageByQuoteId` / `editorDrafts` / `statusByQuoteId` are all keyed by `quote.id` (`:157`, `:199`, `:188`), which correctly prevents draft bleed when navigating between two quotes. (The separate problem with `statusByQuoteId` is IF-C2-23.)
- Header "All" `:430-434` and "PDF" `:435-439` links — the PDF link's target `/quotes/$id/pdf` matches the generated `fullPath` (`routeTree.gen.ts:904`), so the `$id_` opt-out spelling is handled correctly.

**`/quotes/$id_/pdf` — `src/routes/quotes.$id_.pdf.tsx`**
- Loader `:9` → `getQuoteDocumentRead` → `loadQuoteDocumentRead` (`read-models/quote-workspace.ts:100-109`), which resolves the immutable pointer via `immutableVersionId` `:56-72` and asserts snapshot integrity `:87-98`. This is genuinely rigorous: an accepted quote with no accepted version throws rather than silently rendering live data.
- `resolveQuotePdfSource` `:18` (`src/lib/quote-pdf-source.ts:119-180`) distinguishes live / snapshot / invalid, and the route renders `QuotePdfPreviewUnavailable` `:31` with the specific failure code and version id rather than a generic error. Best error surface in the slice.
- `clientName` fallback chain `:19-20` degrades client → lead → client_id → lead_id → "Client" without ever rendering `undefined`.

---

### Approvals `/approvals`, Job Sheets `/job-sheets`, Job Sheet detail `/job-sheets/$id`

**/approvals — checked, not an issue**
- Row selector `<li role="button" tabIndex={0}>` `:426-441` — Enter/Space handled with `preventDefault` on Space; local selection state only, correct.
- Per-row `Checkbox` `:442-454` — `onClick={(e) => e.stopPropagation()}` at `:453` correctly stops the row-select from firing.
- Select-all `Checkbox` `:415-418` -> `toggleAll` `:312` — scoped to the visible filtered `pending` list, label states the count.
- "Clear" `:382-389` — clears `bulk` only.
- Reviewer notes `Textarea` `:520-527` — REAL: `reason` flows into `decideApproval` / `approveAndIssueQuote` / `rejectQuote` as `notes`; has an `aria-label`.
- Reject-all reason `Textarea` `:726-733` — REAL: reaches `bulkReject`'s `notes` (`:292`).
- "Review & Edit" `:536-548` — REAL: navigates to `/quotes/$id` with `{edit: true, approvalId}`, both accepted by `quoteDetailSearchSchema`, and `quotes.$id.tsx` consumes `approvalId` for `approveAndIssueQuote`.
- Bulk "Approve" `:363-375` and "Reject all" `:738-740` — REAL; Approve is confirmed by the AlertDialog, Reject by the reason Dialog.
- `AlertDialogCancel` `:752` / `AlertDialogAction` `:753-760`, Dialog Cancels `:708`, `:735` — correct, and `setConfirm(null)` runs after the action.
- `StatusBadge` `:506`, `:667` — all four values (`pending`, `approved`, `rejected`, `escalated`) exist in `STATUS_STYLES` (`status-badge.tsx:17-25`); no unstyled fallback.
- `slaChip` `:424` (`src/lib/approval-sla.ts:15`) — takes `now` from `useClientNow` as a parameter, so SSR and first client render agree; no hydration risk.
- Query key hygiene — single `crmQueryKeys.approvals.list({})` constant at `:70`; no inline or duplicated key. This route is **not** one of VF-3's nine, so `invalidateQueries` is the correct tool here and `router.invalidate` is genuinely unnecessary.
- `getApprovals({})` (`:78`, `:97`) called without a `data` wrapper is safe — the validator is `(data ?? {})` (`approvals.ts:12`).
- Minor, not filed: after a decision the detail panel silently re-targets `pending[0]` (`:122`) because the decided item leaves `pending`.

**/job-sheets — checked, not an issue**
- `ListPagination` prev/next `:76-83` -> `list-pagination.tsx:25-46` — REAL: writes `page` into search, `loaderDeps` (`:32`) re-runs the loader -> `getJobSheetsPage`; correctly disabled at both bounds; `aria-label`s and an `aria-live` range readout present.
- Row `<Link to="/job-sheets/$id" params={{id: row.id}}>` `:109-115` — REAL.
- Empty-state "Open quotes" `<Link to="/quotes">` `:135-137` — REAL, target route exists.
- `JobSheetStatusBadge` `:118` — READ-ONLY; `LABELS` covers all five `JobSheetStatus` values (`job-sheet-status-badge.tsx:4-10`), no `replace(/_/g," ")` fallback.
- `formatAcceptedValueSummary` `:65` (`job-sheet-editor.ts:343-359`) — groups by currency instead of summing mixed currencies; correct.
- Key hygiene — `crmQueryKeys.jobSheets.list(search)` with matching `loaderDeps`; no inline key.
- Cosmetic only: `import type { JobSheet }` (`:19`) is unused.

**/job-sheets/$id — checked, not an issue**
- "All job sheets" `<Link to="/job-sheets">` `:308-312` — REAL.
- "Discard billing changes" `:342-349` and "Discard Xero changes" `:478-485` — local draft resets by design (`resetBillingDrafts` / `resetXeroDrafts`), only rendered when there are changes, correctly disabled on `commercialLocked`/`editorBusy`.
- Portion name `Input` `:371-376` and Billing note `Textarea` `:457-465` — REAL, and deliberately still writable for `entered_in_xero` portions per the server comment at `repositories/job-sheets.ts:336-337` ("Name, description and sort order stay editable: they are presentation, not money").
- Amount `:380`, Billing type `:395`, Target date `:445` for `planned`/`cancelled` portions — REAL via `updateJobSheetPortions`.
- Static "Entered in Xero" readout `:416-419` — READ-ONLY and correct; it mirrors the server CASE that pins `status`.
- Xero `Input`s/`Textarea` `:527`, `:541`, `:558`, `:573` — REAL via `updatePortionXeroReference`; all four have `htmlFor`-matched `Label`s.
- Double-submission — genuinely guarded: `editorBusy` (`isJobSheetEditorBusy`, `job-sheet-editor.ts:237-243`) disables every mutating control (`:314`, `:322`, `:519`) across all three mutations, so the writes cannot interleave.
- Draft rebasing on background refetch `:118-132` (`rebaseBillingDrafts` / `rebaseXeroDrafts`) — unsaved edits survive a refetch instead of being clobbered; correct.
- Drafts keyed per job-sheet id `:103-116` — no leakage between sheets on client-side navigation.
- Cross-mutation guards `:208-211` and `:269-272` — the two save paths refuse to run over each other's unsaved drafts; this is what stops the `resolvePortionStatus` / Xero interaction from corrupting a portion.
- Key hygiene — `crmQueryKeys.jobSheets.detail(id)` at `:97`; invalidation set is centralised in `getJobSheetMutationQueryKeys` and includes the `companyWorkspace` special shape correctly.
- `BillingPortionsTable` `:353-357` — READ-ONLY presentation, no controls.
- "Accounting controls" card `:621-639` — three static statements, no controls; accurate ("No invoice creation, payment sync, or ledger balance logic is handled here").

---

### Accounts `/accounts`, Account 360 `/accounts/$id`, Clients `/clients`, Client detail `/clients/$id`, Import `/clients/import`

**Correction to the brief (new evidence).** The premise that `accounts.$id.tsx` does not branch on `missing_webhook` is **stale for the current working tree**. `src/routes/accounts.$id.tsx:166-173` reads:

```ts
if (!result.triggered) {
  if (result.reason === "already_running") {
    toast.message("Relationship intelligence is already running for this account");
  } else {
    toast.error("Relationship intelligence webhook is not configured");
  }
  return;
}
```

`triggerRelationshipIntelligence` has exactly three non-triggered outcomes — `already_running` (`src/server-functions/accounts.ts:80-85`), `missing_webhook` (`:90-92`) and `already_running` again via `!created` (`:103-105`) — so all three are covered and the success toast at `:180` is unreachable for an action that did not run. The last commit touching this file is `d4693a0 "fix: … the actions that only pretended to write"`, which is almost certainly when it was fixed. **No `missing_webhook` finding is raised for this slice.** (`leads.$id.tsx` is outside my routes and unverified here.)

Controls checked and judged fine:

**/accounts** — `ListPagination` prev/next (`accounts.tsx:179-186` → `list-pagination.tsx:25-46`): correct `disabled` at both bounds, `aria-label`s, `aria-live` range, and `search.page` is in `loaderDeps` so it re-runs `getAccountsIndexRead`. · Lifecycle `<select>` (`:193-221`): resets `page` to 1 (`:207`) and `lifecycle_stage` genuinely reaches the SQL `where` (`repositories/accounts.ts:95`). · Preview Sheet `onOpenChange` (`:311-321`): correctly strips `account` from search. · Preview "Retry" (`:324` → `account-preview-panel.tsx:76`): bumps `retryKey`, which is a real dependency of the fetching effect (`:166`), so it re-issues both server reads. · "Accounts" empty state (`:278-286`): honest copy for both the no-data and no-match cases. · Save-view name `Input` + Enter key (`workspace-view-switcher.tsx:94-104`): local form state with `aria-invalid`/`aria-describedby` wired to a `role="alert"`; dialog Cancel (`:112`) is a legitimate local close.

**/accounts/$id** — "Run intelligence" (`:234-242`): guarded by `isTriggeringRelationshipIntelligence` against re-entry (`:157-159`) *and* `disabled` (`:238`) *and* label-swapped to "Running…" (`:241`) — the best-behaved write in this slice. · "Accounts" back `<Link>` (`:243-248`). · Tabs `onValueChange` (`:272-282`): URL-only but flips section-query `enabled` through `getCompanyWorkspaceSectionEnablement` (`:76`), so it does reach `getCompanyWorkspaceSection`; `replace: true` keeps tab switches out of history. · All eight `onRetry` handlers (`:334, 415, 433, 467, 489, 523, 580, 646`) call `.refetch()` on a real query; the retry button only renders when `state.error.retryable` and is `disabled` while refreshing (`company-workspace-section-state.tsx:24-36`). · "Dismiss" (`:791-798`), reason `Input` (`:807-813`) and "Cancel" (`:819-825`): a legitimate local two-step disclosure; all three are `disabled` while the write is in flight, and `cancelDismiss` refuses to close mid-write (`:111-117`). · "Confirm dismiss" (`:816`): re-entry guard (`:120-122`), required-reason validation with a toast (`:124-128`), success and failure toasts (`:148`, `:150`) — correct apart from IF-D1-07. · Job-sheet `<Link to="/job-sheets/$id">` (`:674-678`).

**/clients** — "Import CSV" `<Link to="/clients/import">` (`:141`). · "New client" `DialogTrigger` (`:144-148`) and `Dialog onOpenChange` (`:143`). · `ListPagination` (`:169-176`). · Tier `<Select>` (`:200-222`): writes to search, resets `page`, and reaches `listClientsPage`'s `c.tier` filter (`repositories/clients.ts:112`). · Company-name and Industry `Input`s (`:371-378`, `:383-391`) and the dialog Tier `<Select>` (`:397-406`) — local form state; the three tier values match the `check (tier in ('SME','mid-market','enterprise'))` constraint at `neon/migrations/001_clientops_runtime.sql:42`. · Company `<Link to="/clients/$id">` (`:283-289`).

**/clients/$id** — "Account 360" `<Link>` (`:143-147`), correctly conditional on `identity.accountId`. · "All clients" `<Link>` (`:149-153`) and the `notFoundComponent` back link (`:50-52`). · Tabs `onValueChange` (`:161-171`): `replace: true`, and it drives every section query's `enabled` flag. · All six `DeferredTab` Retry buttons (`:224, 282, 295, 330, 373, 387` → `:450`) call `.refetch()` on real queries; the timeline one correctly refetches both of its two sources (`:387-390`). · "Add contact" `DialogTrigger` (`:508`) and `Dialog onOpenChange` (`:506`). · The four contact `Input`s (`:519-568`): local state with correct `autoComplete` tokens and `type="email"`/`type="tel"`. · Quote `<Link to="/quotes/$id">` (`:303-309`) and job-sheet `<Link to="/job-sheets/$id">` (`:345-349`).

**/clients/import** — "All clients" `<Link>` (`:73-77`). · The file `<input>`'s `disabled={isValidating}` (`:94`) with the label swapping to "Validating…" (`:89`). · The Commit button's `isCommitting` in-flight state and "Committing…" label (`:142-146`), and its `valid.length === 0` guard — the per-row reason list at `:110-118` is an adequate explanation for that disabled case. · `validateClientImportRows` is re-run server-side inside `commitClientImportFn` (`client-import.ts:41-42`), so a stale client-side "valid" set cannot be trusted into the database.

---

### Relationships, Renewals, Tasks, Campaigns `/campaigns`, Campaign detail `/campaigns/$id`

Controls traced to an authorized server function or to legitimate local state, with no defect found.

**/relationships**
- Previous / Next pager `relationships.tsx:72-89` — REAL. Correctly `disabled` on boundary *and* on `relationshipQuery.isFetching`, `aria-label`ed, and each click changes `crmQueryKeys.relationships.list({page,limit})` so `getRelationshipIndexRead` runs. (URL-state gap tracked separately as IF-D2-03.)
- Dismiss reason `<Input onChange>` `relationship-signal-card.tsx:72-78` — local form state, correctly `disabled={isDismissing}`.
- "Cancel" `relationship-signal-card.tsx:84-91` + `cancelDismiss` `relationship-command-center.tsx:41-47` — local state, correctly refuses to close while a dismiss is pending.
- `dismiss()` re-entry guard `relationship-command-center.tsx:50-52` + `pendingSignalIds` — genuine double-submission protection; empty-reason validation at lines 56-59 matches the server's own `parseDismissRelationshipSignalInput` requirement (`relationship-signals.ts:23-25`). Note: `dismissRelationshipSignal` (`src/server/repositories/relationship-signals.ts:224-235`) has no `and dismissed_at is null` guard, so a replayed dismiss would overwrite the original reason/actor — unreachable through this UI because the row is removed and the pending guard holds, so not filed.
- Empty state `relationship-command-center.tsx:84-91` and the "Showing the 10 highest-priority signals per account" note at line 97 — the hardcoded 10 correctly matches the SQL slice `[1:10]` at `src/server/repositories/relationship-signals.ts:123`.
- Error banner presence `relationships.tsx:55-59` — this route is the only one in the slice that surfaces a query error at all (the wording is what IF-D2-05 addresses, not the existence).

**/renewals**
- Risk `<Select>` `renewals.tsx:150-163`, Product `<Select>` `renewals.tsx:164-179`, Renewal-window `<Select>` `renewals.tsx:180-197` — all REAL. `setFilters` (line 100) writes to search and resets `page: 1`; `loaderDeps` picks the three up (lines 66-69) so the loader re-runs and `parseRenewalsInput` (`operations.ts:42-62`) applies them server-side. All three carry `aria-label`s. Product options come from server data (`renewalRead.products`), not a fixture.
- Previous / Next renewal page `renewals.tsx:202-221` — REAL, boundary-disabled against `lastPage`, writes `page` to search.
- Empty-state actions `renewals.tsx:232-238` — real `<Link>`s to `/clients` and `/`, both authenticated routes that exist.
- `RenewalCard` click / Enter / Space `renewal-card.tsx:28-41`, and the close button `renewals-preview-panel.tsx:117` — READ-ONLY: they open and close a panel over already-loaded loader data and change nothing persisted. Correct as-is.
- "Re-score risk" `renewals-preview-panel.tsx:180-191` → `triggerRiskScoreAgent` (`engagements.ts:84`, gated `agents.run` + engagement ownership) — REAL, with in-progress state (`scoreStatus`), a skeleton (lines 135-140), a failure branch (line 161), an `already_running` branch (line 90), **and a correct `missing_webhook` branch** (lines 92-95) naming `N8N_SCORE_RENEWAL_RISK_WEBHOOK_URL`. This is one of the five call sites that handle the sentinel properly — unlike `accounts.$id.tsx` / `leads.$id.tsx`.
- "Draft renewal quote" `renewals-preview-panel.tsx:192-203` — REAL navigation to `/quotes/new` with `clientId`/`productId` search params; `/quotes/new` is a registered route that accepts them.
- "Log touchpoint" trigger `renewals-preview-panel.tsx:271-292` — REAL: lazily calls `getEngagementsByClient` + `getClientContacts` in parallel on first open, memoized per client, with a `loadingByClientId` disable guard and a `finally`. (The *save* inside the dialog is IF-D2-10.)
- "Tidy with AI" `touchpoint-logger.tsx:189-198` → `tidyTouchpointNote` — REAL, correctly hidden behind `isAiNoteTidyAvailable()` (line 69), disabled while tidying or when notes are empty, and catch-toasted.
- Touchpoint Type / Sentiment / Engagement / Contact selects `touchpoint-logger.tsx:114,131,151,169` — local form state feeding `createTouchpoint`; engagement and contact option lists come from server reads, not a fixture.
- `MarkRenewedEndedDialog` reason validation `mark-renewed-ended-dialog.tsx:68` (`disabled` when ending without a reason) — correct and matches `endEngagement`'s required `reason`.
- Type note, not filed as a finding: `Route.useLoaderData() as unknown as RenewalsView` (`renewals.tsx:92`) erases the loader's real return type. The shapes do line up — `loadRenewalsRead` returns `{rows,total,page,limit,metrics,products,asOf}` (`src/server/read-models/operations.ts:42-53`) — so nothing is broken today, but the double cast means a server-side shape change would fail at runtime instead of at `tsc`.

**/tasks**
- Priority `<Select>` `tasks.tsx:197-212` — REAL: writes to search, `loaderDeps` picks it up, `getTaskReadInput` maps `"all" → undefined`, and `getTasks` filters on it (`tasks.ts:44-46`). `aria-label`ed.
- Drag-and-drop `onDragStart`/`onDragOver`/`onDrop` `tasks.tsx:239-243, 265-268` and keyboard ←/→ `tasks.tsx:269-276` — both REAL, both funnelling into the same `move()` and therefore into `updateTask` (`tasks.ts:57`, gated `tasks.update` + `task` ownership).
- `move()` itself `tasks.tsx:129-163` — the reference implementation for this repository's imperative-write pattern: re-entry guard (130), no-op guard (132), `cancelQueries` (135), optimistic `setQueriesData` (136), rollback + `toast.error("Task move failed. Try again.")` on rejection (143-148), then `tasks.detail(id)` (exact) + `tasks.lists()` invalidation wrapped in its own catch-toast (152-162). Nothing to fix.
- Per-card accessibility `tasks.tsx:259-281` — `role="button"`, `tabIndex` flipped to `-1` while pending, `aria-busy`, `aria-disabled`, `draggable={!isPending}`, descriptive `aria-label` naming the keyboard affordance, and a `cursor-wait opacity-60` in-progress affordance. Exemplary.
- New-task Title / Description / Due inputs `tasks.tsx:375-382, 388-394, 433-440` and Priority select `tasks.tsx:401-410` — local form state; all labelled with `htmlFor`/`id` pairs.
- Empty-column `WorkSurfaceEmpty` `tasks.tsx:308-313` — shared component, correct per column.
- "Cancel" `tasks.tsx:445-447` — local dialog close.
- Title-required validation `tasks.tsx:343-346` — correct client guard before the server call.

**/campaigns**
- `ListPagination onPageChange` `campaigns.tsx:102-109` → shared `list-pagination.tsx:12-48` — REAL: writes `page` to search, loader re-runs. The shared component is boundary-disabled, `aria-label`ed on both buttons, wrapped in `<nav aria-label="List pagination">`, and its range readout is `aria-live="polite"` with `tabular-nums`.
- Campaign card `<Link to="/campaigns/$id" params={{id}}>` `campaigns.tsx:123-128` — REAL router link (not a raw anchor), with a visible focus ring.
- "New campaign" trigger `campaigns.tsx:92-95` and `Dialog onOpenChange` line 90 — local open state.
- Name / Start date / End date / Objective / Notes fields `campaigns.tsx:239-246, 287-294, 300-307, 330-336, 342-348` — local form state, all `htmlFor`/`id` labelled, all persisted by `createCampaign` (`CreateCampaignInput` accepts every one — `src/server/repositories/campaigns.ts:14-17`).
- Type `<Select>` `campaigns.tsx:252-264` and Status `<Select>` `campaigns.tsx:270-281` — READ-ONLY at the control level but their values *do* persist through `createCampaign`, and both option sets exactly match the DB check constraints (`neon/migrations/003_client_relationship_360.sql:50-53`). Unlike Owner (IF-D2-17), these are honoured.
- Name-required validation `campaigns.tsx:202-206` and `disabled={saving}` `campaigns.tsx:352` — correct client guard and correct in-progress state.

**/campaigns/$id**
- "Campaigns" back button `campaigns.$id.tsx:205-210` — REAL `<Link>` via `asChild`.
- "Choose CSV" proxy button `campaigns.$id.tsx:284-291` — local `fileInputRef.current?.click()`; the hidden `<input type="file" onChange>` at lines 292-305 is the control that matters and it does reach `validateEventImportRowsFn`. Both correctly `disabled={isValidating}`; the input is `sr-only` with a real `id`.
- `onFile` `campaigns.$id.tsx:108-142` — REAL: parses locally, validates server-side, sets a per-row error list, resets the input on every failure path, and has `isValidating` + try/catch/finally. Zero-row and parse-failure branches both toast.
- "Import N attendee rows" `campaigns.$id.tsx:345-353` → `commitEventImportFn` — REAL, gated on four capabilities server-side, `disabled` on empty rows / outstanding errors / in-flight import / in-flight validation, with a re-entry guard at line 145, a `{ok:false}` validation-failure branch (154-161), and a catch-toast. (Its idempotency gap is IF-D2-21, a backend concern.)
- "Create follow-up tasks" `event-attendee-table.tsx:80-82` → `createFollowUpTasks` `campaigns.$id.tsx:179-197` → `createCampaignFollowUpTasksFn` (`campaigns.ts:69`, gated `tasks.create` + `campaign` ownership) — REAL, `isCreatingTasks` guard, try/catch/finally, reports the actual `createdTasks` count. **Idempotent server-side**: `campaign-follow-ups.ts:56-102` selects only `follow_up_status = 'not_started'` `for update` and updates conditionally, so a second click creates zero tasks rather than duplicates.
- Attendee "Retry" `campaigns.$id.tsx:246-248` — REAL, calls `attendeeQuery.refetch()`.
- Attendee pager `event-attendee-table.tsx:140-157` — REAL, boundary-disabled, `aria-label`ed. (URL-state gap is IF-D2-23.)
- Validation-error list `campaigns.$id.tsx:329-343` — shows row numbers and reasons, caps at 6 with a "+N more", and the reasons come from the app's own validator, not from the driver.
- Empty attendee state `event-attendee-table.tsx:65-72` — the "Create follow-up tasks" button disappears with it, which is correct: with no attendees there is nothing to follow up.
- Authorization note across the slice: every resource type these routes target — `relationship_signal`, `campaign`, `engagement`, `task` — resolves through **Neon**, not Supabase (`src/server/auth/resource-ownership.ts:35-58`). None of these five routes is exposed to the VF-7 `SUPABASE_URL`-missing 500.

---

### AI Review, AI Ops `/agents`, Agent detail `/agents/$name`, Reports, Settings

Controls I opened, traced, and judged sound. Verdict given so every interactive element in the slice carries exactly one.

**`/ai-review`**
- Refresh button `:91-103` — **REAL**. `invalidateQueries` on `aiReview.list({view:"queue"})` with `exact: true` refetches `getAiReviewRead`; a legitimate refetch trigger, correct key, correct exactness.
- Queue item select buttons `:150-171` — **READ-ONLY**. Sets `selectedId` and clears notes; carries `aria-pressed` (`:156`). Correct.
- Reviewer notes `Textarea` `:203-210` — **REAL**. Its value is the `notes` field of the `decideApproval` payload (`:63`) and is cleared only on success (`:76`). Has an associated `<Label htmlFor="reviewer-notes">` (`:202`).
- `disabled={isSubmitting}` on all three decision buttons (`:216`, `:224`, `:231`) + the `if (submittingId) return;` guard (`:58`) — **REAL**. Genuine double-submission protection; this is the only route in my slice that has it.
- Empty-state CTA `<Link to="/agents">` `:137-140` — **READ-ONLY**. Valid target; `read_only` holds `agents.view`, so the link never dead-ends. Copy nit only: §9.20 says use "AI Ops" rather than "Agent Monitor" in links.

**`/agents`**
- Refresh button `:100-102` — **REAL**. Same correct invalidation as above.
- `<Link to="/ai-review">` `:97-99` and the per-card `<Link to="/agents/$name" params={{name}}>` `:114-126` — **READ-ONLY**. Typed router links, correct params, no `as never` casts.
- Run-status `Select` `:166-177` — **READ-ONLY**. Filters the 50 already-loaded rows client-side via `useMemo` (`:76-82`); correct given the whole set is in memory, and it carries `aria-label="Filter agent runs by status"` (`:167`). Nit: not URL-persisted, so a filtered view is not shareable and survives no back-navigation.
- Row expand/collapse `:214-223` — **READ-ONLY**. Keyboard-operable (`tabIndex={0}` plus Enter/Space with `preventDefault`), correct focus ring. The expanded panel shows real `run.output_summary` (`:271`) with an honest fallback. Nit: §9.21 wants a trace/tool-call link here, and `getAgentRunWithCalls` already exists one layer down (see IF-E1-06).
- Replay `event.stopPropagation()` `:260` — **REAL** as written; correctly stops the row from toggling. Moot once IF-E1-06 removes the button.
- 45s polling `useEffect` `:66-74` — **REAL**. Correct key, `exact: true`, interval cleared on unmount, `queryClient` in deps. Nit: fires regardless of tab visibility or window focus.
- Table empty state `:200-208` — **READ-ONLY**. Correct `colSpan={9}` and a filter-aware message ("No recent agent runs match this status").

**`/agents/$name`**
- Prev/Next pagination `:179-208` — **REAL**. These are the genuine server-backed controls on this page: they write `search.page`, which is in `loaderDeps` (`:35`), which re-drives `getAgentHistoryPage`. Both `disabled` at the correct boundaries (`:184`, `:199`) and both carry `aria-label`s (`:183`, `:198`). `loadAgentHistoryPage` also clamps `page` to `lastPage` server-side (`src/server/read-models/agent-workspaces.ts:120-121`).
- Tabs `onValueChange` `:102-110` — **READ-ONLY**. Writes `search.tab` with `replace: true` and correctly normalises the default tab to `undefined` rather than writing `?tab=runs`.
- Run row expand/collapse `:129-160` — **READ-ONLY**. Shows real `input_data` JSON with an em-dash fallback (`:166`).
- `<Link to="/agents">` at `:56` (notFound) and `:89-93` (header) — **READ-ONLY**. Both valid.
- `notFoundComponent` `:53-60` — **READ-ONLY**. Correctly reached from `throw notFound()` when `$name` is not in `AGENT_DEFINITIONS` (`:37-38`).
- Nit (no finding, naming only): the third tab is labelled "Config" (`:116`, enum `src/lib/admin-ux-search.ts:73`); §9.22 names it "Governance".

**`/reports`**
- Range buttons `:104-126` — **REAL** (defect filed separately as IF-E1-14). They write `range` with `replace: true`, `range` is in `loaderDeps` (`:68`), so the loader re-runs `getReportSummary`. They carry `aria-pressed` (`:108`) and are real `<button type="button">`s, not divs.
- Report `TabsTrigger`s `:157-161` — **REAL**. Selecting one flips `enabled` on `datasetQuery` (`:94`), which fetches `getReportDataset` for that report — a genuine server round trip per tab.
- Dataset error branch `:171-174` — **READ-ONLY**. Renders a fixed, non-leaking message ("Report data could not be loaded."). This is the one correct error surface in the slice.
- `ChartSkeleton` `:192-204` — **READ-ONLY**. Real loading state, `aria-label="Loading report chart"`.
- Zero-report empty state `:145-150` — **READ-ONLY**. Honest.
- Lazy chart import + `Suspense` `:18-22`, `:178-181` — **READ-ONLY**. Keeps Recharts out of the initial bundle; correct fallback.
- `validateSearch` `:24-26` — **REAL**. `.catch("30d")` means a hand-edited `?range=junk` degrades instead of throwing.

**`/settings`**
- Top-level Tabs `onValueChange` `:130-138` — **READ-ONLY**. Writes `search.tab` with `replace: true`, normalises the default to `undefined`. `settingsSearchSchema` (`:102`) validates against the seven-value enum with `.catch(undefined)`.
- Products "New product" dialog fields — name `Input` `:404-411`, category `Select` `:417-431`, billing type `Select` `:437-449`, term-months `Input` `:455-464`, and `Dialog onOpenChange` `:389` — **REAL**. Every one feeds the `createProduct` payload (`:352-359`); all four have associated `<Label htmlFor>`s (`:401`, `:414`, `:434`, `:452`) and the numeric inputs set `inputMode="numeric"`.
- Products table `StatusBadge` `:497` — **READ-ONLY**. Reads `p.active` from the server row, not from local state — the one status display in the slice that tells the truth (contrast IF-E1-08 and IF-E1-22).
- Optimistic `setQueryData` calls `:360-363`, `:374-376` — **REAL**. Both write the **server's returned row**, not a client guess, so the optimistic value is accurate even though the invalidation misses (IF-E1-29).
- Profile name/email `Input`s `:192-199`, `:202-214` — **READ-ONLY** over fabricated seed values; covered by IF-E1-16, listed here because the inputs themselves are correctly built (labels, `autoComplete`, `type="email"`, `spellCheck={false}`).

---

---

### Admin `/admin/*` (8 routes), Account `/account`, Notifications `/notifications`

**`/admin` (`admin.tsx`)** — `AdminShell` nav `<Link>`s (`admin-shell.tsx:52-65`): real, capability-filtered server-side by `getAdminNavigationFn` (`admin-users.ts:119-137`), `aria-current="page"` set correctly, and the `/admin` vs `/admin/` exact-match exception at 47-50 is right. `<Outlet/>` at 33 present and correct.

**`/admin/` (`admin.index.tsx`)** — parallel `Promise.all` in one queryFn under one key (14-20) is sound; `getAdminAuditSummaryFn` degrading FORBIDDEN to `[]` (`admin-access.ts:188-192`) is the right call for a summary strip; empty state at `admin-overview.tsx:163-167` present; `formatCount`/`formatDateTime` used; `tabular-nums` on values (65).

**`/admin/people`** — debounced search input (`people-directory.tsx:116-124` + effect 63-75, 250 ms, `latestSearch` ref avoids a stale closure): real, reaches `getAdminUsersFn`. Status select (126-137) and role select (138-152): real, both forwarded by `toUserFilters`. Row click + Enter/Space keydown (210-220): real, drives `adminUserQuery`. Previous/Next (277-294): real, correctly `disabled` on `hasPrevious`/`hasNext`. "Invite users" (97-104): real, correctly gated by `canInvite`. "Manage lifecycle" (`user-detail-panel.tsx:90-96`): real, correctly gated by `canManageLifecycle` *and* `status !== "deactivated"`. Invite dialog role select, email textarea, cancel and close: real. Lifecycle dialog suspend/deactivate toggles (141-172), reason textarea (204-210), submit (230-240 — `disabled={!canSubmit || submitting}`, correct), cancel/close: real, with genuine error surfacing at 213-220. Successor selects (`work-reassignment-table.tsx:73-86`): real, correctly filtered to active non-self candidates (30-32). Role dialog reason textarea, save (152-159, `disabled={submitting}`), cancel, close: real. `openLifecycle`'s `lifecycleRequest` race counter (`admin.people.tsx:152, 162, 168, 176`) is a correct out-of-order guard. Forbidden panel `role="alert"` (211-220): correct.

**`/admin/people/$id`** — tab `onValueChange` → `navigate({search, replace:true})` with `profile` normalised to `undefined` (81-91): correct URL-state handling, no server call needed. Teams tab (119-140), Work tab (141-157), Activity tab (177-188): real persisted data, correctly read-only, `tabular-nums` on workload counts (150). Not-found panel `role="status"` (59-68) and forbidden panel `role="alert"` (49-58): both correct. *(All of this is unreachable today per IF-E2-01 — reviewed on its merits for after the Outlet fix.)*

**`/admin/teams`** — Departments/Working-teams kind tabs (`organization-directory.tsx:100-129`): real, `role="tab"` + `aria-selected`, correctly clear `unit`. Status select (78-93): real client-side filter over a fully-loaded directory. Unit list buttons (194-209): real, `aria-pressed` set. "Edit" (`organization-unit-detail.tsx:70-78`): real, correctly gated on `onEdit && canManage`. Unit tabs (87-103): correct URL state. Overview tab (108-156) and Work tab (180-193): real persisted data. Department-members explainer (161-167): honest — department membership genuinely is modelled through teams. Unit dialog name/description/status/head/deputy/default-owner selects and the archive-confirmation checkbox (`organization-unit-dialog.tsx:156-228`): all real, `ProfileSelect` correctly filters to active users (281), and the archive gate at 81-84 with the open-work count at 223 is a good destructive-action guard. Submit (245-251) has both `disabled={submitting}` and a real catch. `loadUsers`/`loadUnit` swallowing FORBIDDEN to `[]`/`null` (44-73): defensible for a side panel.

**`/admin/teams/$id`** — "Back to organization" `<Link>` (205-217) correctly reconstructs the parent's search state. Not-found panel (194-200). *(Unreachable today per IF-E2-03.)*

**`/admin/access`** — Profile `<select>` (`admin.access.tsx:244-257`): real, drives `overridesQueryOptions`. Requests/Effective tab buttons (263-279): correct URL state, `role="tab"` + `aria-selected`. "Create override" (300-307): real, correctly gated on `super_admin` — and `canCreateOverride` is re-checked inside the dialog (`permission-override-dialog.tsx:108-114`), so the gate is defence-in-depth rather than a single client check. Approve/Reject buttons (`access-request-queue.tsx:140-154`), decision reason textarea (163-172), "Temporary access" checkbox (177-187), expiry input (195-206), submit (216-223 with `disabled={submittingId === request.id}` and a real catch at 79-84): all real, reaching `decideAdminAccessRequestFn`. Empty state (35-41). Override dialog capability select (built from `CAPABILITIES`, 131-135), effect select, reason, temporary checkbox, expiry, submit: all real. `OverrideHistory`'s active/expired/revoked split (`admin.access.tsx:92-97`, 166-168) matches `overrideIsActive` in `policy.ts:145-149` — the client and the policy engine agree, which is what matters here. `refreshAdminAccessCaches`'s cache-scan for `scope==="access-requests"` and `scope==="audit"` keys (171-187) is unusual but correct, and is the only place in the slice that invalidates the audit list after a decision.

**`/admin/audit`** — Actor / target-type / target / action inputs (129-161) and severity select (165-175): real, all five reach `getAdminAuditLogsFn` via `auditFilters`. "Apply filters" submit (177-182): real, correctly resets `page: 1`. Previous/Next (`admin-audit-table.tsx:87-102`): real, correctly `disabled` at both bounds. Per-row `<details>/<summary>` "View change" (63-75): correct native disclosure, no JS needed, shows the real before/after snapshots. Forbidden panel (101-110). `auditQueryOptions` catching FORBIDDEN inside the queryFn rather than the loader (18-30) is a good pattern — it survives refetches, not just the first load.

**`/account`** — Name / job title / phone / avatar inputs (303-336) and "Save profile" (339-345): real → `updateMyProfile`, and correctly the only write that also invalidates `crmQueryKeys.shell()` (`account.tsx:72`), since the sidebar shows the name. "Reset password" `<a href="/login/forgot-password">` (382-385): real destination — `/login/$authPath` accepts it. "Revoke app sessions" (394-400): real → `revokeMyAppSessions` → `setSessionInvalidBefore`, and the copy at 389-392 honestly states that the current session survives until refresh. Availability select + leave start/end (528-559) and "Save availability" (563-569): real → `updateMyAvailability`, with a correct client-side end-after-start pre-check (160-163) mirroring the server's `superRefine` (`account.ts:54-71`). Delegation start/end/reason inputs (442-466), "Create delegation" (470-476), "Cancel delegation" (502-508, correctly shown only for `delegatorProfileId === profile.id && status === "active"`): real. Request-type select (589-596) and reason textarea (623-628): real. Teams list (355-366), workload cards, request history (~645-660): real read-only persisted data. `formatDelegationDate` (75-78) correctly uses the pinned `en-GB`/UTC formatter, with the hydration rationale documented in-file.

**`/notifications`** — Six filter tab buttons (123-141): real URL state via `navigate({search, replace:true})`, filtering an already-fully-loaded list client-side — correct, no server round-trip warranted. Unread-count `Badge` (135-139): real, from `getNotifications`'s server-side `countUnreadNotifications`. "Mark all read" correctly hidden when `unreadCount === 0` (113) and "Mark read" correctly hidden on already-read rows (185). Empty state (146-150). `formatDateTime` + `useClientNow`-guarded `relativeTime` (178-181): the right SSR-safe pattern. The `useNotifications` optimistic machinery itself (`use-notifications.ts:49-119`) — `cancelQueries` before the optimistic write, per-notification `Symbol` tokens so a slow request cannot clobber a newer one, exact-key invalidation after settle — is the strongest mutation code in this slice and is the model the shared helper should be built from.