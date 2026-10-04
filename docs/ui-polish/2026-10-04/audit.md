# ClientOps UI/UX audit — 2026-10-04

Phase 1 of the UI/UX polish pass. Read-only: no file under `src/` was changed to produce this
document.

## Scope, sources and method

| Item | Value |
|---|---|
| Source audited | `origin/main` `bc130de` (1,219 commits), branch `feat/ui-ux-polish-2026-10` |
| Live UI reviewed | UAT `https://clientops-uat-20260930.vercel.app`, `/api/build` = `3d851c2` |
| UAT vs source | UAT is 61 commits behind `bc130de`. The UI differences are confined to `/agents`, `/agents/$name`, `/ai-review`, `/settings` and `touchpoint-logger.tsx`. Every other route on UAT renders the same UI as the audited source. Findings on those four surfaces were re-checked against source. |
| Production | `/api/build` = `bed941b`. Only `/login` and `/login/forgot-password` were opened, anonymously, GET only. |
| Roles | super_admin, admin, manager, sales, client_success, accounting, read_only — each role's own storage-state session; no passwords typed. |
| Write safety | Every browser context aborted all non-GET requests (`route.abort`) and logged them. Zero writes were attempted by any captured page. |
| Widths | 375 / 768 / 1280 / 1440. Full matrix: every role × 35 routes at 1280; super_admin × 35 routes at 375/768/1440; sales, accounting and read_only × 13 journey routes at 375/768. Dark theme spot checks at 1280. |
| Screenshots | `docs/ui-polish/2026-10-04/before/<role>-<route>-<width>.png` (375 also has `-full.png`). Kept out of Git via `.git/info/exclude` until the owner approves publishing them — the repository is public. |

Environment observations, not product findings:

- Running four browser sessions in parallel against UAT produced HTTP 500 on routes that render
  fine one at a time (UAT recovered immediately when load stopped). All captures in this audit
  were redone sequentially; every 500 screenshot was discarded.
- `bunx vite build` on Windows rewrites `src/routeTree.gen.ts` (918 changed lines, 452 beyond
  whitespace). It was restored with `git checkout` after each build and never committed.

## Baseline gates (this checkout, before any change)

| Gate | Result |
|---|---|
| `bun run lint` | PASS — 0 errors, 1 existing warning (`src/components/sales/data-table-shell.tsx:82`, react-refresh) |
| `bunx tsc --noEmit` | PASS (exit 0) |
| `bunx vite build` | PASS. Chunks over 500 kB: `index` 648.77 kB (208.39 kB gzip), `login-auth-form` 614.53 kB (174.57 kB gzip). `vendor-charts` 317.6 kB (80.66 kB gzip) is lazy (Reports, dashboard insights). |
| `bun run test` | Not run in Phase 1 (read-only audit). Environment-gated: no isolated `DATABASE_TEST_URL` is configured on this machine. |

## Findings

Severity: **P0** broken, blocked or an accessibility blocker · **P1** serious friction, trust or
WCAG AA failure on a primary journey · **P2** inconsistency or moderate friction · **P3**
nice-to-have. Effort: S (≤ half a day), M (1–2 days), L (more). "FE" = fixable without any
server, authorization, data or release-gate change.

| ID | Sev | Role(s) | Route | Evidence | User impact | Proposed fix | Effort | FE |
|---|---|---|---|---|---|---|---|---|
| UX-01 | P0 | super_admin, admin, manager | `/admin/people` → Invite users | `src/server-functions/admin-invitations.ts:88-95,132` returns `{ invitation, inviteUrl, delivery }` per invitee; `src/components/admin/invite-users-dialog.tsx:114-116` keeps only `describeDelivery(...)`, whose text (`src/lib/invitation-delivery.ts:57`) says "Share the invite link another way." No link or copy control is ever rendered. `resendUserInvitation` / `revokeUserInvitation` have zero UI callers. README.md:11 promises "a copyable activation link". | `N8N_USER_INVITATION_WEBHOOK_URL` is deliberately unset, so every invitation is created but never emailed — and the admin is told to share a link they cannot see. Invitation-only onboarding dead-ends. | After a batch, list each invitee with its activation link, a Copy button (with copied confirmation) and expiry; offer Revoke via the existing `revokeUserInvitation`. A list of older pending invitations needs a new read → server proposal SP-1. | S | Yes (list: SP-1) |
| UX-02 | P0 | all (dark theme; default follows OS) | every list with a warning-tone status | Computed contrast `warning-foreground` on `warning/15` over dark card = **1.33:1** (`src/styles.css:120`, `src/lib/status-labels.ts:89`). Screenshots `before/dark-manager-approvals-1280.png`, `before/dark-sales-tasks-1280.png`. | "Waiting approval", "Pending approval", "In progress", "Quoted", "Medium" and amber helper text are effectively invisible for anyone whose OS is in dark mode (`src/routes/__root.tsx:133` follows `prefers-color-scheme`). | Introduce tone "on-tint" text tokens per theme (light and dark) and point `STATUS_TONE_CLASS` at them. Token-only change in `src/styles.css` + `status-labels.ts`. | S | Yes |
| UX-03 | P1 | accounting, manager, others per capability | sidebar → `/leads`, `/campaigns`, `/ai-review`, `/agents`, `/settings`, `/quotes/new`, `/leads/import`; manager → one campaign | Sidebar items are static (`src/components/app-sidebar.tsx:43-76`); a denied loader falls to the root error boundary. `before/accounting-leads-1280.png`: whole app replaced by "Something went wrong / You do not have this capability", sidebar gone, "Try again" cannot succeed. HTTP 403 recorded for 8 accounting routes. | Users follow their own navigation into a full-screen error with internal vocabulary and lose the app shell. | (a) Hide nav items the session's capability list cannot view (presentational; server stays authoritative). (b) Router `defaultErrorComponent` that renders the existing `PermissionDeniedState` inside the shell for FORBIDDEN, with "Request access" linking to `/account`. | M | Yes |
| UX-04 | P1 | all | all lists and detail headers | Light theme computed contrast for 12px badge text: info **4.16:1**, success **3.84:1**, destructive **3.77:1** (need 4.5). `STATUS_TONE_CLASS`, `src/lib/status-labels.ts:85-90`. | Every status pill except neutral/warning fails WCAG 1.4.3 AA. | Same token work as UX-02: darker on-tint text per tone, verified ≥ 4.5:1 in both themes. | S | Yes |
| UX-05 | P1 | all | 18 tables via `DataTableShell` / `ResponsiveRecordList`; access requests | `src/components/sales/data-table-shell.tsx:276,296,329` name controls "Select row ${key}", "Show details for ${key}", "Actions for row ${key}"; all 18 callers pass `row.id` (UUID). `src/components/admin/access-request-queue.tsx:208` renders a visible button "Reject {request.id}", also `:224,227,242,256,260`. Observation: `before/_observations-all.jsonl` small-target samples "Select row aa29825d-3134-4b7e-…". | A screen-reader user hears a UUID for every row control; sighted admins see a UUID in a decision button. WCAG 2.4.6 / 4.1.2. | Add a `rowLabel(row)` prop (company, quote number, person) used for every per-row accessible name; drop ids from visible labels. | S | Yes |
| UX-06 | P1 | all | Leads, lead detail, Renewals, Accounting Today, Admin audit, Access requests, sidebar footer | Lead UUID under every company (`before/super_admin-leads-1280.png`) and in the lead header (`src/routes/leads.$id.tsx:249`); renewal owners "demo-cs-user" (`before/client_success-renewals-1280.png`); raw "accounting_review" (`before/accounting-home-1280.png`); audit Actor/Target ids (`src/components/admin/admin-audit-table.tsx:83-84,94`); requester id (`access-request-queue.tsx:164`); role enum "super_admin" in the sidebar footer; 12 remaining `replace(/_/g, " ")` label fallbacks. | People read identifiers instead of names; the audit log and access queue cannot be understood without a database lookup. | Display-name helper fed by data already on the page (owner names, `getStatusLabel`, `getUserRoleLabel`); hide ids behind "Copy ID". Names for audit actors/requesters need either client resolution through the existing admin directory read or SP-2. | M | Mostly (SP-2) |
| UX-07 | P1 | read_only, accounting, client_success | `/leads/$id` | `src/routes/leads.$id.tsx` has no capability reads at all: status `Select` (`:456`), "New quote" (`:273`), "Qualify this lead" and "Draft a quote with the agent" are offered to every role. `before/read_only-leads-id-1280.png`. Same class: invite role list offers Admin/Super Admin to everyone (`invite-users-dialog.tsx:192-205`) although the server refuses them (`admin-invitations.ts:47-54`). | Users fill in or click controls that can only fail; trust in every other button drops. | Gate with the shell's capability list (advisory, as `/admin/people` already does via `adminControlAccess`); render status read-only when not allowed; filter invitable roles by actor role. | S | Yes |
| UX-08 | P1 | all | every client-side navigation | `scratchpad navtiming` (manager, UAT): click → new page 3,616 ms (Quotes), 3,518 (Renewals), 3,073 (Active Clients), 2,808 (Leads), 2,422 (Tasks), 2,228 (Approvals), 2,054 (Accounts). URL changes in ~50 ms while the old page stays visible; no busy or progress signal detected. Only `approvals.tsx:155` and `tasks.tsx:127` define `pendingComponent`; no `defaultPendingComponent`. | For 2–3.6 s after every navigation the app looks like it ignored the click; users click again. | Thin global progress bar driven by router pending state (delayed ~150 ms, CSS only, reduced-motion safe) plus a `defaultPendingComponent` that reuses `LoadingSkeleton`. | M | Yes |
| UX-09 | P1 | all | `/`, `/leads`, `/tasks`, 21 `MetricStrip` surfaces | Revenue Desk: Overdue "0 follow-ups past due on this board" above a queue listing items "Overdue since 25 Sept 2026"; Hot leads 0 because it counts the 40 loaded of 5,270 (`before/super_admin-home-1280.png`). Leads: "Qualified 50 ready to convert, on this page". Tasks: "Open 53 in loaded pages" vs 581 in the header. Stat cards push the table to ~480 px; ~5 lead rows above the fold at 1280×800; Tasks board starts ~690 px. At 375 the whole first screen is stacked stat cards with **zero records visible** on Leads (`before/sales-leads-375.png`), Tasks (`before/read_only-tasks-375.png`) and Job Sheets (`before/accounting-job-sheets-375.png`, where one strip mixes "every page" and "on this page of 50"). | KPIs contradict the content beneath them and consume the first screen of every page — all of it on a phone. | Replace page-scoped stat cards with one compact, honest summary line (whole-dataset counts where the read already returns them; otherwise drop the number). Keep cards only where the read model supplies whole-dataset figures (Renewals, Approvals). | M | Yes |
| UX-10 | P1 | sales, client_success, manager | `/leads/$id` | Notes section says "Lead notes are not stored yet, so there is nowhere to write one." (`leads.$id.tsx:330`). No create-task entry point on the lead; `NewTaskDialog` (`src/routes/tasks.tsx:906-1002`) has no lead/client field although `TaskCreateSchema` accepts `lead_id`, `client_id`, `account_id` (`src/lib/operations/input-schemas.ts:28-31`). | The "follow-up" step of lead → quote has no home on the lead; follow-ups become unlinked tasks. | "Add follow-up task" on the lead (prefilled `lead_id`, owner, due date) and the same affordance on client/account; drop the apology copy. | S | Yes |
| UX-11 | P1 | manager, admin, super_admin | `/approvals` (1280) | `before/dark-manager-approvals-1280.png`: the detail panel overlaps the table (Raised header cut to "Raise"), the Request column wraps to 6 lines, "SLA breached" wraps inside its badge. | The Approval Desk — a manager's main queue — is hard to scan at the most common laptop width. | When a record is open below 1440 px, collapse the table to the identity + status columns or present the panel as a sheet; `whitespace-nowrap` on badges. | M | Yes |
| UX-12 | P1 | admin, super_admin | `/admin/audit`, other `/admin/*` | App sidebar + "Control plane" sub-nav leave ~800 px; audit document 1,452 px wide at 1280 (`before/_observations-all.jsonl`, `before/admin-admin-audit-1280.png`). Filters ask for "Actor profile id" and "Target id"; actions shown as raw keys `profile.deactivated_with_reassignment`. | Audit history is clipped and unreadable for the people who must review it. | Admin sub-nav as tabs under the header below 1440; humanised action labels; person pickers instead of id fields; sticky identity column when scrolling is unavoidable. | M | Mostly (SP-2 for names) |
| UX-13 | P1 | all (mobile, tablet) | `/quotes/$id` at 375 and 768 | `before/super_admin-quotes-id-375-full.png`: line-item table keeps only "Service"; quantity, unit, total and the total row are hidden by column priority. `before/sales-quotes-id-768.png`: the table is clipped inside its panel — "Unit" reads "U", "HKD 100…" and "Total" are cut off. | On a phone a quote's money is invisible except the header total; on a tablet it is cut off. | Card layout for line items below `md` (service, qty × unit, total), totals row always visible. | S | Yes |
| UX-14 | P1 | accounting | `/job-sheets/$id` (1280) | `before/accounting-job-sheets-id-1280.png`: amounts wrap "HKD / 66.84"; headers wrap to 3 lines; "No invoice reference" wraps 3 lines. | Finance users cannot scan amounts in their primary workspace. | `whitespace-nowrap` + tabular figures on money cells; shorter headers; let the handoff panel stack below `xl`. | S | Yes |
| UX-15 | P1 | accounting | `/` (Today) | `before/accounting-home-1280.png`: rows show only sheet number + raw status "accounting_review"; sidebar marks "Revenue Desk" active on a page titled "Today"; header chrome differs from every other page. | Accounting's landing page gives no basis for triage (client, amount, invoice date). | Reuse `ResponsiveRecordList` with client, accepted total, target invoice date and `StatusBadge`; sidebar label follows the page. Data already on the Job Sheets list read. | M | Yes |
| UX-40 | P1 | all keyboard and screen-reader users | every client-side navigation; `/approvals` | Keyboard run: after Enter on a sidebar link focus stays on the link — no focus move to the page heading or `main`, no route announcement. Approvals: 131 Tab stops from load to the first decision button (51 row checkboxes first); Leads: 28 stops to the first row. | A keyboard-only manager pays 100+ key presses per decision; screen-reader users are not told the page changed. WCAG 2.4.3 / 4.1.3. | On route change move focus to the page `h1` (programmatically focusable) and announce the title in a polite live region; make the table a single tab stop (roving focus) or give the record panel a landmark and a "Go to decision" skip link. | M | Yes |
| UX-16 | P2 | all | forms (New task, access decisions, invite, quote) | `useForm` / `zodResolver` have **0** uses; `aria-invalid` 3 uses across ~118 controls; "Title required" is a toast (`tasks.tsx:924-926`); "Decision reason is required" appears before typing (`access-request-queue.tsx:98`) and the 8-character minimum (`:107`) is never stated. | Errors are not attached to fields; screen readers are not told which field failed. WCAG 3.3.1 / 3.3.2. | One small `Field` wrapper (label, hint, error, `aria-describedby`, `aria-invalid`) used by these forms; validate on submit/blur, never before input. | M | Yes |
| UX-17 | P2 | all | `/leads`, `/clients`, `/campaigns` vs `/accounts`, `/quotes`, `/tasks` | Leads/Clients/Campaigns search "this page" only (`leads.tsx:330`, `clients.tsx:374`, `campaigns.tsx:337`); Accounts/Quotes search everything with a 250 ms debounce; Tasks pushes every keystroke to the URL (`tasks.tsx:543`). Placeholders truncate at 1280. | The same search box means three different things; a record on page 2 "does not exist". | Short-term: label consistently and stop page-only search pretending to be global; route-wide server search for leads/clients needs a read change → SP-3. | S | Yes (SP-3) |
| UX-18 | P2 | all | copy across the app | "needs an assignable-owner list from the server, which does not exist yet" (`src/components/pipeline/pipeline-toolbar.tsx:51`); "Both hand the lead to an n8n workflow"; "the policy engine consults before the role baseline" (`access-request-queue.tsx:218`); visible label "Assign reviewer (inline) search" (`approvals.tsx:794`); "Control plane"; "Updated 0s from now" on 13 pages (`src/lib/format.ts:126` returns "from now" when the difference is 0); "Neon Auth sign-out failed" (`authenticated-app-shell.tsx:42`). | Internal vocabulary and apologies for missing features crowd the working surface. | Copy pass with a short vocabulary; "just now" under 10 s; separate a combobox's id key from its visible label. | S | Yes |
| UX-19 | P2 | sales, manager | `/quotes/$id` | "Out of date · Updated 4d ago" on an unchanged quote: `quotes.$id.tsx:671` passes `quote.updated_at` (record edit time) to `StaleDataIndicator`, documented as the time the data was fetched (`src/components/sales/states.tsx:493-497`). All 16 other call sites pass `dataUpdatedAt`. | An amber "Out of date" warning on almost every quote. | Pass `detailQuery.dataUpdatedAt`; show record edit time as plain metadata. | S | Yes |
| UX-20 | P2 | sales, manager, accounting | `/quotes/$id` | Lifecycle panel lists five solid-grey disabled buttons each with "You do not have permission…" / "Available while… It is accepted now." (`before/sales-quotes-id-1280.png`, `before/super_admin-quotes-id-375-full.png`); status badge first appears ~1,600 px down at 375; "Approved by: Not approved yet" beside an accepted quote. | The state of the quote and the one next step are buried under unavailable actions. | Lead with status + the single available next action; unavailable steps collapse into a "Why can't I…" disclosure; status badge in the header. | M | Yes |
| UX-21 | P2 | all | all text inputs, sidebar | Computed non-text contrast: input border vs card **1.31:1** (light), **1.56:1** (dark); active sidebar item vs rail **1.13:1** (`src/styles.css:83-84,91-95`). | Input boundaries and the current page in the navigation are hard to see. WCAG 1.4.11. | Token change: stronger `--input`, active rail state with weight + accent bar. | S | Yes |
| UX-22 | P2 | all | every `Button` | `src/components/ui/button-variants.ts:7` uses `focus-visible:ring-1` (1 px) and no pressed state; `--accent` is a saturated blue (`styles.css:73`) so ghost/outline hover flashes blue. | Weak keyboard focus signal; loud hover in a tool used all day. | `src/components/ui/` may not be hand-edited. Options: (a) re-sync primitives with `bunx shadcn@latest add` (newer versions ship a 3 px ring and `aria-invalid` styles but would undo the repo's fast-refresh split of `button-variants.ts`), or (b) token/CSS-only: calmer `--accent`, focus emphasis via `--ring`. Needs owner decision D-3. | S | Yes |
| UX-23 | P2 | all | `/notifications`, `/admin/people` | Console: "Minified React error #418" (hydration mismatch) on both pages (`before/_observations-all.jsonl`). | Server HTML is discarded and re-rendered on the client; possible flicker and wasted SSR. | Find the server/client-divergent render (likely a time or locale value) and route it through `useClientNow` / `src/lib/format.ts`. | S | Yes |
| UX-24 | P2 | sales, client_success, admin | `/leads/import`, `/clients/import`, campaign attendee import | File inputs have no accessible name (`before/_observations-all.jsonl` "unlabeled" on all three). | Screen-reader users cannot tell what the file control is for. WCAG 4.1.2. | Visible label + `aria-describedby` for format help. | S | Yes |
| UX-25 | P2 | all | Traditional Chinese company/contact names | `--font-sans` is "Plus Jakarta Sans", `ui-sans-serif`, `system-ui` (`src/styles.css:13`); `<html lang="en">` (`__root.tsx:130`); no Traditional Chinese face; single-line `truncate` on queue titles, cards and selects. See §CJK below. | Han characters fall back to whatever the OS picks for `lang=en` (often Simplified-Chinese glyph forms) and long CJK names lose their distinguishing end. | Add `"PingFang HK", "Noto Sans HK", "Microsoft JhengHei"` to the stack; two-line clamp with `title`/tooltip for names; `text-wrap: pretty` on headings. | S | Yes |
| UX-26 | P2 | all | public and authenticated pages | No `Content-Security-Policy`, `X-Frame-Options`/`frame-ancestors`, `X-Content-Type-Options` or `Referrer-Policy` on UAT or production `/login/sign-in` (only HSTS). `vercel.json` sets only `buildCommand`. | The app can be framed (clickjacking on Approve/Issue); MIME sniffing allowed. | Deployment config, not frontend → proposal SP-4. | S | No |
| UX-27 | P2 | all | admin dialogs | `invite-users-dialog.tsx`, `access-request-queue.tsx`, `admin.audit.tsx` filters hand-roll native `select`, `textarea`, `input[type=datetime-local]`, checkbox and button styles; raw palette colours in `notification-bell.tsx` (8) and `user-role-dialog.tsx` (6) bypass theme tokens. | Admin surfaces look and behave differently from the rest of the app; raw colours do not follow dark mode. | Use the existing `ui/` primitives and tokens. | M | Yes |
| UX-28 | P2 | all | 375 / 768 | Approvals at 375 is 11,056 px tall (50 pending cards + 50 history rows in one scroll) — `before/super_admin-approvals-375-full.png`. Further narrow-width findings in §Responsive. | Long single scrolls on phones; history buries the queue. | Collapse history behind a tab/disclosure on narrow screens. | S | Yes |
| UX-39 | P2 | all | every page | Plus Jakarta Sans is self-hosted and registered but **never applied**: on UAT every element computes to `ui-sans-serif, system-ui, sans-serif`, the four `@font-face` entries report `unloaded`, and `--font-sans` at runtime holds Tailwind's default stack — the Neon Auth UI bundle imported in `src/styles.css:4` defines it, while the app's `@theme inline` value (`styles.css:13`) is inlined into utilities rather than emitted. | The app renders in each OS's system font (Segoe UI on Windows, SF on macOS) instead of its intended face; the self-hosting work ships bytes nobody downloads. | Define `--font-sans` (with the CJK fallbacks from UX-25) in an unlayered `:root` rule after the Neon Auth import, or set `body` to the literal stack. Visible app-wide change → owner decision D-6. | S | Yes |
| UX-36 | P2 | all | every page at 768 | The full 256 px sidebar stays open at 768 (`before/sales-quotes-id-768.png`), leaving ~512 px for content; seven list pages then scroll sideways (Accounts 792 px, Clients 867, Renewals 802, Campaigns 894, AI Ops 781, Settings 775, Admin Teams 858 — `before/_observations-widths.jsonl`). | Tablet layouts inherit the narrowest content column of any width. | Collapse the sidebar to its icon rail between `md` and `lg` (the `ui/sidebar` already supports `collapsible="icon"`). | S | Yes |
| UX-37 | P2 | manager, accounting, sales | Approvals reviewer, Job Sheet accounting owner, Tasks owner filter, Invite manager | `ProfileSearchCombobox` (`src/components/people/profile-search-combobox.tsx:94-150`) renders the selection as a "Selected: …" line above an empty "… search" input; on Approvals it sits under an "Unassigned" chip ("Unassigned" / "Selected: UAT manager", `before/manager-approvals-1280.png`); job sheet "Selected: UAT accounting" above "Accounting owner search" (`before/accounting-job-sheets-id-1280.png`). | People pickers contradict the assignment they sit under and do not look like the field they are. | Show the chosen person inside the control (combobox pattern) with a clear button; one label per field. | M | Yes |
| UX-38 | P2 | all | `/accounts/$id`, `/clients/$id` | `before/super_admin-accounts-id-1280.png`: each field in "Relationship snapshot" and "Ownership" is its own bordered rounded box inside a bordered panel; four empty-value conventions on one screen — "Unassigned" (also for Industry), "Not set", "—", "Assigned (name unavailable)"; boilerplate "Next action" with 0 open signals. | Box-in-box clutter and inconsistent emptiness make the 360 view slower to read. | Definition-list rows separated by spacing; one empty convention ("Not set"; people: "Unassigned"); next-action text only when there is an action. | S | Yes |
| UX-29 | P3 | all | stat cards, headers | 4 tall cards per page with decorative icon chips; 27 uppercase-tracked eyebrows that repeat the sidebar group; "Leads" `h2` + subtitle repeating "Lead Inbox". | Generic, roomy dashboard look; nothing reads as ClientOps. | Part of UX-09 and the direction's density decisions. | S | Yes |
| UX-30 | P3 | all | badges | `BADGE_BASE` keeps `capitalize` (`src/components/status-badge.tsx:24-25`) so "Waiting approval" renders "Waiting Approval"; job sheets use a separate solid badge; Renewals uses a solid amber "At risk". | Three badge styles and Title Case vs sentence case. | Drop `capitalize`, one badge component. | S | Yes |
| UX-31 | P3 | all | `/quotes/new`, `/quotes/$id`, other children | Child routes inherit list search params: `/quotes/new?page=1&limit=50&status=all&q=`, `/quotes/<id>?page=1&limit=50…`. | Noisy, misleading URLs when copied. | Strip parent-only params on child navigation. | S | Yes |
| UX-32 | P3 | — | code | Dead code: 24 unused shadcn primitives (accordion … toggle-group) and the deps only they use (`embla-carousel-react`, `input-otp`, `react-resizable-panels`, `cmdk`, `react-day-picker`, `vaul`, `react-hook-form`, `@hookform/resolvers`); unused `page-header.tsx`, `account-summary-card.tsx`, `renewal-card.tsx`, `use-route-polling-refresh.ts`, `error-page.ts`, `error-capture.ts`; `CommandHeader`, `ContextPanel` exports. | Maintenance noise; wrong signals for the next contributor. | Remove in a separate cleanup PR (dependency removal needs owner sign-off). | S | Yes |
| UX-33 | P3 | — | code | Ad-hoc query-key suffixes (`approvals.tsx:413,433,482`, `ai-review.tsx:71`, `profile-search-combobox.tsx:46,54`); literal `staleTime: 30_000` beside `CRM_STALE_TIME_MS`; `key={index}` in the editable quote sections list (`quote-document-editor.tsx:104`); ESLint has no `jsx-a11y` and `no-unused-vars` is off. | Small consistency/correctness risks. | Add factory entries; use the constant; stable keys; consider `jsx-a11y` (new dev dependency → owner decision). | S | Yes |
| UX-34 | P3 | anonymous | `/login` | "Sign In" (Title Case) / "login to your account" / "Login" button; `m@example.com` placeholder (template default); generic sparkles mark. | Unpolished first impression. | Consistent "Sign in" verb; neutral placeholder. Neon Auth UI copy may need its localisation props. | S | Yes |
| UX-35 | P3 | all | `/renewals` and others | "5036" without separator beside "5,041"; filter label text crowding its chevron; tiny 10–11 px text in 9 places (`app-sidebar.tsx:135,185`, `lead-card.tsx:81,94`, …). | Small polish. | `formatCount` everywhere; 12 px floor. | S | Yes |

## Keyboard-only journeys

Real Chromium on UAT, keyboard only, each role's own session, all non-GET requests aborted (zero
attempted). Focus visibility measured from the focused element's computed outline/box-shadow.

| Journey | Result |
|---|---|
| Any page: first Tab | PASS — "Skip to main content" is the first stop and moves focus to `main`. Its indicator is a 1 px outline. |
| Sales: sidebar → Leads → first lead → New quote | Reachable, every stop visibly focused. **After Enter on a sidebar link, focus stays on the link**: no focus move or announcement for the new page (UX-40). First lead row needs 28 Tab presses. |
| Manager: Approvals → decision | **131 Tab presses** from page load to the first decision button ("Request changes"), passing 51 row checkboxes named "Select row <uuid>" (UX-40, UX-05). |
| Admin: Invite users (invalid email) → Escape | PASS — initial focus in "Email addresses", 7 stops to "Send invitations", client-side `role="alert"` "Enter at least one valid email address.", Escape returns focus to "Invite users". No request sent. |
| Sales: New task with empty title | Toast "Title required" only; no field marked `aria-invalid`; focus stays on "Create" (UX-16). |
| Sales: Quotes row menu | PASS — Enter opens the Radix menu with the first item focused (background highlight), arrows move, Escape returns focus to "Actions for row <uuid>" (name: UX-05). |

Not covered here: a human screen-reader pass (NVDA/VoiceOver) and 200 % zoom of the logged-in
shell — still the open gate recorded in `release-checklist.md`.

## CJK long-content stress test

Method: on rendered UAT pages, record-name text in the local DOM only was replaced with
`香港拯救貓狗協會有限公司`, a mixed string `Fimmick 香港拯救貓狗協會有限公司 Hong Kong Society for
Rescue of Cats and Dogs Limited`, a full-width-parenthesis string and the contact
`陳大文 Chan Tai Man`, then measured and screenshotted (`before/cjk-*.png`).

- Tables (Leads, Quotes, Accounts, Clients at 1280 and 375): PASS — names wrap inside the
  identity column, no ellipsis, no overflow. Long names grow rows to ~95 px and a line can start
  with a full-width "（" (`before/cjk-sales-leads-1280.png`).
- Detail heading (Account at 375): wraps to four lines without overflow
  (`before/cjk-super_admin-account_detail-375.png`); `text-wrap: balance` would even the lines.
- Single-line `truncate` placements (Revenue Desk queue titles, Renewals rows) hide the
  distinguishing end of a name; with CJK the visible part is often only the shared
  "香港…有限公司" prefix (UX-25).
- Glyphs: every CJK node computes to `ui-sans-serif, system-ui, sans-serif` with
  `<html lang="en">`, so the OS chooses the Han font (UX-25, UX-39).
- Limitation, stated honestly: on Approvals, Tasks and the Revenue Desk the record names are not
  links, so the generic fallback replaced stat-card labels and a badge instead. The horizontal
  overflow it produced there (626 px / 551 px at 375) comes from those unrealistic placements and
  is **not** counted as a finding.

## Responsive (375 / 768)

From the sequential capture (`before/_observations-widths.jsonl`, `before/_observations-journey.jsonl`):

- 375: no route scrolls sideways except Audit (581 px). The first screen of Leads, Tasks and Job
  Sheets is entirely stat cards (UX-09). Quote line items lose every money column (UX-13).
  Approvals is 11,056 px long (UX-28).
- 768: seven list pages scroll sideways — Accounts 792 px, Clients 867, Renewals 802,
  Campaigns 894, AI Ops 781, Settings 775, Admin Teams 858 — while the full sidebar stays open
  (UX-36). Quote line items are clipped (UX-13). Audit 1,335 px.
- 1280 / 1440: Audit overflows (1,452 px) (UX-12); everything else fits. Hydration error #418 on
  Notifications and Admin People at every width (UX-23).
- Accounting is refused (HTTP 403) on `/leads` at every width, as designed — but via the root
  error page (UX-03).

## Verified vs. claimed

| Claim | Where | Repo reality |
|---|---|---|
| "Forms / validation: react-hook-form + zod 4" | `CLAUDE.md` stack table | `useForm` and `zodResolver` have 0 uses in `src/`. Zod validates on the server (`parseOperationInput`); forms are hand-rolled `useState`. `react-hook-form` and `@hookform/resolvers` are unused dependencies; `ui/form.tsx` has no importers. |
| "without `N8N_USER_INVITATION_WEBHOOK_URL`, the Admin invitation flow returns a copyable activation link" | `README.md:11` | The server returns the link; the UI never shows it (UX-01). |
| "`src/lib/mock-data.ts` (1689 lines)" | `CLAUDE.md` | 1,634 lines. The test dependency described there is accurate. |
| "Registered SQL migrations (001–022)" / "Migrations 001–022 are registered" | `CLAUDE.md:63`, `README.md:39` | `neon/migrations/` holds 001–026 (023–026 from the AI remediation). |
| `status-labels.ts` is the single status mapping; the `replace(/_/g," ")` fallback duplicated ~29× | `docs/frontend-revision/PROGRESS.md` PC-10 | 12 fallbacks remain in UI code (e.g. `clients.$id.tsx:265,382`, `leads.$id.tsx:238`, `pipeline-toolbar.tsx:126,142`); accounting's Today page renders raw enum values. |
| "Light-mode navigation rail indistinguishable from the app background" owned by B1 + token change | `PROGRESS.md` (B1 done) | `--sidebar` 0.98 vs `--background` 0.985 lightness; the active item vs rail is 1.13:1. |
| "Raw `error.message` reaching users at 22 sites" fixed via `toSafeErrorMessage` | `PROGRESS.md` B5 | Verified except one: `authenticated-app-shell.tsx:42` toasts `error.message` on sign-out failure. |
| "Query keys always via `crmQueryKeys`" | `CLAUDE.md` | True — every key is rooted in `crmQueryKeys`; four call sites append ad-hoc suffixes (UX-33). |
| "route loaders use `routeQueryOptions`" | `CLAUDE.md` | Mostly true (52 uses); several `useQuery` calls inline options with literal `staleTime` equal to the default. |
| Accounting's denied AI Ops / AI Review now return 403, not 500 | `status.md` 2026-10-03 | Verified on UAT (403) — but the denial renders as the generic root error page (UX-03). |
| "The existing font is now self-hosted from integrity-verified Fontsource 5.3.0 WOFF2 assets" | `status.md` (2026-09-30 R06) | Self-hosted and registered, but never rendered: all faces stay `unloaded` and every element uses the system stack (UX-39). |
| Shared CSS reduces animation for `prefers-reduced-motion` | `better-ui-review.md` | Verified (`src/styles.css:170-179`). |
| Recharts are `aria-hidden` with a figcaption and table alternative | `report-charts.tsx` comment | Verified (`report-charts.tsx:32-58`, `reports.tsx:415`). |

## Server-side proposals referenced above

- **SP-1** Pending-invitation read (`listUserInvitations` scoped by `users.invite`) so admins can see, copy, resend or revoke outstanding invitations.
- **SP-2** Include display names (actor, requester, target person) in the audit and access-request read models.
- **SP-3** Server-side search for the leads and clients lists (same contract as accounts/quotes).
- **SP-4** Security headers in `vercel.json`: `Content-Security-Policy` (starting with `frame-ancestors 'none'`), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`.

## Skills used for this audit

| Phase | Skill | How it was applied |
|---|---|---|
| 1a | `ecc:react-review` | Checklist applied inline. The skill delegates to a `react-reviewer` subagent; earlier sessions recorded "User prohibits subagents", so no agent was spawned. |
| 1a | `ecc:code-review` | Local mode found no diff; its checklist was applied to the current source. |
| 1a | `ecc:react-performance` | Bundle, waterfall, re-render and list-size checks. |
| 1b | `ecc:security-review` | Client-side items only. |
| 1c | `ecc:click-path-audit` | Inline (no parallel agents); the app has no shared store, so the "store map" is the invalidation layer. |
| 1d | `ecc:browser-qa`, `design:design-critique` | Playwright with each role's storage state, write-blocked. axe-core is **not installed** (adding it needs approval), so accessibility automation was replaced by scripted checks (contrast from tokens, accessible names, target sizes). |
| 1e | `design:accessibility-review`, `ecc:frontend-a11y` | Applied to WCAG 2.2 AA (the skill text cites 2.1; 2.5.8, 2.4.11 and 3.3.7/3.3.8 were added). No human screen-reader pass was possible here. |
| 1f | `ecc:design-system`, `design:ux-copy` | Token inventory and copy sweep. |
| 1g | `taste-skill:redesign-existing-projects` | **Not installed under that name.** `taste-skill:redesign-skill` was used instead; its marketing-page advice was ignored as instructed. |
