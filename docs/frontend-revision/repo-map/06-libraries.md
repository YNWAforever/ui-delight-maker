# Library API Report — `ui-delight-maker` (branch `feat/clientops-frontend-revision`)

All paths absolute under `C:/Users/laich/Documents/FIMMICK ClientOps/ui-delight-maker/`.

---

## 1. `src/lib/query-keys.ts` — FULL public API

**File has no imports.** Three exports total (two named + the internal factory is *not* exported).

### Exported: `normalizeQueryFilters(filters: QueryFilters = {}): QueryFilters`
- `type QueryFilters = Record<string, unknown>` (module-local, **not exported**).
- Delegates to module-private `normalizeQueryValue`, which: maps arrays recursively; for plain objects drops `undefined`-valued entries, sorts remaining keys by `localeCompare`, recurses on values; returns scalars unchanged.

### Private factory: `createRouteQueryKeys(route: string)`
Every `crmQueryKeys.<domain>` built from it has exactly these five factories:

| Factory | Signature | Array produced |
|---|---|---|
| `all` | `() => readonly [route]` | `[route]` |
| `lists` | `() => readonly [route, "list"]` | `[route, "list"]` |
| `list` | `(filters: QueryFilters = {}) => readonly [route, "list", QueryFilters]` | `[route, "list", normalizeQueryFilters(filters)]` |
| `detail` | `(id: string) => readonly [route, "detail", id]` | `[route, "detail", id]` |
| `section` | `(id: string, section: string, filters?: QueryFilters)` | with filters: `[route, "detail", id, "section", section, normalizeQueryFilters(filters)]`; **without** filters: `[route, "detail", id, "section", section]` (5 elements, no trailing object) |

### Exported: `crmQueryKeys`

Two standalone functions:
- `shell: () => ["shell"] as const`
- `dashboard: () => ["dashboard"] as const`

Twenty-three `createRouteQueryKeys(...)` domains — **property name → route string** (they differ; this is the load-bearing detail):

| Property | Route string |
|---|---|
| `account` | `"account"` |
| `accounts` | `"accounts"` |
| `admin` | `"admin"` |
| `aiReview` | `"ai-review"` |
| `agents` | `"agents"` |
| `approvals` | `"approvals"` |
| `campaigns` | `"campaigns"` |
| `clients` | `"clients"` |
| `contacts` | `"contacts"` |
| `deals` | `"deals"` |
| `engagements` | `"engagements"` |
| `jobSheets` | `"job-sheets"` |
| `leads` | `"leads"` |
| `notifications` | `"notifications"` |
| `pipeline` | `"pipeline"` |
| `products` | `"products"` |
| `projects` | `"projects"` |
| `quotes` | `"quotes"` |
| `relationships` | `"relationships"` |
| `renewals` | `"renewals"` |
| `reports` | `"reports"` |
| `settings` | `"settings"` |
| `tasks` | `"tasks"` |

Note `account` and `accounts` are **two separate domains** with two separate route strings — keys under them never overlap.

Plus one hand-written domain with a **different shape** (no `"detail"`/`"section"` segments, no `lists()`, no filters on `section`):

```
companyWorkspace: {
  all:    () => ["company-workspace"],
  list:   (filters: QueryFilters = {}) => ["company-workspace", "list", normalizeQueryFilters(filters)],
  detail: (accountId: string) => ["company-workspace", accountId],
  section:(accountId: string, section: string) => ["company-workspace", accountId, section],
}
```

**Usage facts (grep over `src/`):** `deals`, `pipeline`, and `projects` have **zero call sites** — they are dead key families. Highest-traffic: `clients.section` (21), `shell` (15), `admin.section` (12), `tasks.lists` (9), `leads.detail` (9).

**Contract tests that will fail on drift:** `src/lib/__tests__/query-keys.test.ts` and `src/routes/__tests__/route-query-keys.test.ts` (the latter asserts detail/list separation, per-record section isolation, and that domain-root invalidation reaches detail keys without evicting sibling domains).

---

## 2. `src/lib/route-query.ts`

Single export.

```ts
export function routeQueryOptions<TQueryFnData, TQueryKey extends QueryKey>(
  options: {
    queryKey: TQueryKey;
    queryFn: QueryFunction<TQueryFnData, TQueryKey>;
    staleTime?: number;
  },
)
```

Behaviour: returns `queryOptions({ ...options, staleTime: options.staleTime ?? CRM_STALE_TIME_MS })`. The local type `RouteQueryOptions<...>` is **not exported**. `CRM_STALE_TIME_MS` comes from `./performance/query-policy` and is `30_000`. Nothing else is injected — no `gcTime`, no `retry` (those come from the client defaults in `createAppQueryClient`, which sets `staleTime: 30_000`, `gcTime: 300_000`, `refetchOnWindowFocus: true`, `retry: shouldRetryRead`).

---

## 3. `src/lib/format.ts` — every export

Module header: `// SSR-safe formatters. Fixed locale + UTC so server and client render identically.`

Module-private singletons (created once at module scope, not per call):
- `DATE` = `Intl.DateTimeFormat("en-GB", { day:"2-digit", month:"short", year:"numeric", timeZone:"UTC" })`
- `TIME` = `Intl.DateTimeFormat("en-GB", { hour:"2-digit", minute:"2-digit", hour12:false, timeZone:"UTC" })`
- `COUNT` = `Intl.NumberFormat("en-US", { maximumFractionDigits: 0 })`
- `COMPACT_COUNT` = `Intl.NumberFormat("en-US", { notation:"compact", compactDisplay:"short", maximumFractionDigits: 1 })`
- `parseDate(value)` — returns `Date | null`; `null` for nullish and for `NaN` timestamps.

| Export | Signature | Formats | Empty-value output |
|---|---|---|---|
| `formatDateTime` | `(value: string \| Date \| null \| undefined) => string` | `` `${DATE}, ${TIME}` `` e.g. `27 Aug 2026, 14:05` | `"—"` |
| `formatDate` | `(value: string \| Date \| null \| undefined) => string` | `27 Aug 2026` | `"—"` |
| `formatTime` | `(value: string \| Date \| null \| undefined) => string` | `14:05` (24h, UTC) | `"—"` |
| `formatPercent` | `(value: number \| null \| undefined) => string` | `${Math.round(value*100)}%` — expects a **0–1 fraction** | `"—"` |
| `formatCount` | `(value: number \| null \| undefined) => string` | integer w/ thousands separators | `COUNT.format(0)` → `"0"` (not `"—"`) |
| `formatCurrencyAmount` | `(value: number \| null \| undefined, currency: string \| null \| undefined = "HKD") => string` | `` `${currency} ${COUNT.format(value ?? 0)}` `` | `"HKD 0"` |
| `formatHKD` | `(n: number \| null \| undefined) => string` | `formatCurrencyAmount(n, "HKD")` | `"HKD 0"` |
| `formatCompactHKD` | `(n: number \| null \| undefined) => string` | `` `HKD ${COMPACT_COUNT.format(n ?? 0)}` `` e.g. `HKD 1.2M` | `"HKD 0"` |
| `relativeTime` | `(iso: string, now: number) => string` | `Ns/Nm/Nh/Nd` + `"ago"` \| `"from now"` | n/a — no null handling, `iso` is required |

**How SSR/hydration safety is achieved (three mechanisms):**
1. **Fixed locale + fixed timezone.** Every `Intl` formatter pins `"en-GB"`/`"en-US"` and `timeZone: "UTC"`, so the server's locale/TZ cannot diverge from the browser's.
2. **`relativeTime` takes `now` as a parameter** rather than calling `Date.now()` internally. The docblock records that it previously pinned a hard-coded "now" which kept SSR/CSR in agreement but froze timestamps at 2026-05-20 — by mid-2026 the app reported an hour-old notification as two months in the future.
3. Callers are directed to `useClientNow()` (`src/hooks/use-client-now.ts`): returns `number | null`, `null` on the server and on the first client render, then `Date.now()` after mount, re-ticking every `intervalMs` (default `30_000`).

40 files import `@/lib/format`. Tests: `src/lib/__tests__/format.test.ts`, `src/lib/__tests__/relative-time.test.ts`.

Adjacent, **not** in format.ts: `src/lib/money.ts` exports `toAmount(value: number|string|null|undefined): number`, `sumAmounts<T>(rows, select): number`, `roundToMoney(value): number` — arithmetic over Postgres `numeric` columns that arrive as strings.

---

## 4. `src/lib/operational-invalidation.ts` — **does this already fill the role of a proposed `src/lib/invalidate.ts`? Partially, and it is currently dead code.**

Full contents are 1 export, 1 module-private union type, ~30 lines.

```ts
import { crmQueryKeys } from "@/lib/query-keys";

type OperationalMutation =            // NOT exported
  | { type: "task-status"; id: string }
  | { type: "approval-decision"; id: string }
  | { type: "notification-read"; id: string }
  | { type: "agent-run"; agent: string };

export function getOperationalMutationKeys(mutation: OperationalMutation)
```

Return values (arrays of query keys — it does **not** touch a `QueryClient`, does **not** call `invalidateQueries`, is **not** async):

| Mutation | Keys returned |
|---|---|
| `task-status` | `[tasks.detail(id), tasks.lists()]` |
| `approval-decision` | `[approvals.detail(id), approvals.lists(), aiReview.all()]` |
| `notification-read` | `[notifications.detail(id), notifications.lists(), shell()]` |
| `agent-run` | `[agents.section(agent, "history"), agents.lists(), aiReview.all()]` |

**Coverage: 4 mutation families only** — tasks, approvals, notifications, agent runs. Not covered: leads, quotes, clients, accounts, job sheets, campaigns, engagements, renewals, relationships, admin/users/teams/access, products, settings, company-workspace.

**Integrity finding — zero production importers.** Grep across `src/`: the only importer is its own test `src/lib/__tests__/operational-invalidation.test.ts`. No route, component, or hook calls `getOperationalMutationKeys`. Meanwhile there are **58 raw `invalidateQueries` call sites across 24 non-test files** (`src/routes/*.tsx` mostly: account, accounts, admin.access, admin.people, admin.teams(.$id), agents, ai-review, approvals, campaigns.$id, clients.$id, clients, index, job-sheets.$id, leads.$id, leads, quotes.$id, quotes.new, relationships, settings, tasks; plus `src/components/renewals/renewals-preview-panel.tsx`, `src/hooks/use-notifications.ts`, `src/lib/company-workspace/invalidation.ts`).

**A second, genuinely-used invalidation helper exists: `src/lib/company-workspace/invalidation.ts`.** This one *does* take a `QueryClient` and is the closer model for a general `invalidate.ts`:

```ts
export type CompanyWorkspaceQueryTarget = "overview" | CompanyWorkspaceSection;
export type CompanyWorkspaceMutation = "dismiss_relationship_signal" | "run_relationship_intelligence";
export function companyWorkspaceQueryKey(accountId: string, target: CompanyWorkspaceQueryTarget)
export function getCompanyWorkspaceMutationQueryKeys(accountId: string, mutation: CompanyWorkspaceMutation)
export async function invalidateCompanyWorkspaceMutation(queryClient: QueryClient, accountId: string, mutation: CompanyWorkspaceMutation): Promise<void>
```
`invalidateCompanyWorkspaceMutation` does `Promise.all(keys.map(queryKey => queryClient.invalidateQueries({ queryKey, exact: true, refetchType: "active" })))`. Both mutations map to targets `["overview", "intelligence"]`.

**Verdict for the plan:** `operational-invalidation.ts` establishes the *mutation-family → keys* pattern but covers 4 families and is unwired; `company-workspace/invalidation.ts` establishes the *QueryClient-executing* pattern for one workspace. Neither is a general `invalidate.ts`. A new `src/lib/invalidate.ts` would be a consolidation of two existing partial helpers plus 58 ad-hoc call sites — not a greenfield addition. Absorbing rather than duplicating them is the correct framing.

---

## 5. `src/lib/admin/*`

Four files: `types.ts`, `policy.ts`, `errors.ts`, `schemas.ts`. Tests in `src/lib/admin/__tests__/policy.test.ts`.

### `src/lib/admin/types.ts`
```ts
export const USER_ROLES = ["super_admin","admin","manager","sales","client_success","accounting","read_only"] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const PROFILE_STATUSES = ["invited","active","suspended","deactivated"] as const;
export type ProfileStatus = (typeof PROFILE_STATUSES)[number];

export const CAPABILITIES = [...] as const;   // 52 entries, listed below
export type Capability = (typeof CAPABILITIES)[number];

export type AdminNavigationItem = { key: "overview"|"people"|"teams"|"access"|"audit"; label: string; capability: Capability; href: string };
export type ActorAccessContext = { profileId: string; role: UserRole; status: ProfileStatus; departmentId?: string|null; managedDepartmentIds: readonly string[]; managedTeamIds: readonly string[]; directReportIds: readonly string[] };
export type AuthorizationTarget = { profileId?: string; role?: UserRole; departmentId?: string; teamId?: string; ownerProfileId?: string; resourceType?: string; resourceId?: string };
export type PermissionOverride = { profileId: string; capability: Capability; effect: "allow"|"deny"; departmentId?: string|null; teamId?: string|null; resourceType?: string|null; resourceId?: string|null; expiresAt?: string|null; revokedAt?: string|null };
export type AuthorizationReason = "inactive_actor"|"protected_role"|"invalid_target"|"explicit_deny"|"explicit_allow"|"role_grant"|"outside_scope"|"role_denied"|"unknown_capability";
export type AuthorizationDecision =
  | { allowed: true; reason: "explicit_allow"|"role_grant" }
  | { allowed: false; reason: Exclude<AuthorizationReason,"explicit_allow"|"role_grant"> };
export type AuthorizationInput = { actor: ActorAccessContext; capability: Capability; target: AuthorizationTarget; overrides?: readonly PermissionOverride[]; now?: Date };
```

### `src/lib/admin/errors.ts`
```ts
export type AdminErrorCode = "UNAUTHENTICATED" | "FORBIDDEN" | "OUTSIDE_SCOPE" | "CONFLICT"
  | "VALIDATION_FAILED" | "LAST_SUPER_ADMIN" | "OPEN_WORK_REMAINS" | "STALE_ADMIN_STATE";
export class AdminError extends Error {
  constructor(public readonly code: AdminErrorCode, message: string)  // this.name = "AdminError"
}
```

### `src/lib/admin/schemas.ts` (zod; exports)
`userRoleSchema`, `profileStatusSchema`, `capabilitySchema`, `nonEmptyReasonSchema` (`z.string().trim().min(8)`), `adminPeopleSearchSchema` + `AdminPeopleSearch`, `ADMIN_USER_DETAIL_TABS`, `adminUserDetailSearchSchema`, `invitationInputSchema`, `roleChangeSchema`, `lifecycleActionSchema`, `teamMembershipSchema`, `permissionOverrideSchema`, `NON_REQUESTABLE_CAPABILITIES: readonly Capability[] = ["permissions.override"]`, `accessRequestSchema`, `delegationSchema`, `ADMIN_ORGANIZATION_TABS`, `adminOrganizationSearchSchema` + `AdminOrganizationSearch`, `adminAccessSearchSchema` + `AdminAccessSearch`, `adminAuditSearchSchema` + `AdminAuditSearch`.

### `src/lib/admin/policy.ts` — see §6.

---

## 6. Authorization / capability policy modules

Three modules, cleanly split client-shareable ↔ server-only:

- **`src/lib/admin/policy.ts`** — pure decision function, **isomorphic** (no DB, no server imports). One production client importer: `src/components/admin/user-role-dialog.tsx` imports `ROLE_GRANTS` to diff capabilities between two roles.
- **`src/server/auth/authorization.server.ts`** — loads actor context + overrides from Neon, calls the pure policy, throws `AdminError`.
- **`src/server/auth/resource-ownership.ts`** — owner lookup across Neon **and** quarantined Supabase.

### Capability naming
`"<domain>.<action>"`, snake_case domains, dot separator. All 52, verbatim in declaration order:

`users.view`, `users.invite`, `users.manage`, `users.suspend`, `users.deactivate`, `teams.view`, `teams.manage`, `departments.manage`, `permissions.view`, `permissions.override`, `access_requests.decide`, `sessions.revoke`, `audit.view`, `audit.export`, `accounts.view`, `accounts.create`, `accounts.update`, `leads.view`, `leads.create`, `leads.update`, `leads.convert`, `contacts.view`, `contacts.create`, `contacts.update`, `contacts.delete`, `campaigns.view`, `campaigns.manage`, `campaigns.import`, `tasks.view`, `tasks.create`, `tasks.update`, `quotes.view`, `quotes.create`, `quotes.update`, `quotes.request_approval`, `quotes.approve`, `quotes.issue`, `approvals.view`, `approvals.decide`, `engagements.view`, `engagements.create`, `engagements.update`, `job_sheets.view`, `job_sheets.accept`, `job_sheets.update_billing`, `reports.view`, `agents.view`, `agents.run`, `products.view`, `products.manage`, `api_keys.manage`, `automation.manage`.

### Server-side checking — `src/server/auth/authorization.server.ts`
```ts
export type CapabilityCheck = { capability: Capability; target?: AuthorizationTarget };

export async function requireCapabilityChecks(checks: readonly CapabilityCheck[]): Promise<AppSession>
export async function requireCapability(capability: Capability, target: AuthorizationTarget = {}): Promise<AppSession>
export async function requireCapabilitySet(
  required: readonly Capability[],
  options: { optional?: readonly Capability[]; target?: AuthorizationTarget } = {},
): Promise<Partial<Record<Capability, boolean>>>
export async function requireAnyCapability(capabilities: readonly Capability[], target: AuthorizationTarget = {}): Promise<AppSession>
```
- `loadAuthorizationContext()` (private) calls `requireNeonAuthSession()` then four parallel Neon queries: managed departments (`head_profile_id`/`deputy_profile_id`), managed teams (`lead_profile_id`/`deputy_profile_id`), direct reports (`profiles.manager_profile_id`), and live `permission_overrides` (`revoked_at is null and (expires_at is null or expires_at > now())`).
- `resolveAuthorizationTarget()` (private) widens the target with `ownerProfileId` via `resolveOwnerProfileId(resourceType, resourceId)` only when both `resourceType` and `resourceId` are present.
- `decisionError()` maps `reason === "outside_scope"` → `AdminError("OUTSIDE_SCOPE", "Target is outside your management scope")`; everything else → `AdminError("FORBIDDEN", "You do not have this capability")`.
- `requireCapabilitySet` throws on the first denied *required* capability and returns a `{ [capability]: boolean }` map where `optional` entries carry the actual allowed/denied result — **this is the mechanism by which per-capability UI affordances are meant to reach the client.** Production consumers: `src/server-functions/client-workspace.ts` (2 call sites) and `src/server-functions/operations.ts`.

### Client-side checking — **there is no client capability primitive.**
- No `useCan`, no `hasCapability`, no capability context/provider anywhere in `src/components`, `src/hooks`, `src/routes`.
- The **only** capability signal that reaches the browser is `AdminNavigationItem[]`, computed server-side by `getAdminNavigationFn` in `src/server-functions/admin-users.ts` (lines ~110–137): it iterates a hard-coded `adminNavigationItems` list and `requireCapability(item.capability)` per item, swallowing `FORBIDDEN`/`OUTSIDE_SCOPE` into `null` and filtering. The five items are `overview→users.view /admin`, `people→users.view /admin/people`, `teams→teams.view /admin/teams`, `access→permissions.view /admin/access`, `audit→audit.view /admin/audit`. Gate for the whole function: `requireAnyCapability(["users.view","teams.view","permissions.view","audit.view"])`.
- It flows through `src/server/app-shell/loaders.ts` → `AppShellRead.adminNavigation` → `src/router.tsx` → `src/components/app-sidebar.tsx`, which renders one "Admin workspace" entry pointed at `adminNavigation[0].href` ("so the entry never lands on a page their capabilities exclude"). Note `loadAuthenticatedShell` catches admin-navigation failures and returns `[]` — a Neon outage silently hides admin nav rather than erroring.
- Everything else is gated by the route loader throwing `AdminError` and the route's `errorComponent`/catch handling `["FORBIDDEN","OUTSIDE_SCOPE"]` (pattern repeated in `admin.access.tsx`, `admin.audit.tsx`, `admin.people.tsx`, `admin.people.$id.tsx`, `admin.teams.tsx`, `admin.teams.$id.tsx`).

### `evaluateAuthorization(input: AuthorizationInput): AuthorizationDecision` — evaluation order
1. `actor.status !== "active"` → `{allowed:false, reason:"inactive_actor"}`
2. `!CAPABILITIES.includes(capability)` → `"unknown_capability"`
3. **Protected-role rules (manager only):**
   - actor is `manager` AND capability is `users.manage` AND `target.profileId` set AND `target.role` **not** set → `"invalid_target"` (a manager must name the role they are acting on).
   - actor is `manager` AND `target.role` is `"admin"` or `"super_admin"` → `"protected_role"`. Managers can never touch admins or super admins.
4. Filter overrides to matching capability + `overrideIsActive(...)`. `overrideIsActive` requires `override.profileId === actor.profileId`, no `revokedAt`, non-expired vs `input.now ?? new Date()`, and every set scope field (`departmentId`, `teamId`, `resourceType`, `resourceId`) equal to the target's.
5. Any active `deny` → `"explicit_deny"` (deny beats allow).
6. Any active `allow` → `{allowed:true, reason:"explicit_allow"}`.
7. `!ROLE_GRANTS[actor.role].has(capability)` → `"role_denied"`.
8. actor is `manager` and `!managerCanTarget(actor, target)` → `"outside_scope"`.
9. Otherwise `{allowed:true, reason:"role_grant"}`.

`managerCanTarget` builds a `checks: boolean[]` from whichever target dimensions are present (`profileId` ∈ directReports; `departmentId` === own or ∈ managedDepartmentIds; `teamId` ∈ managedTeamIds; `ownerProfileId` === self or ∈ directReports), then: **`if (target.resourceId && !target.ownerProfileId) return false;`** — a named resource with an unresolved owner is out of scope, not in it (the docblock records the prior bug where an unassigned lead was editable by every manager). Finally `checks.length === 0 || checks.every(Boolean)` — the empty case deliberately passes so target-less list/dashboard reads work for managers.

### `ROLE_GRANTS: Record<UserRole, ReadonlySet<Capability>>`
- `super_admin`: `new Set(CAPABILITIES)` — all 52.
- `admin`: all **except** `permissions.override` (schemas.ts records this is deliberate; `NON_REQUESTABLE_CAPABILITIES` blocks requesting it too).
- `manager`: `users.view/invite/manage`, `teams.view/manage`, `access_requests.decide`, `permissions.view`, `accounts.view/create/update`, `leads.view/create/update/convert`, `contacts.view/create/update`, `campaigns.view/manage`, `tasks.view/create/update`, `quotes.view/create/update/request_approval/approve`, `approvals.view/decide`, `engagements.view/create/update`, `job_sheets.view`, `reports.view`, `agents.view/run`, `products.view`.
- `sales`: `accounts.view/create/update`, `leads.view/create/update/convert`, `contacts.view/create/update`, `campaigns.view`, `tasks.view/create/update`, `quotes.view/create/update/request_approval`, `approvals.view`, `engagements.view`, `job_sheets.view`, `reports.view`, `agents.view/run`, `products.view`. (No `quotes.approve`.)
- `client_success`: `accounts.view/update`, `leads.view`, `contacts.view/create/update`, `campaigns.view/manage/import`, `tasks.view/create/update`, `quotes.view`, `approvals.view`, `engagements.view/create/update`, `job_sheets.view`, `reports.view`, `agents.view/run`, `products.view`.
- `accounting`: `accounts.view`, `contacts.view`, `tasks.view/update`, `quotes.view`, `approvals.view`, `engagements.view`, `job_sheets.view/accept/update_billing`, `reports.view`, `products.view`.
- `read_only`: `users.view`, `teams.view`, plus `CRM_VIEW_CAPABILITIES` = `accounts.view, leads.view, contacts.view, campaigns.view, tasks.view, quotes.view, approvals.view, engagements.view, job_sheets.view, reports.view, agents.view, products.view`.

**Second protected-role layer, server-only,** in `src/server-functions/admin-users.ts`: `assertCanAssignRole(actorRole, role)` — only a `super_admin` may assign `super_admin`; a `manager` may assign only `operationalRoles = {sales, client_success, accounting, read_only}`.

### `src/server/auth/resource-ownership.ts`
```ts
export type NeonOwnedResourceType = keyof typeof NEON_OWNERSHIP_QUERIES;
export const NEON_OWNED_RESOURCE_TYPES: NeonOwnedResourceType[];
export function neonOwnershipQuery(resourceType: NeonOwnedResourceType): string;
export async function resolveOwnerProfileId(resourceType: string, resourceId: string): Promise<string | null>;
```
14 Neon-owned types: `account, client, lead, campaign, task, engagement, human_approval, quote, job_sheet, job_sheet_portion, account_contact, client_contact, touchpoint, relationship_signal`. 9 Supabase-owned types: `supabase_account, automation_playbook, automation_run, customer_success_profile, engagement_event, contact, channel_identity, deal, project`. Unknown type → `null`. Note `account` (Neon) and `supabase_account` (Supabase) are separate types with different id spaces, by design. Because this sits on the authorization path, `SUPABASE_URL`/`SUPABASE_ANON_KEY` are required at runtime or every guarded deal/project/contact/CS/automation route 500s from inside the capability check.

---

## 7. Status labels

**`src/lib/status-labels.ts` — ABSENT. No central status-label mapping exists anywhere.**

What exists instead, in four disconnected places:

1. **`src/components/status-badge.tsx`** — a central **style** map, not a label map:
   ```tsx
   const STATUS_STYLES: Record<string, string>  // module-private, NOT exported
   export function StatusBadge({ value, className, label }: { value: string|null|undefined; className?: string; label?: string })
   ```
   - `normalizedValue = value?.trim() || "Unknown"`; unknown keys fall back to `"bg-muted text-muted-foreground border-border"` — **no console warning, silent fallback**.
   - Label is derived inline: `{label ?? normalizedValue.replace(/_/g, " ")}` plus a `capitalize` Tailwind class. That regex-plus-capitalize *is* the de-facto label system.
   - 34 style keys spanning five unrelated domains in one flat namespace (leads / quotes / tasks / approvals / agent runs / priority): `new, qualified, replied, quoted, approved, won, lost, draft, pending_approval, sent, viewed, accepted, rejected, open, in_progress, done, pending, escalated, running, ready_for_review, completed, failed, waiting_approval, idle, high, medium, low, active, paused`. Collisions are structural — `approved` is shared by leads and quotes; `open` is both a task status and a deal status.
   - 80 `<StatusBadge>` call sites across `src/`.

2. **`src/lib/pipeline.ts:259`** — the only *library* label function:
   ```ts
   export function approvalStatusLabel(status: ApprovalStatus): string   // "escalated" -> "changes requested", else status.replace(/_/g," ")
   ```
   **It has zero call sites.** Dead export.

3. **`src/routes/approvals.tsx:63`** — a route-local duplicate of the above, and the one actually used:
   ```ts
   const approvalDecisionLabel = (status: ApprovalStatus) => status === "escalated" ? "changes requested" : status;
   ```
   used at `approvals.tsx:508` and `:669` via `<StatusBadge label={...}>`. Note this file also re-declares `type ApprovalStatus = "pending"|"approved"|"rejected"|"escalated"` locally rather than importing it.

4. **Ad-hoc `.replace(/_/g, " ")` at 29 further call sites**, including on the *server*: `src/server/repositories/approvals.ts:85`, `src/server/repositories/leads.ts:280`, `src/server/workflows/writebacks.ts:33`. Client ones: `pipeline-toolbar.tsx`, `stage-move-dialog.tsx`, `account-timeline.tsx`, `event-attendee-table.tsx`, `lib/relationship/timeline.ts` (×3), `lib/sales-workspace.ts`, `accounts.$id.tsx`, `ai-review.tsx` (×2), `approvals.tsx` (×5 more), `campaigns.$id.tsx`, `campaigns.tsx`, `clients.$id.tsx`, `index.tsx` (×2), `leads.$id.tsx`, `quotes.$id.tsx`.

The only other `_LABELS`-style map in the codebase is `VERSION_REASON_LABELS` in `src/routes/quotes.$id.tsx:98`, route-local.

---

## 8. Errors

**`src/lib/errors.ts` — ABSENT. No sanitizer exists.**

How errors reach the UI today:

1. **`src/lib/admin/errors.ts`** — the only typed error class (`AdminError` + 8 `AdminErrorCode`s, §5). It carries a human-written `message`; it is *not* a sanitizer and does not wrap driver errors.
2. **Raw `error.message` straight to `toast.error`** — the dominant pattern, **24 call sites** of the exact shape `toast.error(error instanceof Error ? error.message : "<fallback>")` across `account.tsx`, `accounts.$id.tsx`, `admin.audit.tsx`, `ai-review.tsx`, `approvals.tsx`, `campaigns.$id.tsx` (×3), `clients.import.tsx` (×2), `index.tsx` (×3), `job-sheets.$id.tsx` (×2), and more. Whatever a server function throws — including Postgres driver text — is rendered verbatim.
3. **`src/routes/__root.tsx:53` `ErrorComponent({ error, reset })`** — the global route error boundary. Does `console.error(error)` then renders `{error.message}` verbatim in a `<p>`, with "Try again" (`router.invalidate(); reset()`) and "Go home". Registered as `errorComponent` on the root route (line 113).
4. **`src/routes/leads.$id.tsx:74`** — route-local `errorComponent: ({ error }) => <div …>{error.message}</div>`, again verbatim.
5. **`src/lib/error-page.ts`** — `export function renderErrorPage(): string`. Returns a self-contained inline-CSS HTML document ("This page didn't load" / "Something went wrong on our end") with Try again + Go home. Generic by construction, leaks nothing. Used for the pre-React server failure path.
6. **`src/lib/error-capture.ts`** — `export function consumeLastCapturedError(): unknown`. Registers `error` / `unhandledrejection` listeners on `globalThis`, stores the last error with a `TTL_MS = 5_000`, and hands it once to `server.ts` so the real stack survives h3 swallowing the throw into a generic 500. Diagnostics only, not user-facing.

**The one place that resembles sanitization is deliberately scoped and lives elsewhere:** `ownershipLookupFailed(resourceType, cause)` in `src/server/auth/resource-ownership.ts` throws `Error("Could not resolve the owner of this ${resourceType}")` with the driver message pushed onto `cause` — explicitly because the driver message names tables and columns and this runs on the authorization path. That is the pattern a future `src/lib/errors.ts` would generalize; today it is a one-off, and nothing else does it.

Unrelated to UI errors: `redactAuditValue` in `src/server/repositories/admin-access.ts:128` redacts audit-log snapshots (used by `reassignment.server.ts`, `repositories/account.ts`). Not an error sanitizer.

---

## 9. `src/lib/mock-data.ts` — integrity finding

**What it is:** 1634 lines (CLAUDE.md says 1689 — stale by 55 lines). Header: `// Mock data for ClientOps frontend prototype.` / `// Shapes mirror the spec §6 schema so swapping to a real API is trivial.` A Lovable-era prototype fixture file. `.lovable/plan.md` confirms provenance: *"Frontend-only. Mock data stays in `src/lib/mock-data.ts`."*

**Contents:** ~20 duplicate interface/type declarations that shadow the real ones in `src/lib/types.ts` (`LeadStatus`, `LeadSource`, `QuoteStatus`, `TaskStatus`, `ApprovalStatus`, `AgentRunStatus`, `User`, `Lead`, `QuoteLineItem`, `Quote`, `Client`, `Task`, `Approval`, `ToolCall`, `AgentRun`, `ActivityLog`, `AgentConfig`, `Notification`, `PricingRule`, `Contact`, `FileAsset`, `Comment`, `QuoteVersion`, `Note`, `LeadFile`, `LeadComment`, `QuoteFile`), plus hard-coded arrays (`users`, `leads`, `quotes`, `clients`, `tasks`, `approvals`, `agentRuns`, `activityLogs`, `agents`, `serviceTemplates`, `pipelineFunnel`, `conversionTrend`, `agentActivity`, `quotePerformance`, `revenueTrend`, `taskThroughput`, `notifications`, `pricingRules`, `contacts`, `clientFiles`, `quoteComments`, `quoteVersions`, `leadNotes`, `leadFiles`, `leadComments`, `quoteFiles`) and lookup helpers (`userById`, `leadById`, `quoteById`, `clientById`, `agentByName`).

**Who imports it: NOBODY. Zero `import` statements anywhere in the repository.** Complete list of every reference, verified by grep across the whole repo:

| Reference | Kind |
|---|---|
| `src/lib/__tests__/clientops-relationship-schema.test.ts:177` | **Not an import** — `readFileSync(new URL("../mock-data.ts", import.meta.url), "utf8")`, reads the file as *text* to assert the stale `role: "cs"` value never reappears |
| `src/lib/__tests__/agents-catalogue.test.ts:96` | **Not an import** — an explicit skip: `if (path.endsWith("src/lib/mock-data.ts")) continue;`, with comment "mock-data.ts is fixture text for stories and is not a dispatch path" |
| `src/lib/__tests__/agents-catalogue.test.ts:19` | comment only |
| `src/lib/types.ts:3` | comment only: `// mock-data.ts types are kept for backward compat during migration but will be removed.` |
| `CLAUDE.md:110`, `.lovable/plan.md:3,7`, `docs/frontend-revision/baseline/test.log` | documentation / log text |

**Is any of it reaching production UI? No.** No module imports it, so no bundler entry point pulls it in; it is dead weight in the source tree only. The `types.ts:3` comment asserting the types are "kept for backward compat" is stale — nothing consumes them.

**The deletion trap (verbatim from CLAUDE.md:110–113):** the file "has zero importers, but it is not free-standing" — deleting it requires dropping the `readFileSync` assertion in `clientops-relationship-schema.test.ts` in the same change, or that test throws. The `agents-catalogue.test.ts` skip at line 96 must also be removed or it becomes a dead branch. Both are text-level couplings invisible to TypeScript, a bundler, or any dead-code analyzer.

---

## 10. CSV import / export

### `src/lib/csv-import.ts` — full API (client-import path)
```ts
export type ImportRow = Record<string, string>;
export function parseClientImportCsv(raw: string): ImportRow[];
export type ImportRowError = { row: ImportRow; reason: string };
export function validateImportRows(
  rows: ImportRow[],
  context: { knownOwners: Set<string>; knownProducts: Set<string> },
): { valid: ImportRow[]; errors: ImportRowError[] };
export function buildClientDedupeKey(companyName: string): string;                                    // trim().toLowerCase()
export function buildContactDedupeKey(clientDedupeKey: string, email: string): string;                // `${key}:${email.trim().toLowerCase()}`
export function buildEngagementDedupeKey(clientDedupeKey: string, productName: string, startDate: string): string; // `${key}:${product.trim().toLowerCase()}:${startDate.trim()}`
```
- `parseClientImportCsv`: splits on `/\r?\n/`, drops blank lines, returns `[]` when ≤1 line. Private `splitLine` is a proper RFC-ish parser — handles quoted fields and doubled `""` escapes. Row 0 is headers (trimmed); each value trimmed; missing trailing values become `""`.
- `validateImportRows` rejection reasons, first-match-wins per row: `"Missing company name"` (blank `company_name`); `` `Unresolvable owner email: ${row.owner_email}` `` (`owner_email` set but not in `knownOwners`); `` `Unknown product: ${row.product_name}` `` (`product_name` set but not in `knownProducts`).
- **Importers:** `src/routes/clients.import.tsx:17` (`parseClientImportCsv`, `ImportRow`, `ImportRowError` — parses in the browser); `src/server-functions/client-import.ts:5` (`validateImportRows`, `ImportRow`); `src/server/repositories/client-import.ts:6-7` (`ImportRow`, `buildClientDedupeKey`); test `src/lib/__tests__/csv-import.test.ts`. Entry point: `src/routes/clients.tsx:141` links to `/clients/import`.

### Second, independent CSV parser: `src/lib/relationship/event-import.ts` (campaign-attendee path)
```ts
export type EventImportRow = { company_name; contact_name; email; phone; attendee_status: string; interests: string[]; notes: string };
export type EventImportError = { index: number; reason: string };
export type EventImportValidationInput = { rows; accounts: Array<{id;name;domain?}>; accountContacts?: Array<{id;account_id;name;email?}> };
export type ContactMatchResult = { kind:"matched"; contactId: string; matchedBy: "email"|"name" } | { kind:"new" };
export type EventImportValidRow = Omit<EventImportRow,"attendee_status"> & { attendee_status: AttendeeStatus; account_match; contact_match };
export type EventImportValidationResult = { valid: EventImportValidRow[]; errors: EventImportError[] };
export function parseEventAttendeeCsv(csv: string): EventImportRow[];
export function resolveMatchedAccountIds(...);
export function validateEventImportRows(...);
```
Its private `parseCsvLine` is a **weaker** parser than csv-import's — it strips `"` characters and toggles a `quoted` flag but has no `""` escape handling. Used by `src/routes/campaigns.$id.tsx:13,114`.

### CSV export helper — **ABSENT.**
No export/serialization helper exists. Verified: no `text/csv` MIME construction, no `Blob`-to-CSV, no `toCsv`/`stringifyCsv`/`serializeCsv` anywhere in `src/`.

What the UI currently shows instead:
- `src/routes/reports.tsx:127-128` — an **"Export CSV" button that is a lie**: `onClick={() => toast.success("CSV export queued")}`. Nothing is queued, generated, or downloaded.
- `src/routes/leads.tsx:235-237` — an **"Import CSV" button that is a lie**: `onClick={() => toast.message("CSV import is mocked in this prototype.")}`. (Note it also uses a `Download` icon for an import action.)
- `src/routes/admin.audit.tsx:86-89` — the only real client-side file download in the app, and it is **JSON not CSV**: `new Blob([JSON.stringify(result.items, null, 2)], …)` + `URL.createObjectURL`.

Both fake buttons are integrity findings on the same order as `mock-data.ts`: prototype affordances that reached the shipped UI and present themselves to users as working features.