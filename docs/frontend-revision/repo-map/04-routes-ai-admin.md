# Route Inventory — Phase E AI + Operating + Admin + Non-Inventory Routes

**Repo root:** `C:/Users/laich/Documents/FIMMICK ClientOps/ui-delight-maker`
**All paths below are absolute.**

Convention notes verified by reading files:
- `routeQueryOptions` (`src/lib/route-query.ts`) is a thin `queryOptions` wrapper that only injects `staleTime: CRM_STALE_TIME_MS`.
- No route in this set uses `useMutation` / `useSuspenseQuery`. Every "mutation" below is a plain `async` handler calling a server function directly, then invalidating manually. This is stated per route.
- Root gate (`src/routes/__root.tsx`, `beforeLoad`): if `isPublicAuthPath(location.pathname)` returns `{}` (no shell fetch, no sidebar chrome); otherwise it `ensureQueryData` on `crmQueryKeys.shell()` → `getAppShellRead()`. `isPublicAuthPath` (`src/lib/auth/auth-routes.ts`) is true for `/login`, `/login/*`, and `/invite/*`.

---

## 1. `src/routes/ai-review.tsx`

- **Route path registered:** `/ai-review` — `createFileRoute("/ai-review")`
- **Loader:** yes. `loader: ({ context }) => context.queryClient.ensureQueryData(aiReviewQuery())` → calls `getAiReviewRead()`.
- **Queries:**
  - `routeQueryOptions` factory `aiReviewQuery()`: queryKey `crmQueryKeys.aiReview.list({ view: "queue" })`, queryFn `() => getAiReviewRead()`
  - `const { data } = useQuery({ ...aiReviewQuery(), initialData });`
- **Server functions imported:**
  - `getAiReviewRead` from `@/server-functions/agent-runs`
  - `decideApproval` from `@/server-functions/approvals`
- **Mutations (hand-rolled async, no `useMutation`):**
  - `decide(approval, decision)` → `await decideApproval({ data: { id: approval.id, decision, notes: notes || undefined } })`
    - optimistic write: `queryClient.setQueryData(crmQueryKeys.aiReview.list({ view: "queue" }), {...})`
    - invalidates (verbatim): `queryKey: crmQueryKeys.aiReview.list({ view: "queue" }), exact: true` and `queryKey: crmQueryKeys.approvals.lists()`
  - Bound to three buttons: `onClick={() => decide(selected, "escalated")}`, `"rejected"`, `"approved"`.
- **Capability / permission checks in file:** **absent** (no role or capability gating in the component; enforcement lives server-side in the server functions).
- **validateSearch:** **absent**.
- **Line count:** 250
- **Controls not reaching a server function:** the Refresh button only invalidates cache (`onClick={() => void queryClient.invalidateQueries({ queryKey: crmQueryKeys.aiReview.list({ view: "queue" }), exact: true })}`) — that is a legitimate refetch trigger, not a dead control. No other stubbed controls.
- **Classification:** authenticated product route.

---

## 2. `src/routes/agents.tsx`  ⚠️ (special attention route)

- **Route path registered:** `/agents` — `createFileRoute("/agents")`. Acts as a layout: `AgentsRoute` renders `<Outlet />` unless `useIsExactPath("/agents")`.
- **Loader:** yes. `loader: ({ context }) => context.queryClient.ensureQueryData(agentDirectoryQuery())` → `getAgentDirectoryRead()`.
- **Queries:**
  - `routeQueryOptions` factory `agentDirectoryQuery()`: queryKey `crmQueryKeys.agents.list({ view: "directory" })`, queryFn `() => getAgentDirectoryRead()`
  - `const { data: directory } = useQuery({ ...agentDirectoryQuery(), initialData });`
- **Server functions imported:**
  - `getAgentDirectoryRead` (plus `type AgentDirectoryRead`) from `@/server-functions/agent-runs` — **this is the only server function in the file**
- **Mutations:** **absent.** No write server function is imported or called anywhere in this file.
- **Capability / permission checks:** **absent**.
- **validateSearch:** **absent**.
- **Line count:** 285
- **Polling:** `useEffect` `window.setInterval(..., 45_000)` invalidating `queryKey: crmQueryKeys.agents.list({ view: "directory" }), exact: true`.
- **Interactive controls that do NOT reach a server function (verbatim):**
  1. **Per-agent pause/enable Switch (lines 127–133) — local state + toast only:**
     ```
     <Switch
       checked={agentStates[agent.name]}
       onCheckedChange={(enabled) => {
         setAgentStates((current) => ({ ...current, [agent.name]: enabled }));
         toast.success(`${agent.display_name} ${enabled ? "enabled" : "paused"}`);
       }}
     />
     ```
     `agentStates` is seeded once from `directory.agents` (line 62-64) and never persisted. Pausing an agent is purely cosmetic.
  2. **Replay button (lines 256–265) — toast only, no replay/retry server call:**
     ```
     onClick={(event) => {
       event.stopPropagation();
       toast.message(`Replaying ${run.id}`);
     }}
     ```
  3. **Run-status filter Select (line 166)** — `onValueChange={setStatusFilter}`, filters `directory.recentRuns` client-side only (no server refetch, no search param). Not a bug, but note it does not persist to URL and does not re-query the server.
  4. **Refresh button (line 100)** — `onClick={() => void refresh()}` → cache invalidation only (legitimate).
- **Classification:** authenticated product route.

---

## 3. `src/routes/agents.$name.tsx`  ⚠️ (special attention route)

- **Route path registered:** `/agents/$name` — `createFileRoute("/agents/$name")`
- **Loader:** yes, async. Looks up `AGENT_DEFINITIONS.find((item) => item.name === params.name)` from `@/lib/agents`; `throw notFound()` when missing; then `context.queryClient.ensureQueryData(historyQuery(agent.display_name, deps.page))` → `getAgentHistoryPage({ data: { agent, page, limit: 25 } })`. Returns `{ agent, history }`. Has `loaderDeps: ({ search }) => ({ page: search.page })` and a `notFoundComponent`.
- **Queries:**
  - `routeQueryOptions` factory `historyQuery(agent, page)`: queryKey `crmQueryKeys.agents.section(agent, "history", { page, limit: 25 })`, queryFn `() => getAgentHistoryPage({ data: { agent, page, limit: 25 } })`
  - `const { data: history } = useQuery({ ...historyQuery(agent.display_name, search.page), initialData: loaderData.history });`
- **Server functions imported:**
  - `getAgentHistoryPage` from `@/server-functions/agent-runs` — **only server function in the file**
- **Mutations:** **absent.** No write server function imported or called.
- **Capability / permission checks:** **absent**.
- **validateSearch:** yes.
  ```
  const agentHistorySearchSchema = agentDetailSearchSchema.extend({
    page: z.coerce.number().int().min(1).default(1).catch(1),
  });
  ```
  `agentDetailSearchSchema` (`src/lib/admin-ux-search.ts:179`) = `z.object({ tab: z.enum(AGENT_DETAIL_TABS).optional().catch(undefined) }).passthrough()` where `AGENT_DETAIL_TABS = ["runs", "memory", "config"]`.
- **Line count:** 335
- **Interactive controls that do NOT reach a server function (verbatim) — the entire Config tab is local React state:**
  1. **Enabled / pause Switch (lines 225–231):**
     ```
     <Switch
       checked={enabled}
       onCheckedChange={(v) => {
         setEnabled(v);
         toast.success(`Agent ${v ? "enabled" : "paused"}`);
       }}
     />
     ```
     `const [enabled, setEnabled] = useState(agent.status === "active");` — local only. Note the "At a glance" panel reads this local state: `<StatusBadge value={enabled ? "active" : "paused"} />` (line 291), so the sidebar lies about persisted status.
  2. **Auto-approval Switch (lines 240–244) — local state only, no toast, no server call:**
     ```
     <Switch
       aria-label="Auto-execute without human approval"
       checked={autoApprove}
       onCheckedChange={setAutoApprove}
     />
     ```
     `const [autoApprove, setAutoApprove] = useState(!agent.human_approval);` — and line 301 `<Row label="Human approval" value={autoApprove ? "Auto-execute" : "Required"} />` reflects the unpersisted local value.
  3. **Temperature Slider (lines 253–261):** `value={temp} onValueChange={setTemp}` — `const [temp, setTemp] = useState([0.4]);` — **hardcoded default 0.4, not derived from `agent` or any server data**; never persisted.
  4. **Confidence-threshold Slider (lines 270–278):** `value={confThreshold} onValueChange={setConfThreshold}` — `const [confThreshold, setConfThreshold] = useState([0.75]);` — **hardcoded default 0.75**, never persisted.
  5. **Model:** display-only, no control. Rendered read-only at line 294: `<code className="text-xs">{agent.model}</code>` from `AGENT_DEFINITIONS`. **There is no model-selection control on this page.**
  6. **Memory tab (lines 212–217):** static placeholder copy — "Agent memory is not yet persisted…". No data source.
  - Controls that DO reach the server: the pagination buttons (lines 179–208) navigate `search.page`, which drives `loaderDeps` → `getAgentHistoryPage`; the Tabs `onValueChange` writes `search.tab` (URL only, no server call — correct behavior).
- **Classification:** authenticated product route.

---

## 4. `src/routes/reports.tsx`

- **Route path registered:** `/reports` — `createFileRoute("/reports")`
- **Loader:** yes. `loaderDeps: ({ search }) => ({ range: search.range })`; loader `ensureQueryData(routeQueryOptions({ queryKey: crmQueryKeys.reports.list({ view: "summary", ...deps }), queryFn: () => getReportSummary({ data: deps }) }))`.
- **Queries:**
  - Loader inline `routeQueryOptions`: queryKey `crmQueryKeys.reports.list({ view: "summary", ...deps })`
  - Component `useQuery` (**not** wrapped in `routeQueryOptions`):
    ```
    const datasetQuery = useQuery({
      queryKey: crmQueryKeys.reports.list({ view: "dataset", range, report: selectedReport }),
      queryFn: () => getReportDataset({ data: { range, report: selectedReport as ReportId } }),
      enabled: selectedReport !== null,
    });
    ```
    Note: this one has no `staleTime` policy since it bypasses `routeQueryOptions`.
- **Server functions imported:** `getReportDataset`, `getReportSummary` from `@/server-functions/operations`
- **Mutations:** **absent** (read-only route).
- **Capability / permission checks:** **absent**.
- **validateSearch:** yes, local schema:
  ```
  const reportSearchSchema = z.object({
    range: z.enum(["7d", "30d", "90d"]).default("30d").catch("30d"),
  });
  ```
- **Line count:** 204
- **Controls not reaching a server function:**
  - **Export CSV button (line 127) — toast only, no export server function:**
    ```
    <Button variant="outline" size="sm" onClick={() => toast.success("CSV export queued")}>
    ```
  - Report tab selection is local state only: `onValueChange={(value) => setSelectedReport(value as ReportId)}` — not persisted to the URL (the range is, the selected report is not). It does drive `datasetQuery` so it does reach the server.
- **Classification:** authenticated product route.

---

## 5. `src/routes/settings.tsx`

- **Route path registered:** `/settings` — `createFileRoute("/settings")`
- **Loader:** yes. `loader: ({ context }) => context.queryClient.ensureQueryData(settingsProductsQueryOptions())` → `getProducts({})`.
- **Queries:**
  - `const settingsProductsQueryKey = crmQueryKeys.settings.detail("products");`
  - `routeQueryOptions` factory `settingsProductsQueryOptions()`: queryKey `settingsProductsQueryKey`, queryFn `() => getProducts({})`
  - In `ProductsTab`: `const productsQuery = useQuery({ ...settingsProductsQueryOptions(), initialData: loadedProducts });`
- **Server functions imported (all from `@/server-functions/products`):** `createProduct`, `getProducts`, `updateProduct`, `deactivateProductFn`
- **Mutations (hand-rolled async, no `useMutation`) — only in `ProductsTab`:**
  - `create()` → `await createProduct({ data: { name: name || "Untitled product", category, billing_type: billingType, default_term_months: termMonths } })`; optimistic `queryClient.setQueryData<Product[]>(settingsProductsQueryKey, ...)`; invalidates `queryKey: crmQueryKeys.products.lists()`
  - `toggleActive(product)` → `product.active ? await deactivateProductFn({ data: { id: product.id } }) : await updateProduct({ data: { id: product.id, updates: { active: true } } })`; optimistic `setQueryData`; invalidates `queryKey: crmQueryKeys.products.lists()`
  - Note: neither invalidates `settingsProductsQueryKey` (`["settings","detail","products"]`) directly — they invalidate the *products* namespace, and rely on the local `setQueryData` for this page's own cache entry.
- **Capability / permission checks:** **absent** (the Team tab renders a role `Select`, but it is local state, not a permission gate).
- **validateSearch:** yes — `settingsSearchSchema` from `@/lib/admin-ux-search`: `z.object({ tab: z.enum(SETTINGS_TABS).optional().catch(undefined) }).passthrough()` with `SETTINGS_TABS = ["profile","team","pricing","products","agents","notifications","apikeys"]`.
- **Line count:** 711
- **Interactive controls that do NOT reach a server function (verbatim). 6 of the 7 tabs are entirely mock:**
  - `ProfileTab`: `<Button size="sm" onClick={() => toast.success("Profile saved")}>` — name/email are `useState("Ada Wong")` / `useState("ada@fimmick.com")` hardcoded.
  - `TeamTab`: seeded from `APP_USERS` (`@/lib/users`), not the server. `<Button size="sm" onClick={() => toast.message("Invite mocked")}>`; role `Select` `onValueChange` → `setRows(...)` local only; `<Button variant="ghost" size="sm" onClick={() => toast.message("Mocked")}>` (Remove).
  - `PricingTab`: `pricingRules` is a hardcoded module-level array; threshold inputs `onChange` → `setRows(...)`; `<Button size="sm" onClick={() => toast.success("Rules saved")}>` — no server call.
  - `AgentsTab`: seeded from `AGENT_DEFINITIONS`; **both** switches are local only —
    `onCheckedChange={(v) => setState((p) => ({ ...p, [a.name]: { ...p[a.name], approval: v } }))}` (approval) and
    `onCheckedChange={(v) => setState((p) => ({ ...p, [a.name]: { ...p[a.name], enabled: v } }))}` (enable/pause).
    This duplicates and conflicts with the same controls in `agents.tsx` and `agents.$name.tsx`; none of the three persist.
  - `NotificationsTab`: hardcoded `channels` / `events` arrays; every checkbox is `<Checkbox defaultChecked />` with **no `onCheckedChange` and no state at all** — fully inert.
  - `ApiKeysTab`: hardcoded `keys` array with literal values (`"sk_live_8a4b…f9d2"`, `"whk_a72…91ce"`); `generate()` builds a key with `Math.random()` client-side and `toast.success("New API key generated")`; copy button is `onClick={() => toast.success("Copied")}` and **does not actually write to the clipboard**.
  - Only `ProductsTab` is server-backed.
- **Classification:** authenticated product route.

---

## 6. `src/routes/admin.tsx`

- **Route path registered:** `/admin` — `createFileRoute("/admin")`, layout route rendering `<AdminShell navigation={navigation}><Outlet /></AdminShell>`
- **Loader:** **absent** — uses `beforeLoad` instead:
  ```
  beforeLoad: async () => {
    try {
      return { navigation: await getAdminNavigationFn() };
    } catch (error) {
      if (error instanceof AdminError && ["FORBIDDEN", "OUTSIDE_SCOPE"].includes(error.code)) {
        throw redirect({ to: "/" });
      }
      throw error;
    }
  },
  ```
- **Queries:** **absent** — no `routeQueryOptions` / `useQuery`; the navigation is fetched into route context and consumed via `Route.useRouteContext()`.
- **Server functions imported:** `getAdminNavigationFn` from `@/server-functions/admin-users`
- **Mutations:** absent.
- **Capability / permission checks:** yes — the `beforeLoad` catch above is the admin-section gate: `AdminError` codes `FORBIDDEN` / `OUTSIDE_SCOPE` → `throw redirect({ to: "/" })`. This is the only role gate that protects the whole `/admin` subtree.
- **validateSearch:** absent.
- **Line count:** 36
- **Controls not reaching a server function:** none (no interactive controls in this file).
- **Classification:** authenticated product route (admin subtree root).

---

## 7. `src/routes/admin.index.tsx`

- **Route path registered:** `/admin/` — `createFileRoute("/admin/")`
- **Loader:** yes. `loader: ({ context }) => context.queryClient.ensureQueryData(adminOverviewQueryOptions())`.
- **Queries:**
  - `const adminOverviewQueryKey = crmQueryKeys.admin.section("overview", "summary");`
  - `routeQueryOptions` factory `adminOverviewQueryOptions()`: queryKey `adminOverviewQueryKey`; queryFn runs both in parallel:
    ```
    const [overview, auditLogs] = await Promise.all([
      getOverview(),
      getAdminAuditSummaryFn({ data: { limit: 5 } }),
    ]);
    ```
  - `const { data } = useQuery({ ...adminOverviewQueryOptions(), initialData: loaded });`
- **Server functions imported:**
  - `getAdminAuditSummaryFn` from `@/server-functions/admin-access`
  - `getAdminOverviewFn as getOverview` from `@/server-functions/admin-users` (aliased import)
- **Mutations:** absent.
- **Capability / permission checks:** **absent in this file** — inherited from `/admin` `beforeLoad`.
- **validateSearch:** absent.
- **Line count:** 32
- **Controls not reaching a server function:** none in this file (all UI is delegated to `@/components/admin/admin-overview`).
- **Classification:** authenticated product route.

---

## 8. `src/routes/admin.people.tsx`

- **Route path registered:** `/admin/people` — `createFileRoute("/admin/people")`
- **Loader:** yes, async, with `loaderDeps: ({ search }) => ({ search })`. Runs directory + optional selected-user reads in parallel; catches `AdminError` `FORBIDDEN`/`OUTSIDE_SCOPE` and returns `{ directory: undefined, selectedUser: null, forbidden: true }` (per-user catch returns `null`).
- **Queries:**
  - `peopleDirectoryQuery(search)` (`routeQueryOptions`): queryKey `crmQueryKeys.admin.list({ resource: "people", ...toUserFilters(search) })`, queryFn `() => getAdminUsersFn({ data: toUserFilters(search) })`
  - `adminUserQuery(profileId)` (`routeQueryOptions`): queryKey `crmQueryKeys.admin.detail(profileId)`, queryFn `() => getAdminUserFn({ data: { profileId } })`
  - Loader repeats both key expressions inline: `crmQueryKeys.admin.list({ resource: "people", ...toUserFilters(search) })` and `crmQueryKeys.admin.detail(search.user)`
  - `useQuery({ ...peopleDirectoryQuery(search), initialData: loaderData.directory, enabled: !loaderData.forbidden })`
  - `useQuery({ ...adminUserQuery(search.user ?? "unselected"), initialData: loaderData.selectedUser ?? undefined, enabled: !loaderData.forbidden && Boolean(search.user) })`
  - `toUserFilters(search)` = `{ search: search.q, role, status, departmentId: search.department, teamId: search.team, page: search.page, limit: 50 }`
- **Server functions imported:**
  - from `@/server-functions/admin-users`: `changeAdminUserRoleFn`, `deactivateAdminUserWithReassignmentFn`, `getAdminReassignmentInventoryFn`, `getAdminUserFn`, `getAdminUsersFn`, `suspendAdminUserFn`
  - from `@/server-functions/admin-invitations`: `inviteUsers`
- **Mutations (hand-rolled async):** all funnel through `refreshPeople(profileId?, includeShell)` which invalidates (verbatim):
  `queryKey: crmQueryKeys.admin.lists()`; `queryKey: crmQueryKeys.admin.section("overview", "summary"), exact: true`; conditionally `queryKey: crmQueryKeys.admin.detail(profileId), exact: true`; conditionally `queryKey: crmQueryKeys.shell(), exact: true`.
  - `submitLifecycle` → `suspendAdminUserFn({ data: { profileId: input.profileId, reason: input.reason } })` (toast "User suspended") **or** `deactivateAdminUserWithReassignmentFn({ data: { profileId, reason, reviewedInventory, successors } })` (toast "User deactivated"); then `await refreshPeople(input.profileId)`
  - `InviteUsersDialog onSubmit` → `await inviteUsers({ data: { invitations } })`, toast, `await refreshPeople()`
  - `UserRoleDialog onSubmit` → `await changeAdminUserRoleFn({ data: { profileId: roleUser.id, role, reason } })`, toast, `await refreshPeople(roleUser.id, true)` (includes shell)
  - `openLifecycle()` (read, not a write) → `Promise.all([getAdminReassignmentInventoryFn({ data: { profileId: selectedUser.id } }), getAdminUsersFn({ data: { status: "active", page: 1, limit: 100 } })])`, guarded by a `lifecycleRequest` ref race counter
- **Capability / permission checks (verbatim):**
  ```
  const { profile } = Route.useRouteContext();
  const canInvite = ["super_admin", "admin", "manager"].includes(profile?.role ?? "");
  const canManageLifecycle = ["super_admin", "admin"].includes(profile?.role ?? "");
  ```
  Plus the `forbidden` branch rendering `role="alert"` "People administration is outside your access scope."
- **validateSearch:** yes — `adminPeopleSearchSchema` from `@/lib/admin/schemas`: `{ q, status, role, department, team, manager, activity: "active"|"stale"|"never", user, sort: "name"|"last_active_at"|"role"|"status", page (coerce int positive, default 1) }`, all `.catch(undefined)` except page `.catch(1)`.
- **Line count:** 287
- **Controls not reaching a server function:** none observed in this file — every dialog callback hits a server function. All rendering/controls are delegated to `@/components/admin/people-directory`, `user-detail-panel`, `invite-users-dialog`, `user-lifecycle-dialog`, `user-role-dialog` (not inventoried here).
- **Classification:** authenticated product route.

---

## 9. `src/routes/admin.people.$id.tsx`

- **Route path registered:** `/admin/people/$id` — `createFileRoute("/admin/people/$id")`
- **Loader:** yes, async. `ensureQueryData(adminUserQuery(params.id))` inside try/catch; on `AdminError` `FORBIDDEN`/`OUTSIDE_SCOPE` returns `{ user: null, forbidden: true }`.
- **Queries:**
  - `adminUserQuery(profileId)` (`routeQueryOptions`): queryKey `crmQueryKeys.admin.detail(profileId)`, queryFn `() => getAdminUserFn({ data: { profileId } })`
  - `useQuery({ ...adminUserQuery(params.id), initialData: loaderData.user ?? undefined, enabled: !loaderData.forbidden })`
- **Server functions imported:** `getAdminUserFn` from `@/server-functions/admin-users` (read only)
- **Mutations:** **absent** — this detail page is entirely read-only.
- **Capability / permission checks:** the `forbidden` branch renders `role="alert"` "This user record is outside your access scope." No `profile.role` checks in this file.
- **validateSearch:** yes — `adminUserDetailSearchSchema` from `@/lib/admin/schemas`: `z.object({ tab: z.enum(ADMIN_USER_DETAIL_TABS).optional().catch(undefined) }).passthrough()` with `ADMIN_USER_DETAIL_TABS = ["profile","access","teams","work","security","activity"]`.
- **Line count:** 193
- **Controls not reaching a server function:** the only control is the Tabs `onValueChange` → `navigate({ search: ... , replace: true })` (URL only, correct). The Access tab is a static explainer — "Role grants and scoped overrides are evaluated server-side for every protected action." plus `Base role: {user.role.replace("_", " ")}` — with no grant/override data fetched; the Security tab has no revoke-sessions action even though `revokeAdminUserSessionsFn` exists in `@/server-functions/admin-users` (**unused here**).
- **Classification:** authenticated product route.

---

## 10. `src/routes/admin.teams.tsx`

- **Route path registered:** `/admin/teams` — `createFileRoute("/admin/teams")`
- **Loader:** yes, async, `loaderDeps: ({ search }) => ({ search })`. `Promise.all` of three `ensureQueryData` calls (directory, users, optional selected unit). Returns `{ directory, users, selectedUnit }`.
- **Query keys (module-level helpers):**
  - `const adminOrganizationQueryKey = crmQueryKeys.admin.section("organization", "directory");`
  - `const adminTeamQueryKey = (kind, id) => crmQueryKeys.admin.section(`${kind}:${id}`, "organization-unit");`
  - `const adminPeopleQueryKey = (profileId?) => profileId ? crmQueryKeys.admin.detail(profileId) : crmQueryKeys.admin.section("people", "team-member-options");`
- **Queries:**
  - Loader: `routeQueryOptions({ queryKey: adminOrganizationQueryKey, queryFn: () => getAdminOrganizationFn() })`
  - Loader: `routeQueryOptions({ queryKey: adminPeopleQueryKey(), queryFn: async () => { await Promise.resolve(getAdminUsersFn); return loadUsers(); } })` — note the odd `await Promise.resolve(getAdminUsersFn)` no-op with the comment "Keep the permitted people read concurrent with the organization directory."
  - Loader: `routeQueryOptions({ queryKey: adminTeamQueryKey(search.kind, search.unit), queryFn: () => getAdminOrganizationUnitFn({ data: { kind: search.kind, id: search.unit! } }).catch(...) })`
  - Component: `useQuery({ ...routeQueryOptions({ queryKey: adminOrganizationQueryKey, queryFn: () => getAdminOrganizationFn() }), initialData: loaded.directory, placeholderData: (previous) => previous })`
  - Component: `useQuery({ ...routeQueryOptions({ queryKey: adminPeopleQueryKey(), queryFn: loadUsers }), initialData: loaded.users, placeholderData: (previous) => previous })`
  - Component: `useQuery({ ...routeQueryOptions({ queryKey: adminTeamQueryKey(search.kind, search.unit ?? "none"), queryFn: () => (search.unit ? loadUnit(search.kind, search.unit) : Promise.resolve(null)) }), initialData: loaded.selectedUnit, placeholderData: (previous) => previous, enabled: Boolean(search.unit) })`
- **Server functions imported:**
  - from `@/server-functions/admin-teams`: `createDepartmentFn`, `createTeamFn`, `endAdminTeamMembershipFn`, `getAdminOrganizationFn`, `getAdminOrganizationUnitFn`, `updateDepartmentFn`, `updateTeamFn`, `upsertAdminTeamMembershipFn`
  - from `@/server-functions/admin-users`: `getAdminUsersFn`
- **Mutations (hand-rolled async):** all end in `refreshOrganization(kind, id, profileIds, includeShell)` which invalidates each of these keys with `exact: true` (verbatim list):
  `adminOrganizationQueryKey`, `adminTeamQueryKey(kind, id)`, `adminPeopleQueryKey()`, `...profileIds.map((profileId) => adminPeopleQueryKey(profileId))`, `...(includeShell ? [crmQueryKeys.shell()] : [])`
  - `saveUnit(value)` → department: `updateDepartmentFn({ data: { id: value.id, input } })` or `createDepartmentFn({ data: input })`; team: `updateTeamFn({ data: { id: value.id, input } })` or `createTeamFn({ data: input })`; toast; `refreshOrganization(value.kind, value.id ?? saved.id, profileIds, true)`
  - `addMembers(profileIds, startsAt, endsAt)` → `Promise.all(profileIds.map(...upsertAdminTeamMembershipFn({ data: { teamId, profileId, membershipRole: "member", ...startsAt, ...endsAt } })))`; `refreshOrganization("team", selectedUnit.unit.id, profileIds, true)`
  - `updateMember(member, role)` → `upsertAdminTeamMembershipFn({ data: { teamId, profileId, membershipRole: role, ... } })`; `refreshOrganization("team", member.teamId, [member.profileId], true)`
  - `endMember(member)` → `endAdminTeamMembershipFn({ data: { teamId, profileId, endedAt: new Date().toISOString() } })`; `refreshOrganization("team", member.teamId, [member.profileId], true)`
- **Capability / permission checks (verbatim):**
  ```
  const actorRole = profile?.role ?? "read_only";
  const canManageDepartment = ["super_admin", "admin"].includes(actorRole);
  const canManageTeam = ["super_admin", "admin", "manager"].includes(actorRole);
  const canManageSelected = selectedUnit ? (selectedUnit.kind === "department" ? canManageDepartment : canManageTeam) : false;
  ```
  Plus `createUnit(kind)` which toasts `"Department management is outside your access scope."` / `"Team management is outside your access scope."` and returns early. Handlers are passed conditionally: `onAddMembers={canManageSelected ? addMembers : undefined}` etc. Also `loadUsers()` and `loadUnit()` swallow `FORBIDDEN`/`OUTSIDE_SCOPE` (and `CONFLICT` for units) returning `[]` / `null`.
- **validateSearch:** yes — `adminOrganizationSearchSchema` from `@/lib/admin/schemas`: `{ kind: "department"|"team" default "department", tab: enum ADMIN_ORGANIZATION_TABS ["overview","members","work","permissions","activity"] default "overview", q, status: "active"|"archived"|"all" default "active", unit }`.
- **Line count:** 316
- **Controls not reaching a server function:** none in this file. All UI is delegated to `@/components/admin/organization-directory`, `organization-unit-detail`, `organization-unit-dialog`.
- **Classification:** authenticated product route.

---

## 11. `src/routes/admin.teams.$id.tsx`

- **Route path registered:** `/admin/teams/$id` — `createFileRoute("/admin/teams/$id")`
- **Loader:** yes, async, `loaderDeps: ({ search }) => ({ search })`. `Promise.all([ensureQueryData(detailQuery(deps.search.kind, params.id)), ensureQueryData(usersQuery())])` → `{ detail, users }`. **No AdminError catch in this loader** (unlike `admin.teams.tsx` / `admin.people.tsx`) — `getAdminOrganizationUnitFn` throwing FORBIDDEN here propagates to the error boundary.
- **Queries:**
  - `detailQuery(kind, id)` (`routeQueryOptions`): queryKey `adminTeamQueryKey(kind, id)` = `crmQueryKeys.admin.section(`${kind}:${id}`, "organization-unit")`, queryFn `() => getAdminOrganizationUnitFn({ data: { kind, id } })`
  - `usersQuery()` (`routeQueryOptions`): queryKey `adminPeopleQueryKey()` = `crmQueryKeys.admin.section("people", "team-member-options")`, queryFn `loadUsers`
  - `useQuery({ ...detailQuery(search.kind, loaded.detail?.unit.id ?? "missing"), initialData: loaded.detail, placeholderData: (previous) => previous })` — note the key uses the **loaded unit id**, not `params.id`
  - `useQuery({ ...usersQuery(), initialData: loaded.users, placeholderData: (previous) => previous })`
  - Also declares `const adminOrganizationQueryKey = crmQueryKeys.admin.section("organization", "directory");` used only for invalidation.
- **Server functions imported:**
  - from `@/server-functions/admin-teams`: `endAdminTeamMembershipFn`, `getAdminOrganizationUnitFn`, `updateDepartmentFn`, `updateTeamFn`, `upsertAdminTeamMembershipFn` (**no create\* functions here** — this page edits only)
  - from `@/server-functions/admin-users`: `getAdminUsersFn`
- **Mutations (hand-rolled async):** same `refreshOrganization` invalidation set as `admin.teams.tsx` (`adminOrganizationQueryKey`, `adminTeamQueryKey(kind, id)`, `adminPeopleQueryKey()`, per-profile detail keys, optional `crmQueryKeys.shell()`, all `exact: true`).
  - `saveUnit(value)` → early-return `if (!value.id) return;` then `updateDepartmentFn({ data: { id, input } })` or `updateTeamFn({ data: { id, input } })`; toast "Organization unit updated"; `refreshOrganization(value.kind, value.id, profileIds, true)`
  - `addMembers` → `upsertAdminTeamMembershipFn` per profile; toast `profileIds.length + " members added"`; refresh
  - `updateMember` → `upsertAdminTeamMembershipFn`; **no toast here** (differs from `admin.teams.tsx`); refresh
  - `endMember` → `endAdminTeamMembershipFn({ data: { teamId, profileId, endedAt: new Date().toISOString() } })`; **no toast**; refresh
- **Capability / permission checks (verbatim):**
  ```
  const actorRole = profile?.role ?? "read_only";
  const canManage =
    detail?.kind === "department"
      ? ["super_admin", "admin"].includes(actorRole)
      : ["super_admin", "admin", "manager"].includes(actorRole);
  ```
  Handlers passed conditionally: `onAddMembers={canManage ? addMembers : undefined}`, `onUpdateMember`, `onEndMember`. `loadUsers()` swallows FORBIDDEN/OUTSIDE_SCOPE → `[]`.
- **validateSearch:** yes — `adminOrganizationSearchSchema` (same schema as `/admin/teams`).
- **Line count:** 250
- **Controls not reaching a server function:** none in this file; UI delegated to `organization-unit-detail` / `organization-unit-dialog`.
- **Classification:** authenticated product route.

---

## 12. `src/routes/admin.access.tsx`

- **Route path registered:** `/admin/access` — `createFileRoute("/admin/access")`
- **Loader:** yes, async, `loaderDeps: ({ search }) => ({ search })`. `Promise.all` of requests + users + optional overrides, then a follow-up `ensureQueryData(overridesQueryOptions(selectedProfileId))` when the selected profile defaults to `users.items[0]?.id`. Catches `AdminError` FORBIDDEN/OUTSIDE_SCOPE → `{ requests: [], users: [], selectedUser: null, overrides: [], forbidden: true }`.
- **Query keys (module-level):**
  - `crmQueryKeys.admin.section("overview", "summary")`, `crmQueryKeys.admin.section("organization", "directory")`
  - `const adminTeamQueryKey = (teamId: string) => crmQueryKeys.admin.section(`team:${teamId}`, "organization-unit");`
  - `const accessRequestsQueryKey = (search) => crmQueryKeys.admin.list({ scope: "access-requests", status: search.requestStatus });`
  - `const accessUsersQueryKey = crmQueryKeys.admin.list({ scope: "access-users", status: "active", page: 1, limit: 100 });`
  - `const accessOverridesQueryKey = (profileId) => crmQueryKeys.admin.section(profileId, "access-overrides", { includeHistory: true });`
- **Queries (all `routeQueryOptions` factories):**
  - `requestsQueryOptions(search)`: queryKey `accessRequestsQueryKey(search)`, queryFn `() => getAdminAccessRequestsFn({ data: { status: search.requestStatus } })`
  - `usersQueryOptions()`: queryKey `accessUsersQueryKey`, queryFn `() => getAdminUsersFn({ data: { status: "active", page: 1, limit: 100 } })`
  - `overridesQueryOptions(profileId)`: queryKey `accessOverridesQueryKey(profileId)`, queryFn `() => getAdminOverridesFn({ data: { profileId, includeHistory: true } }) as Promise<PermissionOverrideRecord[]>`
  - `useQuery({ ...requestsQueryOptions(search), initialData: loaded.requests })`
  - `useQuery({ ...usersQueryOptions(), initialData: { items: loaded.users, total: loaded.users.length, page: 1, limit: 100 } })`
  - `useQuery({ ...overridesQueryOptions(selectedUser?.id ?? "unselected"), initialData: loaded.overrides, enabled: Boolean(selectedUser) })`
- **Server functions imported:**
  - from `@/server-functions/admin-access`: `createAdminPermissionOverrideFn`, `decideAdminAccessRequestFn`, `getAdminAccessRequestsFn`, `getAdminOverridesFn`
  - from `@/server-functions/admin-users`: `getAdminUsersFn`
  - (`revokeAdminPermissionOverrideFn` exists in `admin-access.ts` but is **not** imported here — there is no revoke control on this page.)
- **Mutations (hand-rolled async):** both call `refreshAdminAccessCaches(profileId?, teamId?)`, which builds keys by scanning the cache:
  ```
  const adminListKeys = queryClient.getQueriesData({ queryKey: crmQueryKeys.admin.lists() }).map(([queryKey]) => queryKey);
  const requestKeys = adminListKeys.filter((queryKey) => { const scope = (queryKey[2] as { scope?: string } | undefined)?.scope; return scope === "access-requests"; });
  const auditKeys = adminListKeys.filter((queryKey) => (queryKey[2] as { scope?: string } | undefined)?.scope === "audit");
  const keys = [accessUsersQueryKey, adminOverviewQueryKey, crmQueryKeys.shell(), ...requestKeys, ...auditKeys];
  // + accessOverridesQueryKey(profileId), crmQueryKeys.admin.detail(profileId) when profileId
  // + adminOrganizationQueryKey, adminTeamQueryKey(teamId) when teamId
  ```
  all invalidated with `exact: true`.
  - `decide(input)` → `await decideAdminAccessRequestFn({ data: input })`; toast `input.decision === "approved" ? "Access approved" : "Access rejected"`; `refreshAdminAccessCaches(request?.requesterProfileId, request?.teamId ?? undefined)`
  - `createOverride(input)` → `await createAdminPermissionOverrideFn({ data: { profileId, capability, effect, reason, ...(input.expiresAt ? { expiresAt: input.expiresAt } : {}) } })`; toast "Permission override created"; `refreshAdminAccessCaches(input.profileId)`
- **Capability / permission checks (verbatim):**
  - `forbidden` branch → `role="alert"` "Access review is outside your access scope."
  - `actorRole={profile?.role ?? "read_only"}` passed to `AccessRequestQueue`
  - `{profile?.role === "super_admin" ? (<button ... onClick={() => setOverrideOpen(true)}>Create override</button>) : null}`
  - `canCreateOverride={profile?.role === "super_admin"}` on `PermissionOverrideDialog`
  - Reads `ROLE_GRANTS` from `@/lib/admin/policy` and `CAPABILITIES` from `@/lib/admin/types` for the effective-access table: `roleDefaults={CAPABILITIES.map((capability) => ({ capability, allowed: ROLE_GRANTS[selectedUser.role].has(capability) }))}`
  - Client-side active/expired split: `activeOverrides = overrides.filter((entry) => !entry.revokedAt && (!entry.expiresAt || Date.parse(entry.expiresAt) > Date.now()))`
- **validateSearch:** yes — `adminAccessSearchSchema` from `@/lib/admin/schemas`: `{ tab: "requests"|"effective" default "requests", profile, requestStatus: "pending"|"approved"|"rejected"|"cancelled"|"all" default "pending" }`.
- **Line count:** 335
- **Controls not reaching a server function:** the tab buttons and the Profile `<select>` write search params only (`updateSearch`) which correctly re-drive queries. No stubbed/toast-only controls. Gap worth noting: there is **no revoke-override control**, so `revokeAdminPermissionOverrideFn` is unreachable from the UI.
- **Classification:** authenticated product route.

---

## 13. `src/routes/admin.audit.tsx`

- **Route path registered:** `/admin/audit` — `createFileRoute("/admin/audit")`
- **Loader:** yes. `loaderDeps: ({ search }) => ({ search })`; `loader: ({ context, deps: { search } }) => context.queryClient.ensureQueryData(auditQueryOptions(search))`.
- **Queries:**
  - `const auditQueryKey = (search) => crmQueryKeys.admin.list({ scope: "audit", ...auditFilters(search) });`
  - `auditQueryOptions(search)` (`routeQueryOptions`): queryKey `auditQueryKey(search)`; queryFn wraps `getAdminAuditLogsFn({ data: auditFilters(search) })` in try/catch returning `{ data, forbidden: false }` or, on FORBIDDEN/OUTSIDE_SCOPE, `{ data: { items: [], total: 0, page: 1, limit: 50 }, forbidden: true }`
  - `const { data: auditRead } = useQuery({ ...auditQueryOptions(search), initialData: loaded });`
  - `auditFilters(search)` = `{ actorProfileId: search.actor, targetType, targetId: search.target, action, severity, from, to, page: search.page, limit: 50 }`
- **Server functions imported:** `exportAdminAuditLogsFn`, `getAdminAuditLogsFn` from `@/server-functions/admin-access`
- **Mutations:** no writes. One side-effecting read:
  - `exportAudit()` → `const result = await exportAdminAuditLogsFn({ data: auditFilters(search) });` then builds a `Blob` of `JSON.stringify(result.items, null, 2)`, creates an `<a download="fimmick-admin-audit.json">`, clicks it, revokes the URL, `toast.success("Audit export prepared")`; catch → `toast.error(...)`. **No cache invalidation** (nothing to invalidate).
- **Capability / permission checks:** the `forbidden` branch renders `role="alert"` "Audit review is outside your access scope." No `profile.role` checks in this file.
- **validateSearch:** yes — `adminAuditSearchSchema` from `@/lib/admin/schemas`: `{ actor, targetType, target, action, severity: "info"|"warning"|"critical", from: iso datetime, to: iso datetime, page: coerce int positive default 1 }`.
- **Line count:** 191
- **Controls not reaching a server function:** none toast-only. Two notes: (a) the filter form renders raw `<input>` / `<select>` elements with Tailwind classes rather than shadcn `Input`/`Select` — inconsistent with the rest of the codebase; (b) the schema supports `from`/`to` and `submitFilters` spreads `...search`, but **there are no `from`/`to` inputs rendered** even though `const [from, setFrom] = useState(...)` and `const [to, setTo] = useState(...)` are declared (lines 66–67) — those two state variables are dead.
- **Classification:** authenticated product route.

---

## 14. `src/routes/notifications.tsx`

- **Route path registered:** `/notifications` — `createFileRoute("/notifications")`
- **Loader:** yes.
  ```
  loader: ({ context }) =>
    context.queryClient.ensureQueryData(
      routeQueryOptions({
        queryKey: crmQueryKeys.notifications.list({}),
        queryFn: () => getNotifications(),
      }),
    ),
  ```
- **Queries:**
  - Loader-only inline `routeQueryOptions`: queryKey `crmQueryKeys.notifications.list({})`
  - The component does **not** call `useQuery` directly; it uses `useNotifications()` from `@/hooks/use-notifications`, which internally runs `useQuery(routeQueryOptions({ queryKey: notificationsQueryKey, queryFn: () => getNotifications() }))` where `const notificationsQueryKey = crmQueryKeys.notifications.list({});`
- **Server functions imported:** `getNotifications` from `@/server-functions/notifications` (route file). Via the hook, also `markNotificationReadFn` and `markAllNotificationsReadFn` from the same module.
- **Mutations:** delegated to `useNotifications()` (hand-rolled optimistic updates with a `Map<string, symbol>` token ref, no `useMutation`):
  - `markAsRead(id)` → `await markNotificationReadFn({ data: { id } })`; rollback on throw; then `await queryClient.invalidateQueries({ queryKey: notificationsQueryKey, exact: true })`
  - `markAllRead()` → `await markAllNotificationsReadFn()`; rollback on throw; then `await queryClient.invalidateQueries({ queryKey: notificationsQueryKey, exact: true })`
  - Route-level bindings: `onClick={markAllRead}` (line 114) and `onClick={() => markAsRead(n.id)}` (line 186).
- **Capability / permission checks:** **absent**.
- **validateSearch:** yes, local schema:
  ```
  const notificationSearchSchema = z.object({
    filter: z.enum(["all","unread","approval_pending","renewal_window","risk_change","stale_touchpoint"]).default("all").catch("all"),
  });
  ```
- **Line count:** 202
- **Controls not reaching a server function:** filter tab buttons write `search.filter` and filter client-side (`useMemo`) — no server round-trip by design; that is fine since the whole list is already loaded. The "Open" link uses `notificationLink(n)` with a `as never` cast: `<Link to={notificationLink(n) as never}>` — type-unsafe navigation worth flagging for the revision. No toast-only stubs.
- **Classification:** authenticated product route.

---

## 15. `src/routes/invite.$token.tsx`

- **Route path registered:** `/invite/$token` — `createFileRoute("/invite/$token")`
- **Loader:** yes, async.
  ```
  loader: async ({ params }) => {
    try {
      const preview = await getInvitationPreview({ data: { token: params.token } });
      return { state: "ready" as const, preview };
    } catch {
      return { state: "unavailable" as const };
    }
  },
  ```
  Note: bare `catch {}` — swallows every error class, not just invalid-token.
- **Queries:** **absent** — no `routeQueryOptions`, no `useQuery`. The loader calls the server function directly with no query cache involvement.
- **Server functions imported:** `getInvitationPreview` from `@/server-functions/admin-invitations`
- **Mutations:** absent.
- **Capability / permission checks:** absent (public route by design).
- **validateSearch:** **absent**.
- **Line count:** 68
- **Controls not reaching a server function:** none — the page renders `<LoginAuthPage authPath="sign-up" redirectTo={`/invite/${encodeURIComponent(token)}/complete`} ... />` (auth flow owned by `@/components/auth/login-auth-page`) or the `InvitationUnavailable` panel with a `<Link to="/login">`.
- **Classification:** **public / auth route** (matched by `isPublicAuthPath` via the `/invite/` prefix; root `beforeLoad` skips the shell fetch and `RootComponent` renders a bare `<Outlet />` with no sidebar).

---

## 16. `src/routes/invite.$token.complete.tsx`

- **Route path registered:** `/invite/$token/complete` — `createFileRoute("/invite/$token/complete")`
- **Loader:** yes, async, and it performs the **write**:
  ```
  loader: async ({ params }) => {
    try {
      await acceptUserInvitation({ data: { token: params.token } });
    } catch {
      return { state: "error" as const };
    }
    throw redirect({ href: "/account?welcome=1" });
  },
  ```
  A mutation executed in a loader (so a route re-load re-invokes it), and the success path is a thrown `redirect({ href: ... })` (href, not `to:`). Bare `catch {}` again.
- **Queries:** **absent**.
- **Server functions imported:** `acceptUserInvitation` from `@/server-functions/admin-invitations`
- **Mutations:** `acceptUserInvitation({ data: { token: params.token } })` — invalidates **nothing** (no queryClient access in the loader signature used here).
- **Capability / permission checks:** absent.
- **validateSearch:** **absent**.
- **Line count:** 42
- **Controls not reaching a server function:** the only rendered control is the error-state `<Link to="/login">` — correct.
- **Classification:** **public / auth route** (`/invite/` prefix).

---

## 17. `src/routes/login.tsx`

- **Route path registered:** `/login` — `createFileRoute("/login")`
- **Loader:** **absent**.
- **Queries:** **absent**.
- **Server functions imported:** **none**.
- **Mutations:** absent.
- **Capability / permission checks:** absent.
- **validateSearch:** **absent**.
- **Line count:** 18
- **Controls not reaching a server function:** none in this file. It reads `pathname` via `useRouterState` and renders `<LoginAuthPage authPath={getLoginAuthPath(pathname)} />` (`getLoginAuthPath` from `@/lib/auth/auth-routes`, defaults to `"sign-in"`). All auth interaction lives in `src/components/auth/login-auth-page.tsx`.
- **Classification:** **public / auth route**.

---

## 18. `src/routes/login.$authPath.tsx`

- **Route path registered:** `/login/$authPath` — `createFileRoute("/login/$authPath")`
- **Loader:** **absent**.
- **Queries:** **absent**.
- **Server functions imported:** **none**.
- **Mutations:** absent.
- **Capability / permission checks:** absent.
- **validateSearch:** **absent**. The `$authPath` param is taken raw — `const { authPath } = Route.useParams();` — and passed straight to `<LoginAuthPage authPath={authPath} />` with no enum validation.
- **Line count:** 14
- **Controls not reaching a server function:** none in this file.
- **Classification:** **public / auth route**.

---

# Classification Summary

**Authenticated product routes (13)** — root `beforeLoad` fetches `crmQueryKeys.shell()` → `getAppShellRead()`; rendered inside `SidebarProvider` / `AppSidebar` chrome:
`/ai-review`, `/agents`, `/agents/$name`, `/reports`, `/settings`, `/admin`, `/admin/`, `/admin/people`, `/admin/people/$id`, `/admin/teams`, `/admin/teams/$id`, `/admin/access`, `/admin/audit`, `/notifications`
(the `/admin*` subtree is additionally gated by `admin.tsx` `beforeLoad` → `getAdminNavigationFn()` with redirect-to-`/` on `FORBIDDEN`/`OUTSIDE_SCOPE`)

**Public / auth routes (4)** — matched by `isPublicAuthPath`, no shell fetch, bare `<Outlet />`, no sidebar:
`/login`, `/login/$authPath`, `/invite/$token`, `/invite/$token/complete`

---

# Cross-Cutting Findings for the Revision Project

1. **No `useMutation` anywhere in this route set.** Every write is a bare `async` handler + manual `invalidateQueries`. Consequences: no `isPending` from the mutation layer (`ai-review.tsx` hand-rolls `submittingId`; `settings.tsx` `ProductsTab` has **no** pending state at all), and error handling is inconsistent — `ai-review.tsx` and `admin.audit.tsx` try/catch with `toast.error`, while `settings.tsx` `create` / `toggleActive`, `admin.teams.tsx`, and `admin.teams.$id.tsx` have **no catch**, so a rejected server function surfaces as an unhandled promise rejection.
2. **No `useSuspenseQuery` anywhere in this set.** The universal pattern is loader `ensureQueryData` + `useQuery({...opts, initialData})`.
3. **Agent controls are triple-duplicated and all three copies are mock.** The same enable/pause and approval toggles exist in `agents.tsx` (per-card Switch), `agents.$name.tsx` (Config tab), and `settings.tsx` `AgentsTab` — none writes to the server, and there is no agent-config server function in `@/server-functions/agent-runs` (only `getAgentDirectoryRead`, `getAgentHistoryPage`, `getAiReviewRead` — all GET). Temperature (0.4) and confidence threshold (0.75) are hardcoded client defaults. **Replay is a toast.** Model is display-only. There is no retry control anywhere in the agents routes.
4. **`settings.tsx` is 711 lines and 6 of 7 tabs are non-functional mock UI** (Profile, Team, Pricing, Agents, Notifications, API keys). Only Products is server-backed. The API-keys tab renders literal fake key strings and a `Math.random()` generator.
5. **Query-key helper duplication:** `adminOrganizationQueryKey` / `adminTeamQueryKey` / `adminPeopleQueryKey` / `loadUsers` / `refreshOrganization` are copy-pasted verbatim between `admin.teams.tsx` and `admin.teams.$id.tsx`; `adminOverviewQueryKey` appears in `admin.index.tsx`, `admin.people.tsx`, and `admin.access.tsx`.
6. **Inconsistent FORBIDDEN handling:** `admin.people.tsx`, `admin.people.$id.tsx`, `admin.access.tsx`, `admin.audit.tsx` catch `AdminError` FORBIDDEN/OUTSIDE_SCOPE and render a `role="alert"` panel; `admin.teams.tsx` swallows it inside `loadUsers`/`loadUnit`; `admin.teams.$id.tsx` does **not** catch at all.
7. **Unreachable server functions in this route set:** `revokeAdminPermissionOverrideFn`, `revokeAdminUserSessionsFn`, `reactivateAdminUserFn`, `updateAdminUserFn`, `createAdminAccessRequestFn`, `createAdminWorkDelegationFn`, `cancelAdminWorkDelegationFn`, `resendUserInvitation`, `revokeUserInvitation` — all exported but not imported by any route file in this inventory.