# Application Shell — Fimmick ClientOps

All paths absolute under `C:/Users/laich/Documents/FIMMICK ClientOps/ui-delight-maker/`.

---

## Root shell — `src/routes/__root.tsx`

Created with `createRootRouteWithContext<RouterContext>()`. Route options present: `beforeLoad`, `head`, `shellComponent: RootShell`, `component: RootComponent`, `notFoundComponent: NotFoundComponent`, `errorComponent: ErrorComponent`.

**`beforeLoad`** — the sole auth gate (see Auth gating):
```tsx
beforeLoad: async ({ context, location }) => {
  if (isPublicAuthPath(location.pathname)) return {};
  return context.queryClient.ensureQueryData(
    routeQueryOptions({
      queryKey: crmQueryKeys.shell(),
      queryFn: () => getAppShellRead(),
    }),
  );
},
```
Its return value is spread into route context, so `Route.useRouteContext()` yields `{ queryClient, user, profile, favorites, adminNavigation }` (`RouterContext` in `src/router.tsx`).

**`head`** — meta: `charSet utf-8`; `viewport width=device-width, initial-scale=1`; `title: "Fimmick ClientOps"`; `description: "Lead follow-up client operations workspace"`. links: preconnect `fonts.googleapis.com`, preconnect `fonts.gstatic.com` (crossOrigin anonymous), Google Fonts stylesheet **Plus Jakarta Sans** (`ital,wght@0,400;0,500;0,600;0,700;0,800;1,400&display=swap`), and `appCss` from `../styles.css?url`.

**`RootShell`** (document shell): `<html lang="en" suppressHydrationWarning>`; in `<head>` an inline anti-FOUC script reading `localStorage.getItem('theme')` falling back to `prefers-color-scheme: dark`, adding `.dark` to `documentElement`; then `<HeadContent />`. `<body>` contains a "Skip to main content" `sr-only focus:not-sr-only` anchor to `#main-content`, `{children}`, `<Scripts />`.

**`RootComponent`** composition:
- If `isPublicAuthPath(pathname)` → renders only `<QueryClientProvider client={queryClient}><Outlet /></QueryClientProvider>` (no sidebar/header).
- Otherwise: `QueryClientProvider` → `SidebarProvider` → `div.flex.min-h-screen.w-full.bg-background` → `<AppSidebar profile favorites adminNavigation onSignOut />` + a flex column containing the `<header>` and `<main id="main-content" className="flex-1"><Outlet /></main>`; `<Toaster richColors position="top-right" />` (sonner) sits inside `SidebarProvider`, after the layout div.
- `SidebarProvider` is used with **no** `defaultOpen` prop, so the persisted `sidebar_state` cookie is written but never read back on SSR.

**Error boundaries:** only the root-level `errorComponent` (logs `console.error(error)`, shows "Something went wrong" + `error.message`, "Try again" button calling `router.invalidate()` + `reset()`, and an `<a href="/">Go home</a>`) and `notFoundComponent` (404 page with `<Link to="/">Go to pipeline</Link>`). No React `ErrorBoundary` component and no per-route error boundaries in the shell.

**Note:** `redirect` is imported from `@tanstack/react-router` at line 10 of `__root.tsx` but is **not used anywhere in the file** — dead import.

**Query client config** — `src/lib/performance/query-policy.ts` (constructed in `src/router.tsx` via `createAppQueryClient()`):
- `CRM_STALE_TIME_MS = 30_000`, `CRM_GC_TIME_MS = 300_000`
- `defaultOptions.queries = { staleTime: 30_000, gcTime: 300_000, refetchOnWindowFocus: true, retry: shouldRetryRead }`
- `shouldRetryRead`: at most 1 retry (`failureCount >= 1` → false); retries `TypeError`, `status >= 500`, or `code` in `ECONNRESET | ETIMEDOUT | ECONNREFUSED | EAI_AGAIN`.
- Router (`src/router.tsx`): `createRouter({ routeTree, context: { queryClient }, scrollRestoration: true, defaultPreload: "intent", defaultPreloadStaleTime: CRM_STALE_TIME_MS })`.
- `src/lib/route-query.ts` `routeQueryOptions()` wraps `queryOptions` defaulting `staleTime` to `CRM_STALE_TIME_MS`.
- `crmQueryKeys.shell()` = `["shell"]` (`src/lib/query-keys.ts:38`).

---

## Auth gating

**There is no authenticated layout route.** No pathless layout files exist (`ls src/routes | grep "^_"` returns only `__root.tsx` / `__tests__`). Only two `beforeLoad` guards exist in the whole route tree: `src/routes/__root.tsx:84` and `src/routes/admin.tsx:7`.

Gating mechanism:
1. `__root.tsx` `beforeLoad` short-circuits for public paths via `isPublicAuthPath` (`src/lib/auth/auth-routes.ts`): `AUTH_BASE_PATH = "/login"`; public = `pathname === "/login" || pathname.startsWith("/login/") || pathname.startsWith("/invite/")`. Also exports `getLoginAuthPath` with `DEFAULT_LOGIN_AUTH_PATH = "sign-in"`.
2. For every other path it awaits `getAppShellRead()`, whose loader **throws `redirect({ to: "/login" })`** when there is no session (`src/server/app-shell/loaders.ts`). So authentication is enforced by the shell data load, not by a layout route.
3. `RootComponent` independently re-checks `isPublicAuthPath(pathname)` to decide chrome vs. bare `<Outlet />`.
4. Session validity is decided in `src/lib/auth/neon-auth.server.ts` `getNeonAuthSession()`: returns `null` unless a Neon Auth identity resolves to a profile (`getProfileById(identity.user.id)` ?? `getProfileByEmail(normalizedEmail)`) **and** `profile.status === "active"` **and** `!sessionIsRevoked(identity, profile)`. Returns `{ ...identity, profile }`.
5. Admin sub-tree gate — `src/routes/admin.tsx`:
```tsx
beforeLoad: async () => {
  try { return { navigation: await getAdminNavigationFn() }; }
  catch (error) {
    if (error instanceof AdminError && ["FORBIDDEN","OUTSIDE_SCOPE"].includes(error.code)) throw redirect({ to: "/" });
    throw error;
  }
},
head: () => ({ meta: [{ title: "Admin workspace · Fimmick ClientOps" }, { name: "description", content: "Manage people, teams, access, and administrative audit history." }] }),
component: AdminRoute,
```
`AdminRoute` renders `<AdminShell navigation={navigation}><Outlet /></AdminShell>`.

---

## Sidebar — `src/components/app-sidebar.tsx`

### Navigation data, verbatim

```tsx
const todayItems = [{ title: "Revenue Desk", url: "/", icon: LayoutDashboard }];

const acquireItems = [
  { title: "Leads", url: "/leads", icon: Inbox },
  { title: "AI Review", url: "/ai-review", icon: Sparkles },
];

const convertItems = [
  { title: "Quotes", url: "/quotes", icon: FileText },
  { title: "Job Sheets", url: "/job-sheets", icon: ClipboardList },
  { title: "Approvals", url: "/approvals", icon: ShieldCheck },
  { title: "Campaigns", url: "/campaigns", icon: CalendarDays },
];

const retainItems = [
  { title: "Accounts", url: "/accounts", icon: Building2 },
  { title: "Active Clients", url: "/clients", icon: BadgeCheck },
  { title: "Relationships", url: "/relationships", icon: Network },
  { title: "Renewals", url: "/renewals", icon: RefreshCw },
  { title: "Tasks", url: "/tasks", icon: CheckSquare },
];

const operateItems = [
  { title: "Agents", url: "/agents", icon: Bot },
  { title: "Reports", url: "/reports", icon: BarChart3 },
  { title: "Settings", url: "/settings", icon: Settings },
];

type SidebarItem = {
  title: string;
  url: string;
  icon: LucideIcon;
  activePath?: string | null;
};
```

Render order inside `<SidebarContent>`, verbatim:
```tsx
{renderGroup("Today", todayItems)}
{favorites.length > 0
  ? renderGroup(
      "Favorites",
      favorites.map((favorite) => ({
        title: favorite.label,
        url: favorite.href,
        icon: Star,
      })),
    )
  : null}
{renderGroup("Acquire", acquireItems)}
{renderGroup("Convert", convertItems)}
{renderGroup("Retain", retainItems)}
{renderGroup("Operate", operateItems)}
{adminNavigation.length > 0 ? (
  <>
    {/* A rule rather than a group heading: one entry does not need a section
        label, but admin still needs separating from workflow navigation. */}
    <SidebarSeparator />
    {renderGroup(null, [
      {
        title: "Admin workspace",
        // Point at the first destination this actor is permitted to open so the
        // entry never lands on a page their capabilities exclude.
        url: adminNavigation[0].href,
        icon: UserCog,
        // Keep the entry highlighted across every /admin/* sub-page, which the
        // AdminShell sidebar then navigates.
        activePath: "/admin",
      },
    ])}
  </>
) : null}
```

Props:
```tsx
interface AppSidebarProps {
  profile: Profile | null;
  onSignOut: () => void;
  favorites: Array<Pick<WorkspaceFavorite, "id" | "label" | "href">>;
  adminNavigation?: readonly AdminNavigationItem[];
}
```

`renderGroup(label, items)` builds `SidebarGroup` → optional `SidebarGroupLabel` (skipped when `label === null`) → `SidebarGroupContent` → `SidebarMenu` → per item `SidebarMenuItem` keyed by `item.title` → `SidebarMenuButton asChild isActive={isActive(item)} tooltip={item.title}` wrapping `<Link to={item.url}><item.icon className="h-4 w-4" /><span>{item.title}</span></Link>`.

**Header:** `SidebarHeader` with an 8×8 rounded primary tile containing `<Sparkles className="h-4 w-4" />`, then a column (hidden at `group-data-[collapsible=icon]:hidden`) with `"Fimmick ClientOps"` (text-sm font-semibold) over `"Revenue operations desk"` (text-[11px] muted).

**Favorites logic:** Favorites are **not** stored client-side. They come from the server shell read → `getWorkspacePreferences({ data: { objectType: "account" } })` → `listWorkspaceFavorites(session.profile.id)` in `src/server/repositories/workspace-preferences.ts`:
```sql
select * from workspace_favorites where profile_id = $1 order by created_at desc
```
Type `WorkspaceFavorite` (`src/lib/types.ts:539`): `{ id, profile_id, kind: "view" | "account" | "search", label, href, view_id, account_id, created_at }`. Every favorite renders with the same `Star` icon; the group is hidden entirely when empty. Toggling is `togglePersonalWorkspaceFavorite` (`src/server-functions/workspace-preferences.ts`, delete-if-exists-else-insert keyed on `profile_id + kind + href`). The **only** call site in the app is `src/routes/accounts.tsx:329` (account preview panel), which after toggling invalidates `crmQueryKeys.accounts.list(search)` and `crmQueryKeys.shell()` and calls `router.invalidate({ filter: m => m.routeId === "__root__" || m.routeId === "/accounts" })`. There is no favorite affordance inside the sidebar itself (no remove/reorder).

**Admin entry gating & first-destination resolution:** the entry renders only when `adminNavigation.length > 0`. The list is computed server-side by `getAdminNavigationFn` (`src/server-functions/admin-users.ts:119`): `requireAnyCapability(["users.view","teams.view","permissions.view","audit.view"])`, then per-item `requireCapability(item.capability)`, dropping items whose error is `AdminError` with code `FORBIDDEN` or `OUTSIDE_SCOPE` and rethrowing anything else. Source list (`src/server-functions/admin-users.ts:111`):
```ts
const adminNavigationItems = [
  { key: "overview", label: "Overview", capability: "users.view", href: "/admin" },
  { key: "people", label: "People", capability: "users.view", href: "/admin/people" },
  { key: "teams", label: "Teams", capability: "teams.view", href: "/admin/teams" },
  { key: "access", label: "Access", capability: "permissions.view", href: "/admin/access" },
  { key: "audit", label: "Audit", capability: "audit.view", href: "/admin/audit" },
] as const satisfies readonly AdminNavigationItem[];
```
First-destination = `adminNavigation[0].href` — the first *permitted* item in that fixed order — with `activePath: "/admin"` so the entry stays lit across all `/admin/*`.

**Collapse mechanism:** `<Sidebar collapsible="icon">`. Provider is `src/components/ui/sidebar.tsx`: `SIDEBAR_COOKIE_NAME = "sidebar_state"`, `SIDEBAR_COOKIE_MAX_AGE = 60*60*24*7`, `SIDEBAR_WIDTH = "16rem"`, `SIDEBAR_WIDTH_MOBILE = "18rem"`, `SIDEBAR_WIDTH_ICON = "3rem"`, `SIDEBAR_KEYBOARD_SHORTCUT = "b"` (Cmd/Ctrl+B toggles). `defaultOpen = true`; `setOpen` writes the cookie each change; `state = open ? "expanded" : "collapsed"` drives `data-state`/`data-collapsible` attributes that the `group-data-[collapsible=icon]:hidden` classes key off. Toggled by `SidebarTrigger` (in the header) and by the `SidebarRail` drag handle.

**Mobile drawer:** `useIsMobile()` (`src/hooks/use-mobile.ts`, `MOBILE_BREAKPOINT = 768`, matchMedia `(max-width: 767px)`). When `isMobile`, `Sidebar` renders a shadcn `Sheet` (`open={openMobile} onOpenChange={setOpenMobile}`) with `--sidebar-width: SIDEBAR_WIDTH_MOBILE` and an `sr-only` `SheetHeader`/`SheetTitle "Sidebar"`/`SheetDescription "Displays the mobile sidebar."`. `toggleSidebar()` flips `openMobile` on mobile, `open` on desktop.

**Badges:** **absent** in the sidebar. No `SidebarMenuBadge` usage anywhere in `app-sidebar.tsx` — no counts on Leads/Approvals/Tasks/etc. The primitives `SidebarMenuBadge`, `SidebarMenuAction`, `SidebarGroupAction` exist and are exported from `src/components/ui/sidebar.tsx` (lines 615/584/444) but are unused by the app sidebar. The only badge in the shell is the notification bell's unread count (see Notifications).

**Footer:** `SidebarFooter` → a bordered `bg-sidebar-accent/40` row, `group-data-[collapsible=icon]:hidden`, containing the avatar initials tile, name/role text, and the sign-out icon button (see Identity/sign-out).

---

## Active-state rule — `src/lib/sidebar-active.ts`

Extracted from `AppSidebar` so it is directly testable (the file's doc comment says the previous "coverage" was a test grepping `app-sidebar.tsx` for the literal `const isActive = (item: SidebarItem)`).

```ts
export type SidebarActiveTarget = {
  url: string;
  /** null opts the entry out of highlighting entirely; undefined falls back to `url`. */
  activePath?: string | null;
};

export function isSidebarItemActive(item: SidebarActiveTarget, currentPath: string): boolean {
  if (item.activePath === null) return false;

  const path = (item.activePath ?? item.url).split("?")[0];

  if (path === "/") return currentPath === "/";
  return currentPath === path || currentPath.startsWith(path + "/");
}
```

Consumed in `app-sidebar.tsx` as `const isActive = (item: SidebarItem) => isSidebarItemActive(item, currentPath);` with `currentPath = useRouterState({ select: (s) => s.location.pathname })`. Rules: `activePath === null` → never active; query string stripped; `"/"` matches exactly only; otherwise exact match or prefix-with-slash.

`AdminShell` (`src/components/admin/admin-shell.tsx`) does **not** use this helper — it inlines its own: `item.href === "/admin" ? pathname === "/admin" || pathname === "/admin/" : pathname === item.href || pathname.startsWith(item.href + "/")`.

---

## Header composition

**No separate header component file** — the top header is inline JSX in `RootComponent` (`src/routes/__root.tsx`). `src/components/page-header.tsx` is a *page*-level title block (`title`, `description`, `actions`), not the shell header.

```tsx
<header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-border bg-background/80 px-4 backdrop-blur">
  <SidebarTrigger />
  <div className="hidden max-w-md flex-1 md:block">
    <GlobalSearch />
  </div>
  <div className="ml-auto flex items-center gap-2">
    <div className="md:hidden">
      <GlobalSearch iconOnly />
    </div>
    <ThemeToggle />
    <NotificationBell />
    <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-xs font-medium text-primary">
      {profile?.name?.slice(0, 2).toUpperCase() ?? "??"}
    </div>
  </div>
</header>
```
Left→right: sidebar trigger, desktop search (md+), then right cluster: mobile icon-only search (below md), theme toggle, notification bell, avatar initials div. Height `h-14`, sticky, `z-20`.

---

## Search — `src/components/global-search.tsx`

`GlobalSearch({ iconOnly = false })`. Local state only (no react-query): `q`, `open`, `panelOpen`, `active`, `results: WorkspaceSearchResult[]`, `loading`, `error`, `retryKey`.

- **Trigger:** Cmd/Ctrl+K (`window` keydown) — opens the mobile panel when `iconOnly` and focuses the input. Outside `mousedown` on `wrapRef` closes both `open` and `panelOpen`.
- **Query:** debounced 200 ms; **minimum 3 characters** (`term.length < 3` clears results); calls `searchWorkspace({ data: { query: term, limit: 20 } })` with a `cancelled` guard; `retryKey` re-runs it.
- **Keyboard:** ArrowDown/ArrowUp move `active` (clamped), Enter navigates `results[active]`, Escape closes. `active` resets to 0 on every `q` change.
- **Navigation:** `go(r)` closes, clears `q`, `navigate({ to: r.href as never })`. Results are real `<a href={r.href}>` elements; `onResultClick` bails out on modified clicks / non-left-button / `defaultPrevented`, otherwise `preventDefault()` + `go`.
- **States:** `role="status"` "Searching…"; `role="alert"` with `"Search failed. Check your connection and try again."` + a "Retry search" outline button; empty state `No results for "{q.trim()}"`; each result shows title, subtitle, and an uppercase type chip.
- **Input:** `aria-label="Search workspace"`, `name="global-search"`, `autoComplete="off"`, placeholder `"Search companies, people, leads, quotes, clients, tasks..."`, `h-9 pl-9` with a `Search` icon absolutely positioned left.
- **iconOnly variant:** ghost icon button `aria-label="Search"` toggling `panelOpen`; open panel is `fixed inset-x-0 top-14 z-30` full-width bar.
- **Server:** `src/server-functions/search.ts` — `requireAnyCapability(["accounts.view","contacts.view","leads.view","quotes.view"])` then `searchWorkspace(query.trim(), limit ?? 20)`. Result type (`src/server/repositories/workspace-search.ts`): `{ id, type: "Company"|"Person"|"Lead"|"Quote"|"Client"|"Task", title, subtitle, href, matchedOn }`; repo also enforces the 3-char minimum.

---

## Notifications — `src/components/notification-bell.tsx`

Data via `useNotifications()` (`src/hooks/use-notifications.ts`): `useQuery(routeQueryOptions({ queryKey: crmQueryKeys.notifications.list({}), queryFn: () => getNotifications() }))`, returning `{ notifications, unreadCount, markAsRead, markAllRead, refresh }`. Server `getNotifications` (`src/server-functions/notifications.ts:11`) = `requireNeonAuthSession()` then `listNotifications(profile.id)` + `countUnreadNotifications(profile.id)`.

**Badge count source:** `unreadCount` from that query — rendered as `<span className="absolute right-1 top-1 flex h-4 min-w-4 … bg-destructive …">{unreadCount}</span>` only when `> 0` (raw number, no 9+ cap).

Behaviour: ghost icon button `aria-label="Notifications"` toggles a 320px popover anchored `absolute right-0 top-full z-30`; outside-mousedown closes. Popover header "Notifications" + a "Mark all read" button (`CheckCheck` icon) shown only when `unreadCount > 0`. List shows `notifications.slice(0, 6)`, max-height 80 (`max-h-80 overflow-auto`); empty state `MailOpen` + "No notifications". Each row: type icon tile, title, timestamp, and an unread dot; clicking calls `markAsRead(n.id)`, closes, and `navigate({ to: notificationLink(n) as never })`. Footer `<Link to="/notifications">View all notifications</Link>`.

Type maps (verbatim keys): `typeIcon` / `typeColor` for `approval_pending` (ShieldAlert, `text-amber-500 bg-amber-500/10`), `renewal_window` (CalendarClock, blue), `risk_change` (AlertTriangle, red), `stale_touchpoint` (Clock, slate).

```ts
function notificationLink(n: NotificationRecord): string {
  if (n.object_type === "engagement") return `/renewals`;
  if (n.object_type === "approval") return "/approvals";
  if (n.object_type === "client") return `/clients/${n.object_id}`;
  if (n.object_type === "lead") return `/leads/${n.object_id}`;
  return "/notifications";
}
```

Timestamps use `useClientNow()` (`src/hooks/use-client-now.ts`, returns `null` on server/first render, ticks every 30 s): renders `formatDateTime(n.created_at)` until hydrated, then `relativeTime(n.created_at, clientNow)`.

Read mutations are optimistic with per-notification `Symbol` mutation tokens (`readMutationTokensRef`) so a rollback only reverts rows this mutation touched; `cancelQueries` before, `invalidateQueries({ exact: true })` after.

---

## Theme — `src/components/theme-toggle.tsx`

Entirely DOM/localStorage based; **no theme provider, no context, no React state**:

```tsx
const toggle = () => {
  const next = !document.documentElement.classList.contains("dark");
  document.documentElement.classList.toggle("dark", next);
  try {
    localStorage.setItem("theme", next ? "dark" : "light");
  } catch {
    // localStorage unavailable (private mode); theme still applies for this session
  }
};
```
Renders a ghost icon `Button` `aria-label="Toggle theme"` containing `<Sun className="hidden h-4 w-4 dark:block" />` and `<Moon className="h-4 w-4 dark:hidden" />` — icon swap is pure CSS, so it is hydration-safe. Initial theme is applied by the inline `<script>` in `RootShell` reading `localStorage.theme` with `prefers-color-scheme: dark` fallback. Only two states (light/dark) — no "system" option.

---

## Identity / sign-out

**Header identity:** a non-interactive `<div>` showing `profile?.name?.slice(0, 2).toUpperCase() ?? "??"`. **There is no user/identity dropdown menu** — no avatar menu, no account link in the header.

**Sidebar footer identity card** (`app-sidebar.tsx`, hidden when icon-collapsed): same initials tile, `profile?.name ?? "—"`, and `` `${profile?.role ?? "—"} · Fimmick` ``, plus:
```tsx
<Button variant="ghost" size="icon" onClick={onSignOut}
  className="ml-auto h-7 w-7 text-muted-foreground hover:text-foreground"
  aria-label="Sign out" title="Sign out">
  <LogOut className="h-4 w-4" />
</Button>
```
That is the only sign-out affordance in the shell.

**`onSignOut` handler** (defined in `__root.tsx`):
```tsx
onSignOut={async () => {
  try {
    await signOut();
    queryClient.clear();
    await router.invalidate();
    await router.navigate({ to: "/login" });
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "Neon Auth sign-out failed");
  }
}}
```
`signOut` (`src/server-functions/auth.ts`) is a POST server fn: reads the Neon Auth cookie (`getNeonAuthCookieHeader`), returns `{ ok: true }` early if absent, else `fetch(\`${getNeonAuthUrl()}/sign-out\`, { method: "POST", headers: { Cookie }, redirect: "manual" })`, forwards `set-cookie` headers back via `setResponseHeader("set-cookie", …)`, treats 2xx/3xx as success, otherwise throws with the parsed error message. Same file also exports `getSession` and `signIn` (POST to `/sign-in/email`).

`Profile` shape (`src/lib/types.ts:150`) includes `id, email, name, role: UserRole, status, avatar_url, job_title, phone, locale, timezone, primary_department_id, manager_profile_id, last_active_at, session_invalid_before, suspended_*, deactivated_*, availability_status, leave_starts_at, leave_ends_at, created_at`. Note the shell renders raw `profile.role` (e.g. `client_success`) with no label mapping, and `avatar_url` is **never used** — initials only.

---

## Shell server data

**`src/server-functions/app-shell.ts`** (whole file):
```ts
export const getAppShellRead = createServerFn({ method: "GET" }).handler(() =>
  loadAuthenticatedShell({
    getSession: () => getSession(),
    getPreferences: () => getWorkspacePreferences({ data: { objectType: "account" } }),
    getAdminNavigation: () => getAdminNavigationFn(),
  }),
);
```

**`src/server/app-shell/loaders.ts`** — dependency-injected loader (the only file in `src/server/app-shell/` besides `__tests__`):
```ts
export type AppShellRead = {
  user: { id: string; email?: string | null; name?: string | null };
  profile: Profile | null;
  favorites: WorkspaceFavorite[];
  adminNavigation: AdminNavigationItem[];
};
```
`loadAuthenticatedShell` awaits `getSession()`; if null → `throw redirect({ to: "/login" })`. Then `Promise.all` of `getPreferences()` and `getAdminNavigation()`, each with a `.catch` that logs (`"Workspace preferences unavailable"` / `"Admin navigation unavailable"`) and degrades to `{ favorites: [] }` / `[]` — so the shell renders without favorites or the admin entry rather than failing. Returns `{ user: session.user, profile: (session.profile ?? null) as Profile | null, favorites: preferences.favorites, adminNavigation: [...adminNavigation] }`.

So the shell loads: **session user + profile**, **favorites** (all kinds, from `workspace_favorites` for the profile), and **capability-filtered admin navigation**. It does **not** load the main nav (hard-coded client-side in `app-sidebar.tsx`), **no** capability set for gating non-admin nav items, **no** notification counts (fetched client-side by `useNotifications`), and **no** saved views (`getWorkspacePreferences` also returns `views` for `objectType: "account"`, but `loadAuthenticatedShell` discards it — only `favorites` is read).