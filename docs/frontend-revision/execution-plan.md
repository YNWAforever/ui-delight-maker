# Fimmick ClientOps — Frontend Revision Execution Plan

**For:** Fable (the executing agent)
**Source spec:** `Fimmick_Total_CRM_AI_Ops_Frontend_Revision_Master_Instruction.md` — referred to below as *the Instruction*. References such as §9.5 point to sections of the Instruction; references such as P-2.1 point to sections of this plan.
**Repository:** `YNWAforever/ui-delight-maker`
**Product:** Fimmick ClientOps — Total CRM + AI Operations
**Working branch:** `feat/clientops-frontend-revision`
**Release rule:** Draft PR + Vercel preview only. No merge to `main` and no production promotion until a human explicitly approves.

---

## 0. How to use this plan

### 0.1 Authority order

When sources disagree, resolve in this order:

1. The repository as it exists (code, `CLAUDE.md`, `README.md`) — facts about what is real.
2. The Instruction — what the product must become.
3. This plan — how to get there.

If this plan names a file, component, query key or server function that does not exist in the repository, the plan is wrong, not the repository. Record the correction in `docs/frontend-revision/PROGRESS.md` and continue with the real name.

### 0.2 Cold-start protocol (run at the start of every session)

1. `git status && git branch --show-current` — confirm you are on `feat/clientops-frontend-revision` with a clean tree.
2. Read `docs/frontend-revision/PROGRESS.md` (created in step A0). Find the first unchecked step.
3. Read that step's *Context* and the Instruction sections it cites.
4. Read the repository files listed under *Read* for that step. Never edit from memory of a previous session.
5. Execute *Do*, run *Verify*, confirm *Exit*, commit, tick the checkbox, append a two-line note to `PROGRESS.md` (what changed, what was learned).

### 0.3 Step contract

Every step below has the same shape:

- **Context** — why the step exists and which Instruction sections govern it.
- **Read** — files to inspect before editing.
- **Do** — the work.
- **Verify** — commands and checks.
- **Exit** — conditions that must be true before the step is marked done.
- **Commit** — commit message prefix.

A step is complete only when *Exit* holds and the commit exists. Partial steps stay unchecked.

### 0.4 Non-negotiables (Instruction §4 — re-read before every step)

- Never edit `src/routeTree.gen.ts` by hand. Let the router plugin regenerate it.
- Never add a duplicate plugin to `vite.config.ts`.
- Never hand-edit shadcn primitives in `src/components/ui/` to style one screen. Compose wrappers instead.
- No new Supabase imports. No database access from route components. All data goes through `src/server-functions/`.
- Never weaken a capability check to make a page render. Server-side enforcement stays as is or gets stronger.
- Never expose stack traces, driver messages, credentials or workflow secrets in the UI.
- No new package without a documented need and explicit human approval.
- No new route or navigation item without a working page and a real data source. Projects stays out of navigation.
- No large database migration in this branch.
- No sample data, simulated backend behaviour, or success feedback for local-only state.
- Do not stop after an early phase. All phases complete in this one branch unless a hard blocker is documented.

### 0.5 Blocker protocol

When a step cannot be completed truthfully within scope:

1. Do not simulate, stub or fake the outcome.
2. Add an entry to `docs/frontend-revision/backend-dependencies.md` using template P-11.5.
3. Implement the truthful UI state (READ-ONLY or UNAVAILABLE per P-2.1) with a plain-language explanation.
4. Mark the step `done-with-dependency` in `PROGRESS.md` and move on.

Stop the whole plan and report only for a hard blocker: install failure, missing repository access, a baseline gate failure you did not cause and cannot isolate, or missing credentials for a required deployment.

### 0.6 When to ask a human

Ask before doing any of these; otherwise decide using P-2 and record the decision in `PROGRESS.md`:

- Adding, upgrading or removing a package.
- Any edit to capability, authorization or protected-role modules.
- Any schema change (the answer is always "document it", but confirm if a page cannot be made truthful without one).
- Rebasing or merging other branches into the working branch.
- Marking the PR ready for review, merging, or anything that touches production.
- Choosing between two truthful UI states when the Instruction gives no preference and the choice changes a business workflow (for example, hiding versus disabling a lifecycle action).

Batch questions at the end of a step rather than interrupting mid-step, unless the answer blocks the step.

---

## 1. Scope

### 1.1 In scope

- Every authenticated route in P-3 (31 routes), reviewed, functionally verified and visually aligned.
- The global shell: sidebar information architecture, top header, command-header pattern, global states.
- Shared feature-level components (Instruction §10).
- Product-integrity fixes for all frontend-only cases found in the audit.
- Small server-function or read-model changes that pass the backend-change gate (P-2.8).
- Responsive, accessibility, performance and QA passes.
- Reports: parity map, integrity findings, backend dependencies, before/after summary, changed-file summary, responsive QA, accessibility QA, performance findings, validation report.
- A draft pull request and a Vercel preview deployment.

### 1.2 Out of scope

- Renaming database entities, tables, columns or routes.
- New business features, new routes, Projects navigation.
- Schema migrations (document them instead).
- Marketing pages, public pages and authentication flows beyond what the shell requires.
- Merging or promoting to production.

---

## 2. Decision rules

These rules apply to every step. They are the answer to most judgement calls you will meet.

### 2.1 Control integrity taxonomy

Every interactive element on every route you touch receives exactly one verdict, recorded in `docs/frontend-revision/integrity-findings.md`.

| Verdict | Meaning | Required treatment |
|---|---|---|
| **REAL** | Reaches an authorized server function today | Keep. Guarantee in-progress state, success feedback, failure feedback, correct invalidation, no double submission. |
| **READ-ONLY** | Represents persisted or code-defined state that the UI cannot change today | Render as a non-interactive display (badge, text, disabled field) with a one-line explanation of why it is read-only. |
| **UNAVAILABLE** | The intended action has no server path yet | Disabled control with a reason, or removed if leaving it would mislead. Never a success toast. Log a backend dependency. |
| **REMOVED** | Decorative, with no credible future path | Delete it. Note the removal in integrity findings. |

Decision tree:

1. Does activating it call something in `src/server-functions/`? → **REAL**.
2. Otherwise, does it display real state from the server or the code-defined catalogue? → **READ-ONLY**.
3. Otherwise, is there a documented future server path worth signalling to users? → **UNAVAILABLE**.
4. Otherwise → **REMOVED**.

Verdicts the Instruction already dictates:

- Revenue Desk timeline-summary control → REAL (only if connected to a server-backed result) or UNAVAILABLE. Never presented as completed (§9.1).
- Reports "Export CSV" → REAL client-side export from the loaded, authorized dataset (preferred), or UNAVAILABLE. Never "queued" (§9.23).
- AI Ops pause / replay / threshold / model / auto-approval controls → READ-ONLY or REMOVED unless persisted, authorized, audited and enforced server-side (§9.21).
- Agent Governance settings → READ-ONLY with the "required before editable" explanation (§9.22).
- Agent Memory → READ-ONLY truthful explanation (§9.22).
- Bulk selection in lists → REAL only where a bulk server action exists; otherwise REMOVED (§9.2).
- Any "coming soon" navigation → REMOVED from navigation (§16).

### 2.2 Filters, sorting and search

A filter, sort or search control is REAL when it changes the data the user sees through one of:

- a parameter accepted by the route's server function or `routeQueryOptions`; or
- client-side filtering of a dataset that is fully loaded and authorized for the current actor.

If the list is paginated server-side, client-side filtering would hide matching rows on other pages — that filter must be server-backed or omitted. "Saved views" and "persistent filters" are REAL only where the repository already persists them; otherwise use URL search params (TanStack Router `validateSearch`) so views are at least shareable and reload-safe, and do not call them "saved".

### 2.3 Query and invalidation

- Every query key and invalidation key comes from `crmQueryKeys` in `src/lib/query-keys.ts`. Never build a key inline.
- Route data flows through route loaders and `routeQueryOptions`.
- Server data lives in TanStack Query. Do not copy it into long-lived `useState`.
- After each mutation, invalidate the narrowest set of keys that still covers every workspace that displays the affected data (starting matrix in P-2.9). Never call `router.invalidate()` or a key-less `queryClient.invalidateQueries()` for a small mutation.
- If the repository lacks a single place that encodes cross-workspace invalidation, add one helper (working name `src/lib/invalidate.ts`, one function per mutation family, each returning the `crmQueryKeys` entries to invalidate) and unit-test it.
- Optimistic updates only where rollback and error feedback are implemented and covered by a test.

### 2.4 Truthful state

- Never render sample, placeholder, seeded or interpolated business data.
- When data is missing because of a backend gap (the known example is `quotes.account_id`), show an explicit "Not linked" or "Unavailable" state with a short reason, and log the dependency.
- Raw AI input/output only inside an "Advanced" disclosure; the default view is the structured summary.
- AI-generated content is always marked (agent name, confidence, review state) and never styled like a confirmed human decision.
- Freshness indicators ("Last updated 4 minutes ago") only where the data has a real timestamp; render through `src/lib/format.ts` so SSR and client agree.

### 2.5 Canonical status vocabulary

One label per state (Instruction §7.5). Implement a single mapping from raw status values to label, tone and icon in `src/lib/status-labels.ts` if the repository has no equivalent (confirm in A1; if an equivalent exists, extend it instead). Route files never contain status label strings.

| Raw state family | Label | Tone |
|---|---|---|
| quote draft | Draft | neutral |
| quote pending approval | Pending approval | warning |
| approval / AI review item awaiting decision | Waiting approval | warning |
| quote sent | Sent | info |
| quote viewed | Viewed | info |
| quote accepted | Accepted | success |
| quote or approval rejected | Rejected | destructive |
| AI run or job running | Running | info |
| AI run or job completed | Completed | success |
| AI run or job failed | Failed | destructive |
| AI run stuck past threshold | Stuck | destructive |
| aggregate exception state | Needs attention | warning |
| client / renewal / relationship risk | At risk | warning |
| past due date | Overdue | destructive |

"Tone" maps to an existing semantic token role (success, warning, destructive, info, neutral). Status always renders text, optionally with an icon — never colour alone.

### 2.6 Copy rules (Instruction §21)

Short, operational, evidence-led. Replace exaggerated AI language wherever it appears. Approved phrases:

- "Needs attention", "Waiting approval", "Inspect run", "No work needs attention".
- "Last updated N minutes ago" where freshness matters.
- "Configuration is read-only until runtime policy enforcement is enabled" for governance controls.
- "AI Ops" (never "Agent Monitor") in links.

### 2.7 Responsive rules (Instruction §11)

- Verification widths: 1440, 1024, 768, 375.
- Primary-workflow lists render as a table at `md` and above and as a card list below `md`, through `ResponsiveRecordList`. Horizontal scrolling is acceptable only for finance-heavy detail tables (billing portions, line items) where column relationships matter.
- Secondary columns hide progressively at `md` and `lg` through column priorities in `DataTableShell`.
- Command-header actions wrap below the title on small screens; nothing overflows.
- No global horizontal overflow at 375: `document.documentElement.scrollWidth <= window.innerWidth` on every route.
- Drawers become full-height sheets on mobile with internal scrolling; dialog bodies never exceed the viewport without an internal scroll region.
- Kanban-style boards switch to a stage selector or vertically grouped list below `md`.

### 2.8 Backend-change gate (Instruction §4.4)

A change under `src/server-functions/`, `src/server/read-models/` or `src/server/repositories/` is permitted only when all of the following hold:

1. It serves one of: truthful frontend state, removing an N+1, an aggregate metric, a compact view model, invalidation correctness, or proper enforcement of an existing action.
2. It needs no schema migration and is additive and backward compatible.
3. Capability enforcement is unchanged or stronger.
4. It is covered by a test where the repository already tests that layer.
5. It is listed under "Server" in `changed-files.md`.

Anything else becomes a `backend-dependencies.md` entry, a truthful UI state, and you continue.

### 2.9 Cross-workspace invalidation matrix (starting hypothesis — confirm every key name in A1)

| Mutation family | Must refresh |
|---|---|
| Lead stage move, lead edit, lead assignment | leads list; lead detail; Revenue Desk pipeline and KPIs; Account 360 commercial and activity |
| Task create, complete, reassign | tasks views; Revenue Desk today queue and KPIs; related lead / account / client detail; Account 360 activity |
| Quote save, submit for approval, issue, revise, accept | quotes list; quote detail; approvals queue; Account 360 commercial and activity; Revenue Desk active quote value; job sheets list on acceptance |
| Approval decision on a quote | approvals; quote detail; quotes list; Account 360 commercial and activity; Revenue Desk KPIs |
| AI review decision | ai-review queue and selected item; AI Ops attention queue and recent runs; related record detail; Account 360 activity |
| Relationship signal dismiss or resolve | relationships; Account 360 signals and activity; clients list health where derived |
| Touchpoint logged, renewal plan changed | client detail; clients list; renewals; Account 360 activity |
| Job sheet edit, billing portion change, lock or accept | job sheet detail; job sheets list; Account 360 delivery & finance and activity; quote detail handoff section |
| Campaign member follow-up change | campaign detail; campaigns list outcomes; related lead / account detail; tasks |
| Settings save | the settings query; any workspace that consumes that setting |
| Admin people / team / access change | admin lists and detail; capability and navigation data; audit log |

### 2.10 Visual restraint (Instruction §7.1, §7.4)

- No gradients on data surfaces, no glassmorphism, no decorative illustrations inside workspaces, no oversized marketing typography, no rainbow status colours, no "AI magic" motifs.
- Prefer section dividers, subtle backgrounds and spacing over nested cards; a card inside a card only when the inner element is independently meaningful.
- Reserve the heaviest font weight for priorities and primary values; body and table text stay regular weight.
- Density is calm, not sparse: no large empty regions that lower information efficiency.

---

## 3. Route inventory

All 31 authenticated routes named in the Instruction. Sizes (S/M/L/XL) indicate expected effort and where extra care is warranted; they are not time budgets.

| # | Route | Sidebar group | Phase | Size | Instruction |
|---|---|---|---|---|---|
| 1 | `/` Revenue Desk | Today | C | L | §9.1 |
| 2 | `/leads` | Acquire | C | M | §9.2 |
| 3 | `/leads/$id` | Acquire | C | L | §9.3 |
| 4 | `/campaigns` | Acquire | D | M | §9.10 |
| 5 | `/campaigns/$id` | Acquire | D | M | §9.11 |
| 6 | `/ai-review` | Acquire | E | L | §9.20 |
| 7 | `/quotes` | Convert | C | M | §9.12 |
| 8 | `/quotes/new` | Convert | C | L | §9.13 |
| 9 | `/quotes/$id` | Convert | C | L | §9.14 |
| 10 | `/quotes/$id/pdf` | Convert | C | S | §9.15 |
| 11 | `/approvals` | Convert | C | M | §9.16 |
| 12 | `/job-sheets` | Deliver | C | M | §9.17 |
| 13 | `/job-sheets/$id` | Deliver | C | L | §9.18 |
| 14 | `/accounts` | Retain & Grow | D | M | §9.4 |
| 15 | `/accounts/$id` Account 360 | Retain & Grow | D | XL | §9.5 |
| 16 | `/clients` | Retain & Grow | D | M | §9.6 |
| 17 | `/clients/$id` | Retain & Grow | D | L | §9.7 |
| 18 | `/relationships` | Retain & Grow | D | M | §9.8 |
| 19 | `/renewals` | Retain & Grow | D | M | §9.9 |
| 20 | `/tasks` | Retain & Grow | D | M | §9.19 |
| 21 | `/agents` AI Ops | Operate | E | L | §9.21 |
| 22 | `/agents/$name` | Operate | E | M | §9.22 |
| 23 | `/reports` | Operate | E | M | §9.23 |
| 24 | `/settings` | Operate | E | M | §9.24 |
| 25 | `/admin` | Administration | E | S | §9.25 |
| 26 | `/admin/people` | Administration | E | S | §9.25 |
| 27 | `/admin/people/$id` | Administration | E | S | §9.25 |
| 28 | `/admin/teams` | Administration | E | S | §9.25 |
| 29 | `/admin/teams/$id` | Administration | E | S | §9.25 |
| 30 | `/admin/access` | Administration | E | S | §9.25 |
| 31 | `/admin/audit` | Administration | E | S | §9.25 |

If step A1 finds additional authenticated routes, add them to the parity map, assign them to the nearest phase, and align them. Do not add them to navigation unless they satisfy Instruction §4.3.

---

## 4. Phase A — Onboarding and audit

**Goal:** Understand the real code and data flow, capture the baseline, and produce the audit artifacts that every later step depends on. Nothing user-facing changes in Phase A except the branch and the `docs/` folder.

### A0 — Workspace setup

- **Context:** Multi-session work needs a durable place for progress and reports. Instruction §20 requires several reports; keeping them on the branch makes the PR self-documenting.
- **Read:** `.gitignore`, any existing `docs/` folder.
- **Do:**
  1. `git fetch origin && git checkout -b feat/clientops-frontend-revision origin/main` (use the real default branch if it is not `main`).
  2. Create `docs/frontend-revision/` containing:
     - `master-instruction.md` — verbatim copy of the Instruction.
     - `execution-plan.md` — verbatim copy of this plan.
     - `PROGRESS.md` — every step ID from this plan (A0 … F7 and every route step) as a checkbox list, plus a "Session log" section.
     - Empty files with their headings in place: `repo-map.md`, `baseline-gates.md`, `parity-map.md`, `integrity-findings.md`, `pattern-inventory.md`, `design-decisions.md`, `backend-dependencies.md`, `changed-files.md`, `before-after.md`, `qa-responsive.md`, `qa-accessibility.md`, `performance-findings.md`, `validation-report.md`.
  3. Add `docs/frontend-revision/screenshots/` to `.gitignore` (screenshots are shared through the PR, not the repository).
  4. `bun install --frozen-lockfile`.
- **Verify:** `git branch --show-current` prints the working branch; `ls docs/frontend-revision` lists all files; install exits 0.
- **Exit:** Branch exists, docs scaffold committed, dependencies installed.
- **Commit:** `chore(revision): scaffold frontend revision workspace`

### A1 — Repository onboarding and repo map

- **Context:** Instruction §5 forbids redesigning from screenshots; the code and data flow must be understood first. The output of this step, `repo-map.md`, is the reference every later step reads under *Read*.
- **Read (in this order):**
  1. `README.md`, `CLAUDE.md`, `package.json` (scripts, dependencies, any supply-chain rules), `vite.config.ts` (router plugin options, especially `routeFileIgnorePrefix` / `routeFileIgnorePattern`), `tsconfig.json`, `vitest` config if separate.
  2. `src/routeTree.gen.ts` (read only) and `find src/routes -type f | sort` — enumerate every route file, layout route and pathless layout.
  3. The root shell: `src/routes/__root.tsx`, the authenticated layout route, `src/components/app-sidebar.tsx`, the header component, theme provider, global search, notifications, user menu, favorites logic, admin navigation logic and its first-destination resolution.
  4. `src/lib/query-keys.ts` (`crmQueryKeys`), `src/lib/format.ts`, `src/lib/admin/types.ts`, the authorization/capability policy module(s), the `routeQueryOptions` implementation.
  5. `src/server-functions/` — index every exported server function: name, inputs, capability check, what it returns, which repository/read-model it calls.
  6. `src/server/read-models/` and `src/server/repositories/` — note view-model shapes, pagination, aggregation, known N+1 patterns.
  7. `src/server/db/neon.server.ts` (read only) and the protected n8n workflow API routes (read only — confirm they are untouched by this work).
  8. The design tokens: global CSS (`src/styles/*.css` or `app.css`), Tailwind theme, dark-mode mechanism, fonts.
  9. Existing tests under `src/**/__tests__` and any `e2e/` folder; how integration suites are gated by environment variables.
- **Do:** Write `repo-map.md` with sections: Scripts and gates; Router configuration; Route file inventory (path → route → loader → server functions); Shell components; Libraries (query keys, format, capability policy); Server function catalogue (table); Read-model catalogue; Design tokens and breakpoints; Test layout and environment gates; Repository conventions that this plan must follow (naming, folder for feature components, how mutations are wrapped, toast library, dialog/sheet primitives in use). Record the folder where shared feature components should live (`src/components/workspace/` is the working assumption; use the repository's existing convention if one exists).
- **Verify:** Every route in P-3 appears in the inventory with its loader and server functions. Every server function used by a route appears in the catalogue. Any route in the repo that is not in P-3 is listed under "Additional routes".
- **Exit:** `repo-map.md` complete; no unanswered "unknown" entries for routes, server functions or shell components.
- **Commit:** `docs(revision): add repository map`

### A2 — Baseline gates and before-state capture

- **Context:** Instruction §18 requires the final report to separate baseline warnings from new warnings and to name environment-gated suites; §20 requires a before/after summary. Both need evidence captured before any change.
- **Read:** `repo-map.md` (Scripts and gates).
- **Do:** First, with the dev server running against the unchanged code, capture a "before" screenshot of every route in P-3 at 1440 and 375 into `docs/frontend-revision/screenshots/before/<route>/<width>.png` (see F1 for how screenshots are stored and shared). Then, on the unchanged branch run, in order, capturing full output to `docs/frontend-revision/baseline/`:
  ```bash
  bun run test 2>&1 | tee docs/frontend-revision/baseline/test.log
  bun run lint 2>&1 | tee docs/frontend-revision/baseline/lint.log
  bunx tsc --noEmit 2>&1 | tee docs/frontend-revision/baseline/tsc.log
  bun run build 2>&1 | tee docs/frontend-revision/baseline/build.log
  git diff --check
  ```
  Summarize in `baseline-gates.md`: pass/fail per gate; every warning (including the `src/routes/__tests__/route-query-keys.test.ts` route-discovery warning and any bundle-size warnings with chunk names and sizes); which test suites skipped for missing environment variables and which variables they need; the build output size table.
- **Verify:** Each log file exists; the summary lists every warning verbatim enough to diff against later.
- **Exit:** `baseline-gates.md` complete. If a gate fails on the untouched baseline, record it as a pre-existing failure and do not attempt to fix it yet — fixing it becomes an explicit step only if it blocks the revision.
- **Commit:** `docs(revision): capture baseline gate results`

### A3 — Route/function parity map

- **Context:** Instruction §5 (item 7) and §20 (deliverable 4). This map is the contract that no real function is lost. It is filled here and updated after every route step.
- **Read:** `repo-map.md`; each route file; the server functions it calls.
- **Do:** For each of the 31 routes (and any additional routes) add a row to `parity-map.md` using template P-11.1: route, purpose, loader and `routeQueryOptions`, query keys used, server functions read, mutations and their server functions, capability rules, navigation entry, and the columns "Before" (what works today) and "After" (filled during Phases C–E). List every interactive element with its intended verdict per P-2.1 (final verdicts are confirmed in A4).
- **Verify:** 31 rows minimum; every mutation names its server function or is marked "no server function" (a candidate integrity finding).
- **Exit:** Parity map complete with "Before" columns filled.
- **Commit:** `docs(revision): add route/function parity map`

### A4 — Control integrity inventory

- **Context:** Instruction §16 lists the defects to search for. Findings feed the route steps; frontend-only cases are fixed in Phases C–E, backend-dependent cases are documented.
- **Read:** All route files, feature components, mutation hooks.
- **Do:** Run these searches (adapt to the repository's libraries) and inspect every hit:
  ```bash
  rg -n "toast\.(success|info)|toast\(" src
  rg -n "<Switch|<Slider|<Toggle" src
  rg -n "useState\(" src/routes src/components --glob '!src/components/ui/**'
  rg -n -i "coming soon|placeholder|mock|sample data|demo" src
  rg -n "error\.message|\.stack|\bcause\b" src/routes src/components
  rg -n "invalidateQueries\(\)|router\.invalidate\(" src
  rg -n "queryKey:\s*\[" src --glob '!src/lib/query-keys.ts'
  rg -n -i "replay|retry|export|download" src/routes src/components
  rg -n "disabled" src/routes src/components --glob '!src/components/ui/**'
  ```
  For each hit classify: success toast without server action; local-only switch representing persisted state; local-only slider representing runtime configuration; replay/retry without idempotency; disabled action without explanation; export without artifact; "coming soon" presented as active navigation; raw database or driver error shown to users; stale invalidation; duplicate or inline query-key construction; navigation not scoped to capability. Record each in `integrity-findings.md` (template P-11.2) with route, element, category, verdict, fix owner (frontend / backend), and the step that will fix it.
- **Verify:** Every hit is either classified or explicitly marked "reviewed, not an issue".
- **Exit:** `integrity-findings.md` lists every finding with a verdict and an owning step.
- **Commit:** `docs(revision): add control integrity inventory`

### A5 — Shared pattern inventory

- **Context:** Instruction §3.6 and §10. Before building shared components, know what already exists and where pages diverge.
- **Read:** `src/components/**` excluding `ui/`; every route file's header, metrics, table, empty, loading and error markup.
- **Do:** In `pattern-inventory.md` tabulate, per route: header implementation, metric presentation, filter implementation, table/list implementation, empty state, loading state, error state, status badge implementation, detail-panel pattern, action placement. Mark each as "shared component X", "page-local", or "missing". List the existing shared components with their props, and decide for each Instruction §10 component whether it maps to an existing component (extend), a page-local pattern (promote), or nothing (create).
- **Verify:** Every route has a row; every §10 component has a decision.
- **Exit:** `pattern-inventory.md` complete.
- **Commit:** `docs(revision): add shared pattern inventory`

### A6 — Navigation and visual system decisions

- **Context:** Instruction §6 (IA), §7 (visual direction), §8 (shell). Decide once; apply everywhere.
- **Read:** `app-sidebar.tsx`, the shell header, design tokens, `pattern-inventory.md`.
- **Do:** Write `design-decisions.md` covering:
  1. **Sidebar model** — the six groups from §6.1 mapped to real route files; favorites behaviour preserved; admin entry shown only when the actor has a permitted admin destination, keeping the existing first-destination logic; active-state rule for nested routes (a group item is active when the current path starts with its route path); the mobile drawer approach; collapsed-mode label handling.
  2. **Token roles** — which existing tokens fill each role in §7.2 (app background, work surface, navigation rail, primary accent, success/warning/destructive/info, muted context, attention tint). If the navigation rail needs a strongly differentiated surface and no token exists, add one token in the global CSS (light and dark), never a hard-coded colour in components.
  3. **Type scale** — the Tailwind classes that implement §7.3 (page title, section title, body/table, metadata, KPI values) and the utility for tabular numerals (`tabular-nums`).
  4. **Spacing** — content padding classes for desktop and mobile, section rhythm, table row height.
  5. **Status map** — the P-2.5 table with the raw values found in the repository and the token used for each tone.
  6. **Component list** — the final list of shared components with paths and one-line responsibilities (from A5 decisions).
  7. **Dark mode** — whether it exists; if it does, every token role must be defined for both schemes.
- **Verify:** Each decision points at a real token, class or file.
- **Exit:** `design-decisions.md` complete; no open questions remain that would block Phase B.
- **Commit:** `docs(revision): record navigation and visual system decisions`

### A7 — Implementation checklist confirmation

- **Context:** Instruction §17 Phase A item 5.
- **Read:** `PROGRESS.md`, `parity-map.md`, `integrity-findings.md`.
- **Do:** Reconcile `PROGRESS.md` with reality: add any additional routes discovered in A1 as route steps in the correct phase; add a sub-item under each route step for every integrity finding it owns; add any server-side steps that passed P-2.8 during the audit as explicit items. Record the ordering you will follow (default: as written in this plan).
- **Verify:** Every integrity finding has an owning step; every route has a step.
- **Exit:** `PROGRESS.md` is the complete, ordered checklist for the rest of the work.
- **Commit:** `docs(revision): finalize implementation checklist`

**Phase A exit criteria:** All seven A-steps committed; `repo-map.md`, `baseline-gates.md`, `parity-map.md` ("Before" complete), `integrity-findings.md`, `pattern-inventory.md`, `design-decisions.md` exist and are complete; no code under `src/` has changed.

---
## 5. Phase B — Global shell and foundational components

**Goal:** Build the shell and the shared components once, so every route step in Phases C–E composes rather than re-implements. Component signatures below are proposals; adapt names and props to the conventions recorded in `repo-map.md`, but keep the responsibilities.

All shared components live in the feature-component folder chosen in A1 (working assumption `src/components/workspace/`). They compose shadcn primitives from `src/components/ui/` and never modify them. Each component gets a focused unit test where it encodes a product rule (status mapping, priority-based column hiding, empty-state selection); pure layout components need no test.

### B1 — Sidebar information architecture

- **Context:** Instruction §6.1, §6.2, §8.1. The sidebar is the user's mental model of the lifecycle.
- **Read:** `src/components/app-sidebar.tsx`, favorites logic, admin navigation and first-destination logic, capability data hook, `design-decisions.md` (Sidebar model).
- **Do:**
  1. Replace the navigation data with the six groups: Today (Revenue Desk `/`); Acquire (Leads, Campaigns, AI Review); Convert (Quotes, Approvals); Deliver (Job Sheets); Retain & Grow (Accounts, Active Clients, Relationships, Renewals, Tasks); Operate (AI Ops `/agents`, Reports, Settings); Administration (existing Admin entry, capability-gated, preserving its first-destination resolution). No group exceeds seven items.
  2. Keep the sidebar collapsible with the existing mechanism. Show `Fimmick ClientOps` with descriptor `Total CRM + AI Operations` in the expanded header; product mark only when collapsed, with icons carrying tooltips that give the full label.
  3. Active state: item is active when the current pathname equals its path or starts with `${path}/`; Revenue Desk is active only on exactly `/`.
  4. Preserve favorites (same storage and behaviour). Preserve sign-out and identity in the footer.
  5. Remove badges that do not carry a truthful live count. If a count is REAL (for example approvals pending from an existing query), keep it and make it come from `crmQueryKeys`.
  6. Mobile: the existing drawer/sheet renders the same group structure.
  7. Navigation items render only when valid for the actor when capability data is available; while capability data loads, render the non-gated groups and no admin entry.
- **Verify:** `bunx tsc --noEmit`; `bun run lint`; dev server: every item navigates to a working page; active state correct on `/leads/123`, `/quotes/new`, `/agents/foo`, `/admin/people/1`; collapsed mode shows tooltips with accessible names; keyboard: Tab through items, Enter activates.
- **Exit:** Sidebar matches §6.1 exactly; no dead links; admin gating unchanged; favorites work.
- **Commit:** `feat(shell): lifecycle sidebar information architecture`

### B2 — Top header

- **Context:** Instruction §6.2 (last bullet), §8.2.
- **Read:** Shell header component, global search, notifications, theme control, user menu.
- **Do:** Sticky header with a solid or lightly translucent surface that keeps text contrast; global search gets a wider input on `lg+`; icon buttons are at least 40px with `aria-label` and tooltip; identity menu unchanged in function. Keep it visually quieter than page command headers (smaller type, no page titles in the header).
- **Verify:** 375: header fits without overflow, search collapses to an icon or full-width row; keyboard reachable; screen-reader names on all icon buttons.
- **Exit:** Header stable across all routes; no visual competition with `WorkspaceHeader`.
- **Commit:** `feat(shell): refine top header`

### B3 — `WorkspaceHeader` (command header)

- **Context:** Instruction §8.3, §12.2, §14 (one H1).
- **Do:** Create the component with this contract:
  ```ts
  type WorkspaceHeaderProps = {
    context: string;                    // lifecycle or operating context, e.g. "Convert"
    title: string;                      // rendered as the page's only <h1>
    description?: string;               // one operational sentence
    primaryAction?: React.ReactNode;    // exactly one
    secondaryActions?: React.ReactNode; // at most two; overflow goes to a menu the caller provides
    status?: React.ReactNode;           // freshness or state indicator
    backHref?: { to: string; label: string }; // detail pages
  };
  ```
  Layout: context label above the title; actions right-aligned on `md+`, wrapping below the title on smaller widths; never horizontal overflow. In development, warn if more than two secondary actions are passed.
- **Verify:** Unit test: renders one `h1`; renders context label; actions wrap (snapshot at both layouts is enough). Storybook is not required.
- **Exit:** Component exported and tested; no route uses it yet (routes adopt it in C–E).
- **Commit:** `feat(workspace): add WorkspaceHeader`

### B4 — `MetricStrip`

- **Context:** Instruction §3.1 (hierarchy), §7.3 (KPI values, tabular numerals), §9.21 (four primary cards).
- **Do:**
  ```ts
  type Metric = {
    id: string;
    label: string;
    value: string;            // already formatted via src/lib/format.ts
    hint?: string;            // one short phrase
    tone?: 'neutral' | 'info' | 'success' | 'warning' | 'destructive';
    href?: string;            // link to the filtered workspace
    updatedAt?: string;       // ISO; rendered as relative time via format.ts
  };
  type MetricStripProps = { metrics: Metric[]; supporting?: Metric[] };
  ```
  At most four `metrics` in the primary row (warn in dev otherwise); `supporting` renders as a compact secondary row. Values use `tabular-nums`. Loading and error variants accept the same shape so layout does not shift.
- **Verify:** Unit test for the four-item cap and tone rendering (text, not colour alone).
- **Exit:** Exported and tested.
- **Commit:** `feat(workspace): add MetricStrip`

### B5 — Global state components

- **Context:** Instruction §8.4, §9.2 (four empty states), §4.3 (no raw errors).
- **Do:** Create:
  - `LoadingSkeleton` with variants `metrics | table | cards | detail | panel` whose dimensions match the final layouts of B4, B6 and B8.
  - `EmptyWorkspaceState` (`title`, `description`, optional `action`).
  - `FilteredEmptyState` (`onClear`, `filterSummary?`).
  - `PermissionDeniedState` (`what: string` — the workspace name; no capability internals).
  - `ErrorState` (`kind: 'server' | 'offline' | 'stale'`, `onRetry`, `title?`, `description?`). It never renders `error.message` from the server; it accepts a safe message string that the route chooses. Add a helper `toSafeErrorMessage(error): string` in `src/lib/errors.ts` (or the repository equivalent) that maps known error shapes to plain sentences and everything else to a generic recoverable message.
  - `StaleDataIndicator` (`updatedAt`, `isRefetching`) for workspaces where freshness matters.
- **Verify:** Unit tests: `toSafeErrorMessage` never returns strings containing "pg", "neon", "relation", "column", "syntax", "stack" or a file path; `ErrorState` renders the retry button with an accessible name.
- **Exit:** All six components exported; error helper tested.
- **Commit:** `feat(workspace): add loading, empty, error and permission states`

### B6 — `DataTableShell` and `ResponsiveRecordList`

- **Context:** Instruction §3.5, §11, §14 (accessible headers), §15 (avoid tiny desktop tables on mobile).
- **Do:**
  ```ts
  type ColumnDef<T> = {
    id: string;
    header: string;
    cell: (row: T) => React.ReactNode;
    priority: 'primary' | 'secondary' | 'tertiary'; // tertiary hidden < lg, secondary hidden < md
    numeric?: boolean;      // right-align + tabular-nums
    sticky?: boolean;       // identity column only
    width?: string;
  };
  type DataTableShellProps<T> = {
    columns: ColumnDef<T>[];
    rows: T[];
    rowKey: (row: T) => string;
    rowHref?: (row: T) => string;
    rowActions?: (row: T) => React.ReactNode; // rendered in an accessible overflow menu
    selection?: { selected: Set<string>; onChange: (next: Set<string>) => void }; // only when a bulk server action exists
    selectedRowKey?: string;
    expandable?: { renderDetails: (row: T) => React.ReactNode }; // expandable row for lower-priority fields and summaries
    caption?: string;       // visually hidden table caption
    sort?: { columnId: string; direction: 'asc' | 'desc'; onChange: (columnId: string) => void };
  };
  type ResponsiveRecordListProps<T> = DataTableShellProps<T> & {
    renderCard: (row: T) => React.ReactNode;   // identity, state, primary metric, due/age, owner, main action
    breakpoint?: 'md' | 'lg';                   // default 'md'
  };
  ```
  `DataTableShell` renders `<table>` with `<th scope="col">`, compact headers, hover and selected states, sortable headers as buttons with `aria-sort`. `ResponsiveRecordList` renders the table at the breakpoint and above, and a card list below it, with the same `rowHref` and actions. No horizontal scroll wrapper by default; an explicit `allowHorizontalScroll` prop exists for finance-heavy detail tables only.
- **Verify:** Unit test: priority classes applied; `aria-sort` toggles; card list renders below breakpoint (test with a container-width mock or class assertions).
- **Exit:** Both exported and tested.
- **Commit:** `feat(workspace): add DataTableShell and ResponsiveRecordList`

### B7 — Status and identity primitives

- **Context:** Instruction §7.5, §3.3, §9.7 (health explained), §14 (status not colour-only).
- **Do:**
  - `src/lib/status-labels.ts` (or extend the existing equivalent): `getStatusLabel(domain, rawStatus) → { label, tone, icon }` implementing the P-2.5 table with the real raw values from `repo-map.md`. Unit-test every raw value maps to exactly one label and that unknown values fall back to the raw value in neutral tone (never crash, never invent).
  - `StatusBadge` (`domain`, `status`) built on the badge primitive; text always visible.
  - `LifecycleBadge` for account lifecycle stage (prospect / active client / at-risk / partner as the data defines).
  - `OwnerDisplay` (`owner?: { name; avatarUrl? }`, `fallback = 'Unassigned'`).
  - `RelationshipHealthDisplay` (`score`, `label`, `reasons: string[]`, `compact?`) — score plus a label plus reasons in a popover or inline list; never a bare number in detail views.
  - `AiRunStatus` — the standard AI marker used everywhere AI output appears; includes a visible "AI" label so AI content is distinct from human decisions. Two variants:
    ```ts
    type AiRunStatusProps = {
      variant?: 'inline' | 'card';   // inline: agent + status + confidence; card: full run context
      agent: string;                  // agent or workflow identity
      workflow?: string;
      subject?: { label: string; href?: string };
      status: string;                 // mapped through status-labels (Running / Completed / Failed / Stuck / Waiting approval)
      confidence?: number;            // 0–1, rendered as percentage
      requiresReview?: boolean;
      summary?: string;               // output summary
      trigger?: string;
      startedAt?: string;             // ISO, formatted via format.ts
      durationMs?: number;
      tokens?: number;
      attentionReason?: string;       // failure or attention reason
      inspectHref?: string;           // direct path to review or inspect
    };
    ```
    Fields that are undefined are omitted, never shown as blanks.
  - `EvidenceList` (`items: { label; value; source?; href? }[]`) for qualification evidence, decision context and risk factors.
- **Verify:** `bun run test` for status labels; visual check of badges in light and dark mode if dark mode exists.
- **Exit:** All primitives exported; status map tested; no route contains status label strings after Phases C–E (checked in F3).
- **Commit:** `feat(workspace): add status, owner, health, AI and evidence primitives`

### B8 — Workflow composites

- **Context:** Instruction §9.1 (today queue), §9.20 (master-detail), §9.5 (activity), §9.13 (sticky action bar), §10.
- **Do:**
  - `AttentionQueue` (`items: { id; severity: 'sla' | 'approval' | 'value' | 'ai-review' | 'risk' | 'failure' | 'stuck'; title; reason; owner?; age: string; href; action?: React.ReactNode }[]`, `emptyTitle`, `emptyDescription`). Severity is shown as an icon plus text label; ordering is the caller's responsibility.
  - `FilterToolbar` (`search?`, `filters: { id; label; options; value; onChange }[]`, `sort?`, `onClear`, `resultCount?`) — wraps on mobile; a "Filters" sheet below `md` when more than two filters exist; values bound to URL search params by the route.
  - `RecordSummaryPanel` (`open`, `onOpenChange`, `title`, `subtitle?`, `sections: { id; title; content }[]`, `primaryAction?`) — side panel on `lg+`, full-height sheet below, focus-managed.
  - `ActivityTimeline` (`events: { id; at: string; kind; title; description?; actor?: { name; isAgent?: boolean }; href? }[]`, `groupByDay?`) — AI-actor events render with `AiRunStatus` styling; dates via `format.ts`.
  - `StickyActionBar` (`children`) — bottom-sticky on mobile, inline on desktop, safe-area aware.
  - `SectionHeader` (`title`, `description?`, `action?`) for the 16–18px workspace section title pattern.
- **Verify:** Unit tests: `AttentionQueue` renders severity text; `ActivityTimeline` marks agent actors; `RecordSummaryPanel` returns focus on close.
- **Exit:** All composites exported and tested.
- **Commit:** `feat(workspace): add attention queue, filter toolbar, summary panel, timeline and action bar`

### B9 — Route-discovery warning cleanup

- **Context:** Instruction §15 known cleanup item. `src/routes/__tests__/route-query-keys.test.ts` is reported as a route by the router plugin.
- **Read:** `vite.config.ts` router plugin options; vitest `include` pattern; `baseline-gates.md` (the exact warning).
- **Do:** Use the repository's configured ignore convention. Preferred: add `routeFileIgnorePattern` (or extend the existing one) to the existing router plugin options in `vite.config.ts` so `__tests__` is ignored — do not add a second plugin instance. Only if the repository already relies on `routeFileIgnorePrefix` and the vitest include pattern still matches the renamed folder, rename the folder instead. Do not move the test out of `src/routes` if that would weaken the route-key parity test's intent.
- **Verify:** `bun run build` no longer prints the route-discovery warning; `bun run test` still executes `route-query-keys.test.ts` (compare test counts with `baseline-gates.md`); `src/routeTree.gen.ts` regenerated without the test route.
- **Exit:** Warning gone, test still discovered, generated tree clean.
- **Commit:** `chore(router): exclude route tests from route discovery`

**Phase B exit criteria:** B1–B9 committed; all shared components exported with tests passing; sidebar and header live on every route; no route content changed yet except through the shell; `bunx tsc --noEmit` and `bun run lint` pass.

---
## 6. Route revision procedure (applies to every route step in Phases C–E)

Run this procedure for each route. Route steps below only add what is specific to that route.

1. **Read the data path.** The route file, its loader and `routeQueryOptions`, every server function it calls, the read model or repository behind each, and the capability rules involved. Update the route's `parity-map.md` row if A3 missed anything.
2. **Classify every control** using P-2.1 and confirm the verdicts in `integrity-findings.md`.
3. **Compose the page** from the shared components: `WorkspaceHeader` (one H1) → `MetricStrip` where the route has truthful aggregates → primary work surface (queue, list, board, editor or master-detail) → supporting context. Answer Instruction §3.1's six questions in the layout order: what needs attention, why, who owns it, what next, current state, evidence.
4. **Wire mutations.** In-progress state, success and failure feedback, `toSafeErrorMessage`, no double submission (disable during `isPending`), invalidation per P-2.9 through the shared helper. Page state must visibly change; a toast alone is not enough.
5. **Filters and sorting** per P-2.2, bound to URL search params where the route already validates search.
6. **States.** Loading skeleton matching the final layout; empty workspace; filtered-empty; permission denied; recoverable error; stale indicator where freshness matters.
7. **Responsive** per P-2.7: verify at 1440 and 375 in the dev server at minimum during the step (full four-width pass happens in F1).
8. **Accessibility** per P-2.7 line items: H1, heading order, table headers, icon-button names, focus, non-colour status, keyboard alternative for drag.
9. **Copy** per P-2.6 and Instruction §21.
10. **Verify:** `bunx tsc --noEmit`, `bun run lint`, `bun run test` for affected files, dev-server walkthrough of every REAL action on the page with the console open (no new errors), then complete the route's "After" column in `parity-map.md` and update `changed-files.md`.
11. **Commit** with prefix `feat(<route>):` and tick the step in `PROGRESS.md`.

**Route exit criteria (all routes):** every REAL action verified end-to-end; no verdict left unresolved; no inline query keys; no status strings in the route file; one H1; no 375px overflow; parity row "After" filled.

---

## 7. Phase C — Revenue and commercial workflows

**Goal:** Revenue Desk, Leads, Quotes, Approvals and Job Sheets — the commercial spine.

### C1 — Revenue Desk `/` (Instruction §9.1)

- **Read:** route file, dashboard read model(s), pipeline mutation server function(s), the timeline-summary control and whatever it currently calls, task and lead server functions.
- **Hierarchy:** `WorkspaceHeader` (context "Today", title "Revenue Desk") → `MetricStrip` with the existing truthful KPIs (overdue follow-ups, due today, hot leads, active quote value; each `href` to the filtered workspace) → `AttentionQueue` ("Today") → pipeline board → context and insights.
- **Today queue:** each item shows severity (SLA breach, approval risk, high-value opportunity, AI review requirement, renewal or relationship risk), account or lead name, action description, owner, due or age, and a direct link. Build items only from data the read model already returns; if a severity has no data source, it simply does not appear — do not fabricate.
- **Pipeline:** keep drag/move only where it performs a real write; add a keyboard-accessible "Move to stage" menu on each card as the required alternative; sticky column headers inside the horizontal board on desktop; clear selected-card state; compact account, contact, score, value and next-step context. Below `md`, render a stage selector with a vertical list for the chosen stage instead of the horizontal board.
- **Lead preview:** `RecordSummaryPanel` with sections: summary, contact, qualification evidence (`EvidenceList`), recent activity (`ActivityTimeline`), open tasks, quotes, AI actions (`AiRunStatus`), and a single primary next step. Detail data loads on open, not on route load.
- **Integrity:** the timeline-summary control is REAL only if you connect it to an existing server-backed result; otherwise UNAVAILABLE with the reason and a `backend-dependencies.md` entry. Any KPI without a reconcilable data source is removed.
- **Invalidation:** stage move → P-2.9 "Lead" family; task actions from the queue → "Task" family.
- **Exit:** queue and board driven by real data; drag has a keyboard alternative; mobile board replaced by stage selector.

### C2 — Leads list `/leads` (Instruction §9.2)

- **Read:** route, leads list server function and its accepted parameters (pagination, filters, sort), bulk action server functions if any.
- **Do:** `WorkspaceHeader` (context "Acquire", primary action "New lead" only if a real create path exists) → `FilterToolbar` with search plus status, source, owner, score and recency filters that are REAL per P-2.2, sort by urgency, score, updated time and company → `ResponsiveRecordList` with columns: company (primary, sticky), primary contact (primary), source (secondary), stage (primary, `StatusBadge`), score (primary, numeric), owner (secondary, `OwnerDisplay`), next task or follow-up (secondary), last activity (tertiary), AI state (tertiary, `AiRunStatus` when present). Row actions in an overflow menu. Selection only if a bulk server action exists.
- **States:** distinguish no leads, no filter matches, no scope (`PermissionDeniedState`), load failure (`ErrorState`).
- **Exit:** every filter is REAL or absent; mobile cards show identity, stage, score, owner, next follow-up, main action.

### C3 — Lead detail `/leads/$id` (Instruction §9.3)

- **Read:** route, lead detail read model, AI qualification result shape, task and quote server functions used here, activity/timeline source.
- **Do:** `WorkspaceHeader` with `backHref` to `/leads`; header shows company and contact, stage (`StatusBadge`), owner, score, source, and one primary next action. Tabs: Overview (summary, qualification, contact, next action), Activity (`ActivityTimeline`), Tasks (open and completed, REAL status changes), Quotes (related records with links), AI Insights.
- **AI Insights:** structured presentation — score breakdown, service interest, budget and urgency signals, recommended next action, reasoning summary, confidence, human-review requirement (`AiRunStatus` + `EvidenceList`). Raw input/output behind an "Advanced" disclosure. Show only fields the qualification result contains; omit missing fields rather than showing empty labels.
- **Invalidation:** task and stage mutations per P-2.9; AI review decisions launched from here per the "AI review" family.
- **Exit:** no raw JSON by default; every tab has real data or a truthful empty state.

### C4 — Quotes list `/quotes` (Instruction §9.12)

- **Read:** route, quotes list server function and parameters, the account-linkage situation (`quotes.account_id` presence).
- **Do:** `WorkspaceHeader` (context "Convert", primary action "New quote" → `/quotes/new`) → `MetricStrip` only if the read model returns truthful aggregates (pending-approval count is the most useful) → `FilterToolbar` with status, owner, value range, date range and search by number, account or contact (REAL per P-2.2) → a visible pending-approval queue (a filter preset, not a second list) → `ResponsiveRecordList` with quote number (primary), account/client (primary), status (`StatusBadge`), value with currency (numeric), owner, valid-until, updated, approval or acceptance state.
- **Integrity:** if the account column is derived only from company-name strings while a canonical link is expected, show "Not linked" and record the `quotes.account_id` dependency (Instruction §9.5 rule applies here too).
- **Exit:** pending-approval queue reachable in one click; account column truthful.

### C5 — Quote builder `/quotes/new` (Instruction §9.13)

- **Read:** route, quote create/save/submit server functions, validation schema, template and product/pricing data sources, the existing total calculation.
- **Do:** Two-column desktop layout — editor left, sticky summary and validation panel right; stacked on mobile with `StickyActionBar` holding total, "Save draft" and "Submit for approval". Sections: context (lead / client / account), template, cover text, scope sections, line items, assumptions, payment terms, validity, discount only if the schema supports it, total and currency. Totals derive from line items through one shared calculation used by both the editor and the summary; add a unit test that the summary total equals the sum of line totals after discount for representative inputs. Inline, field-associated validation (`aria-describedby`). Preserve entered data after a failed submit. Disable submit while pending. Show an "Unsaved changes" indicator in the summary panel and confirm before navigating away with unsaved edits (use the router's existing blocking mechanism if one is in use; otherwise a `beforeunload` handler plus an in-app confirm on sidebar navigation).
- **Integrity:** "Submit for approval" calls the real approval server function; account linkage is populated when the account is known and the schema accepts it — if the schema cannot store it, log the dependency and show "Account will not be linked" in the summary panel.
- **Invalidation:** "Quote" family.
- **Exit:** total reconciles (tested); submit reaches the real approval action; mobile action bar sticky.

### C6 — Quote detail `/quotes/$id` (Instruction §9.14)

- **Read:** route, quote detail read model, lifecycle server functions (edit, submit, approve where allowed, issue, revise, accept, job-sheet handoff), version and approval history sources.
- **Do:** Hierarchy: identity + account + `StatusBadge` in `WorkspaceHeader`; one primary lifecycle action for the current state; commercial summary; document content; version history (accepted and issued versions visibly distinct); approval history; job-sheet handoff; activity. Separate document editing (its own section or edit mode) from lifecycle actions. Locked and immutable states use a visible "Locked" marker plus an explanation. Every unavailable action shows why (state, permission or missing link) via disabled control + tooltip/text — never silently hidden when the user could reasonably expect it.
- **Invalidation:** "Quote" family plus job sheets on acceptance.
- **Exit:** one primary action per state; locked states explained; version distinction visible.

### C7 — Quote PDF `/quotes/$id/pdf` (Instruction §9.15)

- **Read:** the PDF route and its data contract; existing print styles.
- **Do:** Keep the route and data contract intact. Apply consistent Fimmick branding using the existing tokens; print stylesheet: hide app navigation, `break-inside: avoid` on line-item rows and totals, page margins suitable for A4, readable totals and terms.
- **Verify:** Browser print preview at A4, save as PDF; multi-page quote breaks cleanly.
- **Exit:** print output contains no shell chrome; totals and terms legible.

### C8 — Approvals `/approvals` (Instruction §9.16)

- **Read:** route, approvals queue read model, decision server functions (approve, reject, request changes / escalate where they exist), reviewer assignment data.
- **Do:** `WorkspaceHeader` (context "Convert") → `MetricStrip` (pending count, ageing) → `FilterToolbar` (type, age, owner, risk where the read model supports them) → master-detail: queue list left (`ResponsiveRecordList` in compact mode), selected detail right (`RecordSummaryPanel` on mobile). Detail shows request type, requesting user or agent (`AiRunStatus` when an agent), related account/record, financial impact, summary, supporting evidence (`EvidenceList`), created time and age, assigned reviewer, decision notes field, and the decision actions that exist. Disable actions while a decision is pending; after a decision, keep the selected item in sync (reflect the new status) and offer the next pending item.
- **Invalidation:** "Approval decision on a quote" family; if the item is an AI approval, also the "AI review decision" family.
- **Exit:** decisions refresh approvals, quote, account commercial and activity; no double submission.

### C9 — Job Sheets list `/job-sheets` (Instruction §9.17)

- **Read:** route, job sheets list server function, accounting-review status semantics.
- **Do:** `WorkspaceHeader` (context "Deliver") → `FilterToolbar` (status, accounting-review queue preset, owner, date, search by job sheet, quote, account or client) → `ResponsiveRecordList` with job-sheet number, account/client, source quote (link), status (`StatusBadge`), total with currency (numeric), sales owner, accounting owner, billing progress (text such as "2 of 3 portions invoiced", never a bare bar), last update.
- **Exit:** accounting-review queue reachable in one click; billing progress is textual.

### C10 — Job Sheet detail `/job-sheets/$id` (Instruction §9.18)

- **Read:** route, job sheet detail read model, billing-portion server functions, lock/accept server functions, Xero reference fields.
- **Do:** Sections: accepted scope summary; linked quote and accepted version (links); billing portions (this table may use `allowHorizontalScroll` — column relationships matter); PO and client-order references; Xero customer and invoice references; accounting notes; acceptance/lock state; activity. Editable, accepted and locked states are visually and textually distinct. Xero-linked billing portions render as read-only with the reason. Irreversible actions (lock, accept) use a confirmation dialog that names the consequence. Server validation errors surface inline next to the field or portion, mapped through `toSafeErrorMessage`, not as a generic toast.
- **Invalidation:** "Job sheet" family.
- **Exit:** Xero-linked portions protected; irreversible actions confirmed with consequences; validation inline.

**Phase C exit criteria:** C1–C10 committed; parity rows 1–3, 7–13 "After" complete; all Phase C integrity findings resolved or documented.

---
## 8. Phase D — Relationship and retention workflows

**Goal:** Accounts, Account 360, Clients, Relationships, Renewals, Tasks, Campaigns — the retention and growth spine, all anchored to the same account identity (Instruction §3.2).

### D1 — Accounts list `/accounts` (Instruction §9.4)

- **Read:** route, accounts list server function and parameters, favorites/saved views support, relationship-health source, open-signal counts.
- **Do:** `WorkspaceHeader` (context "Retain & Grow") → `FilterToolbar` with search, lifecycle stage, owner, CS owner, and tier / industry / region / health only where the read model supports them; saved views only if persisted (P-2.2), favorites preserved → `ResponsiveRecordList` with account name (primary, `LifecycleBadge` beside it to distinguish prospect, active client, at-risk), account owner, CS owner, relationship health (`RelationshipHealthDisplay compact`), last activity, next action, open commercial value only if reconcilable to account data, open signal count.
- **Integrity:** remove any column whose value cannot be reconciled to the account record (for example a commercial total inferred from company-name matching).
- **Exit:** lifecycle distinction visible in every row; no unreconcilable metrics.

### D2 — Account 360 `/accounts/$id` (Instruction §9.5) — size XL

- **Read:** route, all account detail read models and the server functions feeding each section (stakeholders/contacts, leads, quotes, active client records, engagements, job sheets, billing/Xero references, campaign touches, tasks, touchpoints, AI runs, approvals, signals), every mutation reachable from this page, and the `quotes.account_id` situation.
- **Do:** Header: account name, `LifecycleBadge`, tier and industry, owners, `RelationshipHealthDisplay`, last activity, primary next action. Six sections as tabs (or anchored sections on `lg+`): Overview (executive summary, health and reasons, key stakeholders, current commercial state, open risks and next actions); Stakeholders (structured list with role, influence, sentiment, relationship strength; explicit "No decision-maker identified" / "No champion identified" signals when the data says so); Commercial (leads, quotes, accepted value, open pipeline, current products/services); Delivery & Finance (active client records, engagements, job sheets, billing state and Xero references where available); Activity (`ActivityTimeline` unified from campaign touches, tasks, quotes, touchpoints, AI runs and approvals — merged client-side from the existing per-type queries only if they are already loaded for other sections, otherwise through one aggregate read model that passes P-2.8); Signals (relationship gaps, stale touchpoints, renewal risk, cross-sell opportunities, suggested actions, with REAL dismiss/resolve where authorized).
- **Data loading:** Overview loads with the route; other tabs load on first activation through their own `routeQueryOptions`/queries (Instruction §15). Avoid N+1: one query per section, not per row.
- **Critical correctness:** if quotes cannot be linked because `quotes.account_id` is missing, the Commercial tab shows "Quotes are not linked to accounts yet" with the count of quotes matched only by name shown separately and labelled as such, and `backend-dependencies.md` gets the entry. Do not merge name-matched quotes into the canonical list.
- **Invalidation:** every mutation launched from this page (task, signal, touchpoint, quote action) refreshes all affected sections including Activity — use the P-2.9 families and verify Activity updates without a reload.
- **Exit:** all six sections real or truthfully empty; activity refreshes after any mutation; quote linkage honest.

### D3 — Active Clients list `/clients` (Instruction §9.6)

- **Read:** route, clients list server function, health and renewal fields, onboarding state values.
- **Do:** `WorkspaceHeader` → `MetricStrip` only for truthful aggregates (at-risk count, renewals due in 30 days if present) → `FilterToolbar` (health, renewal window, owner, tier, onboarding status, search; "At risk first" sort) → `ResponsiveRecordList` with client/account, health (`RelationshipHealthDisplay compact`), onboarding state (`StatusBadge`), ARR or value only where truthful, renewal date, renewal risk, owner, last touchpoint, next action.
- **Exit:** at-risk-first sort REAL; every metric reconcilable.

### D4 — Client detail `/clients/$id` (Instruction §9.7)

- **Read:** route, client detail read model, touchpoint and renewal-plan server functions, AI renewal-risk output shape, related job sheets and commercial history sources.
- **Do:** Sections: client summary (with prominent next client-success action); products and engagements; health and risk factors (`RelationshipHealthDisplay` full, `EvidenceList` of factors — never a bare number); touchpoints (log touchpoint if REAL); renewal plan; open tasks; related job sheets or commercial history; AI renewal-risk outputs (`AiRunStatus` + evidence + recommendation, visibly distinct from confirmed human decisions).
- **Invalidation:** "Touchpoint / renewal plan" and "Task" families.
- **Exit:** health explained; renewal risk shows evidence and recommendation; AI vs human distinction visible.

### D5 — Relationships `/relationships` (Instruction §9.8)

- **Read:** route, signals read model, dismiss/resolve server functions and their capability rules.
- **Do:** `WorkspaceHeader` → `MetricStrip` (relationship health overview, open signals by severity) → `AttentionQueue` sections: accounts missing decision-makers or champions, stale relationships, high-risk engagements, cross-sell opportunities. Each signal shows severity, account (link), signal type, reason, suggested action, age, owner, and dismiss/resolve only where REAL and authorized (otherwise no button).
- **Invalidation:** "Relationship signal" family — verify Account 360 Signals and Activity refresh.
- **Exit:** exception-oriented ordering; actions REAL or absent.

### D6 — Renewals `/renewals` (Instruction §9.9)

- **Read:** route, renewals read model, pagination and window parameters.
- **Do:** `WorkspaceHeader` → `MetricStrip` (at-risk value, due soon) → `FilterToolbar` with windows (overdue, 30, 60, 90, later), risk, product, owner where supported → paginated `ResponsiveRecordList` with account/client, product or engagement, renewal date, value (numeric), risk (`StatusBadge` "At risk" / "Overdue"), health, last touch, owner, next action. Mobile cards lead with date and risk.
- **Exit:** windows are server-backed (or the full dataset is loaded); pagination preserved; mobile needs no horizontal scroll.

### D7 — Tasks `/tasks` (Instruction §9.19)

- **Read:** route, tasks read model and view parameters, status-change server function, created-by-agent field.
- **Do:** `WorkspaceHeader` → view switcher (My tasks, Due today, Overdue, Unassigned where permitted, Completed, By account or related object) as URL-backed filters → `ResponsiveRecordList` with title, priority, status (`StatusBadge`), due date (Overdue styling via status map), owner, related account/lead/client/project link, source or created-by-agent indicator (`AiRunStatus compact`). Status changes stay REAL; optimistic update only if rollback and error feedback exist and are tested.
- **Invalidation:** "Task" family — verify Revenue Desk queue, related detail views and Account 360 Activity refresh.
- **Exit:** every view REAL; status change feedback correct.

### D8 — Campaigns list `/campaigns` (Instruction §9.10)

- **Read:** route, campaigns list read model, outcome fields (leads, quotes, client activity), follow-up completion source.
- **Do:** `WorkspaceHeader` (context "Acquire") → `FilterToolbar` (status, type, date range, owner, search) → `ResponsiveRecordList` with name, type, status, dates, owner, members/attendees, follow-up completion, downstream outcomes. Remove vanity metrics that lack a downstream outcome.
- **Exit:** outcome columns come from real data; no vanity-only columns.

### D9 — Campaign detail `/campaigns/$id` (Instruction §9.11)

- **Read:** route, campaign detail read model, member list source, follow-up server functions, account-matching data (matched, unmatched, duplicate).
- **Do:** Sections: summary; members/attendees (`ResponsiveRecordList` with person/company, attendee status, interests, account match with explicit "Unmatched" and "Possible duplicate" states, follow-up owner, follow-up status, conversion outcome, next action); follow-up queue (`AttentionQueue`); conversion outcomes; related accounts and contacts; activity. Unmatched and duplicate identities are visible and, where a REAL resolve/link action exists, actionable; otherwise shown with a read-only explanation.
- **Invalidation:** "Campaign member follow-up" family.
- **Exit:** data-quality issues visible, never hidden; follow-up actions REAL or absent.

**Phase D exit criteria:** D1–D9 committed; parity rows 4–5, 14–20 "After" complete; Account 360 activity refresh verified after at least three different mutation families.

---

## 9. Phase E — AI and operating workspaces

**Goal:** AI Review, AI Ops, Agent detail, Reports, Settings, Admin — observable, governable, truthful.

### E1 — AI Review `/ai-review` (Instruction §9.20)

- **Read:** route, review queue read model, decision server functions (approve, reject, request changes / escalate where present), agent and confidence fields, related-record links.
- **Do:** Master-detail: compact queue left (approval type, account/subject, agent, confidence, age, risk or reason for review, `StatusBadge`), decision context right (proposed action, agent summary, relevant source context, confidence, related record link, reviewer notes, decision actions). Keep the selected item synchronized after a decision: update its status in place, then move selection to the next pending item in the same ordering. Submitting disables the actions and shows progress; no double submission. Empty state: "No work needs attention" with the last-reviewed time. Links use "AI Ops", never "Agent Monitor". Raw agent payload only under "Advanced".
- **Invalidation:** "AI review decision" family.
- **Exit:** reliable decisions; selection sync verified; queue-empty state operational.

### E2 — AI Ops Control Tower `/agents` (Instruction §9.21)

- **Read:** route, agent fleet read model(s), run history source, attention sources (stuck, failed, waiting approval), token and confidence fields, any existing pause/replay/threshold controls and what they call.
- **Do:** `WorkspaceHeader` (context "Operate", title "AI Ops") → `MetricStrip` with four primary metrics (runs last 24h, success rate, needs attention, running jobs) and supporting metrics (token usage, average confidence, pending approvals, stuck jobs) — only those the read model returns → AI workforce cards (agent name and workflow, catalogue state, runs over 24h, success rate, attention count, activity sparkline built from real run counts, last run, "Inspect" link to `/agents/$name`) → `AttentionQueue` ordered stuck runs, recent failures, waiting approvals (issue type, agent, subject, age, summary, Inspect or Review action) → recent runs list (agent, workflow, trigger, status, duration, tokens, confidence, time, expandable summary).
- **Integrity:** pause, replay, threshold, model and auto-approval controls become READ-ONLY displays or are REMOVED unless they are persisted, authorized, audited and enforced server-side (verify in code; the default expectation is that they are not). Record each in `integrity-findings.md` with the backend dependency.
- **Performance:** the sparkline and recent-runs list must not load full run payloads; use the compact read model or add one under P-2.8.
- **Exit:** fleet health, attention queue and recent runs present and truthful; no runtime-affecting control without server enforcement.

### E3 — Agent detail `/agents/$name` (Instruction §9.22)

- **Read:** route, agent run history read model and pagination, the code-defined agent catalogue (workflow identity, runtime state, model catalogue, human-review behaviour), any trace route.
- **Do:** Tabs: Runs (paginated history with status, time, confidence, tokens, output summary, expandable input snapshot, link to full trace only if a trace route exists); Memory (read-only explanation: no long-term memory currently persisted; required retention policy; required access controls; required deletion and audit behaviour); Governance (read-only catalogue state: workflow identity, runtime catalogue state, model catalogue, human-review behaviour, followed by "Required before settings become editable": versioned policy store, server-side dispatch enforcement, capability checks, audit log, rollback, runtime telemetry). Use the exact read-only sentence from P-2.6.
- **Exit:** no editable governance controls; memory and governance tabs truthful.

### E4 — Reports `/reports` (Instruction §9.23)

- **Read:** route, report read models, range selection, chart library in use, the current Export CSV handler.
- **Do:** Default to the most useful report the read model supports instead of an empty area; keep range selection visible and keyboard accessible; `MetricStrip` for KPI hierarchy; every chart gets a title, subtitle and an accessible text summary of the same data; distinct loading, empty, insufficient-data and error states; charts resize with their container; large chart modules lazy-loaded. Chart rules (Instruction §13): a chart exists only where the visual pattern aids a decision, otherwise a table; no pie charts beyond five categories; axis and tooltip values formatted through `src/lib/format.ts`; semantic colours only for semantic meaning; no interpolation of missing periods — gaps render as gaps with a note.
- **Export:** implement a REAL client-side CSV export from the loaded, authorized dataset: `src/lib/csv.ts` with `toCsv(rows, columns)` (RFC 4180 quoting, UTF-8 BOM for spreadsheet compatibility) and a browser download via a Blob URL; unit-test quoting of commas, quotes and newlines. The button is disabled with "Nothing to export" when the dataset is empty and never claims a queue. If the dataset is server-paginated and not fully loaded, export only what is loaded and label the file and button accordingly ("Export loaded rows"), or mark export UNAVAILABLE.
- **Future direction:** structure the report switcher and layout so forecast accuracy, campaign attribution, gross margin, renewal and expansion, AI cost per outcome, human-review workload, and AI quality and latency can be added later — as documented placeholders in `backend-dependencies.md`, not as visible empty reports.
- **Exit:** default report renders; export produces a real file; no fake reports visible.

### E5 — Settings `/settings` (Instruction §9.24)

- **Read:** route, settings read and save server functions, which fields persist, capability rules per setting group, the Admin workspace to avoid duplication.
- **Do:** Group by domain, showing only backed groups among: profile and preferences, notifications, workspace defaults, products and pricing, integrations, automation, AI governance. Each group is labelled personal, workspace, integration or administrative. Any field without a persisting server function is removed. Explicit save state per group (unsaved indicator, saving, saved with timestamp, error with inline recovery). Restricted settings explain the permission required rather than failing on save. No duplication of `/admin/*` functionality — link to Admin instead.
- **Invalidation:** "Settings save" family.
- **Exit:** every visible field persists; save states explicit.

### E6 — Admin alignment `/admin`, `/admin/people`, `/admin/people/$id`, `/admin/teams`, `/admin/teams/$id`, `/admin/access`, `/admin/audit` (Instruction §9.25)

- **Read:** each admin route, `src/lib/admin/types.ts`, protected-role rules, management scope, audit log source, dangerous actions (deactivate, role change, access revoke).
- **Do:** Apply `WorkspaceHeader` (context "Administration") and `ResponsiveRecordList` / `DataTableShell` conventions to every admin page; status, role, team and access shown with the shared badges; dangerous actions visually subordinate to primary actions and behind confirmation dialogs that state the consequence; capability-aware navigation preserved exactly; every mutation feeds the audit log as it does today (verify, do not re-implement).
- **Invalidation:** "Admin" family, including capability/navigation data so the sidebar reflects changed access.
- **Exit:** seven admin routes visually aligned; protected-role rules and management scope untouched (diff the policy modules to prove it).

**Phase E exit criteria:** E1–E6 committed; parity rows 6, 21–31 "After" complete; all AI-related integrity findings resolved as READ-ONLY / UNAVAILABLE / REMOVED with dependencies documented.

---
## 10. Phase F — Responsive, accessibility, performance and QA

**Goal:** Prove the acceptance criteria (Instruction §19) with evidence, produce every report, and deliver a reviewable preview. Nothing new is designed in Phase F; defects found here are fixed in place and logged.

Browser verification uses whatever automation the environment provides (Playwright if the repository has it, otherwise the available browser tool). If no browser automation is available, record the affected checks as environment-gated in `validation-report.md` and provide the manual checklist for a human — do not report them as passed.

### F1 — Responsive pass

- **Do:** For each of the 31 routes at 1440, 1024, 768 and 375: load a representative record where the route needs an id; capture a screenshot into `docs/frontend-revision/screenshots/after/<route>/<width>.png` (keep the `screenshots/` folder out of git by adding it to `.gitignore` in A0; the full before/after set is attached to the PR as a zipped artifact or PR comment, and the key before/after pairs are embedded in the PR description); assert `document.documentElement.scrollWidth <= window.innerWidth`; confirm the command header wraps, primary lists switch to cards below `md`, drawers and dialogs remain usable, and no primary decision requires a tiny table. Fill `qa-responsive.md` (template P-11.6). Fix defects immediately with commits prefixed `fix(responsive):`.
- **Exit:** zero routes with horizontal overflow at 375; every route has four screenshots; report complete.

### F2 — Keyboard and accessibility pass

- **Do:** For each primary workflow (Revenue Desk queue and board, Leads list → Lead detail, Quote builder → submit, Approvals decision, Job sheet lock, Account 360 tabs, Client touchpoint, Relationships resolve, Tasks status change, AI Review decision, AI Ops inspect, Reports export, Settings save, Admin people edit): navigate keyboard-only from the sidebar to the action and back; confirm visible focus, dialog focus trap and return, one H1, logical heading order, `<th scope>` on tables, accessible names on icon buttons, status text alongside colour, form errors associated with fields, reduced-motion respected, touch targets on mobile. Run the browser accessibility inspector (or `axe` if available in the repo) on each route and record violations. Fill `qa-accessibility.md` (template P-11.7). Fix with `fix(a11y):` commits.
- **Exit:** no critical or serious violations remaining; keyboard path complete for every primary workflow.

### F3 — Links, actions, console and network verification

- **Do:** On the dev server with the console open, walk every route and every REAL action from the parity map; record any console error or failed network request and fix it. Run a link check: every `href`/`to` in the app resolves to a working route (no 404s, no navigation to removed placeholders). Run these repository-wide greps and resolve every hit:
  ```bash
  rg -n "queryKey:\s*\[" src --glob '!src/lib/query-keys.ts'      # inline keys
  rg -n "Agent Monitor|coming soon" src                             # forbidden copy
  rg -n "toast\.success" src/routes src/components                  # must be paired with a mutation
  rg -n "supabase" src                                              # must be zero
  ```
  Confirm no route file imports from `src/server/` directly. Confirm dark mode renders every token role if dark mode exists.
- **Exit:** zero new console errors; zero broken links; greps clean.

### F4 — Performance and bundle review

- **Do:** `bun run build`; compare chunk sizes against `baseline-gates.md`; list every chunk over 500 KB with its cause; lazy-load chart modules and any heavy detail-only modules; confirm route-level code splitting is intact; confirm no detail dataset loads on list routes (network tab); confirm no N+1 patterns in the routes touched (one query per section). Record in `performance-findings.md` (template P-11.8).
- **Exit:** no new chunk over 500 KB without a documented reason; baseline warnings not worsened.

### F5 — Full repository gates

- **Do:**
  ```bash
  bun install --frozen-lockfile
  bun run test
  bun run lint
  bunx tsc --noEmit
  bun run build
  git diff --check
  ```
  Diff every warning against `baseline-gates.md`. Fill `validation-report.md` (template P-11.9) with five lists: passed checks; environment-gated or skipped checks (name the missing variables); existing baseline warnings; new warnings introduced by the revision (each with a justification or a fix); known backend dependencies. A skipped integration suite is reported as skipped, never as passed.
- **Exit:** all gates pass or are explicitly environment-gated; the report is complete.

### F6 — Draft pull request and Vercel preview

- **Do:** Write `before-after.md` (template P-11.4) and `changed-files.md` (template P-11.3). Push the branch. Open a **draft** PR against the default branch using template P-11.10, embedding key screenshots and linking every report in `docs/frontend-revision/`. Confirm the Vercel preview builds from the PR (Git integration) — if the environment lacks Vercel access or the preview needs environment variables you cannot see, record it as environment-gated and tell the human exactly what to run. Against the preview URL, repeat a smoke subset of F1 and F3: the shell at 1440 and 375, at least one route per lifecycle group including one detail route, one REAL read on each, no console errors, no horizontal overflow; record results in `validation-report.md` under "Preview verification" and note preview-only differences (missing environment-gated integrations).
- **Never:** merge, close, mark ready-for-review without instruction, or promote to production.
- **Exit:** draft PR open; preview reachable or gated with instructions; all report links resolve.

### F7 — Final report to the human

- **Do:** Post a concise summary (in the PR description and to the requester) that names: the PR and preview URLs; counts (routes aligned, integrity findings fixed vs documented, backend dependencies); the five validation lists from F5; what still requires human decision (package approvals, backend dependencies, any environment-gated checks). Update `PROGRESS.md` to all-complete with the final commit hash.
- **Exit:** the human can review and approve from the PR alone.

**Phase F exit criteria:** F1–F7 complete; every Instruction §20 deliverable exists; production untouched.

---

## 11. Report templates

Keep every report in `docs/frontend-revision/`. Use these headings exactly so the PR can link to stable anchors.

### 11.1 `parity-map.md` — one row per route

| Route | Purpose | Loader / routeQueryOptions | Query keys | Server functions (read) | Mutations → server function | Capabilities | Nav entry | Before (works today) | After (verified) | Integrity finding IDs |
|---|---|---|---|---|---|---|---|---|---|---|

### 11.2 `integrity-findings.md` — one row per control

| ID | Route | Element | Category (Instruction §16) | Verdict (P-2.1) | Owner (frontend / backend) | Fix step | Status (fixed / documented) | Note |
|---|---|---|---|---|---|---|---|---|

### 11.3 `changed-files.md`

Sections: **Shell** (sidebar, header, root layout); **Shared components** (each with one-line responsibility); **Libraries** (status labels, invalidation helper, csv, errors); **Routes** (grouped by lifecycle group); **Server** (each change with the P-2.8 justification); **Tests**; **Configuration** (`vite.config.ts`, `package.json` if a package was approved); **Docs**.

### 11.4 `before-after.md`

For the shell and each lifecycle group: one paragraph "Before" (what a user experienced), one paragraph "After" (what changed and why it matters operationally), the key screenshots, and a short list of behaviours deliberately preserved. Product-level summary at the top: navigation, hierarchy, integrity, responsiveness, accessibility, consistency.

### 11.5 `backend-dependencies.md` — one entry per gap

```
### BD-<n>: <short title>
- Affected routes:
- What is missing (schema / server function / policy / telemetry):
- Why the UI cannot be truthful without it:
- UI state implemented meanwhile (READ-ONLY / UNAVAILABLE / removed) and its copy:
- Proposed backend change (scope, migration yes/no, risk):
- Integrity finding IDs:
```

Seed entries expected from the Instruction: `quotes.account_id` linkage; Revenue Desk timeline summary (if not connectable); AI Ops runtime controls (pause/replay/threshold/model/auto-approval) requiring versioned policy store, server-side dispatch enforcement, capability checks, audit log, rollback, runtime telemetry; agent long-term memory persistence and policies; Projects route and permissions; future report families (forecast accuracy, campaign attribution, gross margin, renewal and expansion, AI cost per outcome, human-review workload, AI quality and latency); server-side export with audit event if a client-side export is insufficient.

### 11.6 `qa-responsive.md`

| Route | 1440 | 1024 | 768 | 375 | Overflow at 375 | Card mode below md | Header wraps | Dialogs usable | Notes |
|---|---|---|---|---|---|---|---|---|---|

Cell values: pass / fixed (commit) / gated.

### 11.7 `qa-accessibility.md`

Sections: method (tools, browsers); per-workflow keyboard path results; per-route inspector results (violations by severity, fixed vs remaining with justification); global checks (H1 per page, heading order, focus visibility, icon-button names, status not colour-only, reduced motion, dialog focus management, touch targets).

### 11.8 `performance-findings.md`

Sections: bundle table (chunk, baseline size, new size, delta, reason); chunks over 500 KB and action taken; lazy-loaded modules; route-load payload review (list routes must not fetch detail datasets); N+1 review per touched read model; invalidation review (no router-wide invalidations); remaining recommendations.

### 11.9 `validation-report.md`

The five required sections, in this order: **Passed checks**; **Environment-gated or skipped checks** (with the variables or access needed); **Existing baseline warnings**; **New warnings introduced by the revision** (with justification or fix); **Known backend dependencies** (links to BD entries). Then **Command transcripts** (a summary for each of the six gate commands) and **Preview verification** (the F6 smoke results against the Vercel preview, or the exact reason it is environment-gated).

### 11.10 Draft PR description

```
## Fimmick ClientOps — Total CRM + AI Operations frontend revision

**Status:** Draft — do not merge. Preview: <url or "environment-gated: see validation report">

### Scope
<3–5 lines: shell, shared components, 31 routes, integrity fixes, QA>

### What changed (by area)
Shell · Shared components · Libraries · Routes by lifecycle group · Server (with P-2.8 justification) · Tests · Config

### Screenshots
<before/after pairs for Revenue Desk, Leads, Account 360, Quote detail, Approvals, AI Ops at 1440 and 375>

### Validation
Passed · Environment-gated/skipped · Baseline warnings · New warnings · Backend dependencies (link docs/frontend-revision/validation-report.md)

### Reports
parity-map · integrity-findings · backend-dependencies · before-after · changed-files · qa-responsive · qa-accessibility · performance-findings

### Decisions needed from reviewers
<package approvals, backend dependency priorities, anything environment-gated>
```

---

## 12. Risk register and known dependencies

| Risk | Signal | Mitigation |
|---|---|---|
| Plan names files or keys that differ from the repository | A1 finds mismatches | Authority order P-0.1; correct the plan in `PROGRESS.md`, never bend the repo to the plan |
| Scope creep into backend or schema | A change fails a P-2.8 clause | Backend-dependencies entry + truthful UI state; no migrations |
| Fake or optimistic UI slips in under time pressure | Success feedback without a server call | P-2.1 verdict per control; F3 greps; `toast.success` must sit next to a mutation |
| Invalidation gaps leave stale workspaces | A mutation on one page does not update another | Shared invalidation helper with unit tests; Account 360 cross-family verification in Phase D exit |
| Hydration mismatches from dates or locale | Console hydration warnings | All dates and numbers through `src/lib/format.ts`; F3 console check |
| Capability regressions while restyling admin or navigation | Diff in policy modules or gating logic | Policy modules are read-only for this branch; E6 requires a clean diff of them |
| Bundle growth from charts or new components | F4 size table | Lazy-load charts; no new packages without approval |
| Route-discovery fix breaks test discovery | Test count drops vs baseline | B9 compares counts; use existing ignore convention only |
| `quotes.account_id` missing | Commercial data cannot be reconciled to accounts | Truthful "Not linked" state; BD entry; no name-matching workaround presented as canonical |
| AI Ops controls appear functional but are not enforced | Control changes local state only | READ-ONLY / REMOVED with the standard read-only sentence; BD entry |
| Environment-gated checks (integration tests, Vercel, browser automation) | Missing variables or access | Report as gated with exact requirements; never as passed |
| Session context loss across a long branch | Repeated or contradictory edits | Cold-start protocol P-0.2; `PROGRESS.md` session log; one commit per step |
| Preview accidentally promoted | Vercel production alias changes | Never run production deploy commands; PR stays draft; note in F6 |

---

## 13. Commit and branch conventions

- One branch: `feat/clientops-frontend-revision`. No merges from other feature branches during the work; rebase on the default branch only if the human asks.
- One commit per step minimum, conventional-commit style: `chore(revision)`, `docs(revision)`, `feat(shell)`, `feat(workspace)`, `feat(<route>)`, `fix(responsive)`, `fix(a11y)`, `fix(perf)`, `chore(router)`.
- Server changes permitted by P-2.8 get their own commit with the justification in the body.
- Never commit `.env*`, credentials, screenshots containing real client data beyond what the reviewer needs (prefer seeded or non-sensitive records for screenshots; if only real data exists, say so in the PR and keep screenshots minimal).
- `git diff --check` clean before every commit.

---

## Appendix A — Instruction coverage matrix

| Instruction section | Plan location |
|---|---|
| §1 Role, §2 Vision | P-0, P-1, P-2 (applied throughout) |
| §3.1 Operational clarity | P-6 step 3; every route hierarchy |
| §3.2 One relationship graph | D2 Account 360; account links in C2–C10, D3–D9 |
| §3.3 Observable AI | B7 `AiRunStatus`; C3, D4, E1, E2, E3 |
| §3.4 No decorative controls | P-2.1; A4; F3 |
| §3.5 Progressive disclosure | B6, B8; C1 lead preview; D2 tabs |
| §3.6 Consistency | Phase B; P-6 |
| §4.1–4.4 Technical constraints | P-0.4; P-2.3; P-2.8 |
| §5 Source-of-truth review | A1–A7 |
| §6 Information architecture | A6; B1 |
| §7 Visual direction | A6; B3–B8 |
| §8 Shell | B1, B2, B3, B5 |
| §9.1–9.25 Routes | C1–C10, D1–D9, E1–E6 |
| §10 Shared components | B3–B8 |
| §11 Tables and responsive | B6; P-2.7; F1 |
| §12 Forms and actions | P-6 step 4; C5, C10, E5 |
| §13 Data visualization | E4; B4 |
| §14 Accessibility | P-2.7; F2 |
| §15 Performance | D2 data loading; E2, E4; B9; F4 |
| §16 Integrity audit | A4; F3 |
| §17 Phases | P-4 … P-10 |
| §18 Validation commands | A2; F5 |
| §19 Acceptance criteria | Phase exit criteria; F1–F5 |
| §20 Deliverables | P-11; F6; F7 |
| §21 Copy system | P-2.6 |
| §22 Final execution instruction | P-0.2; A0; F6 |

## Appendix B — Step index for `PROGRESS.md`

A0 A1 A2 A3 A4 A5 A6 A7 · B1 B2 B3 B4 B5 B6 B7 B8 B9 · C1 C2 C3 C4 C5 C6 C7 C8 C9 C10 · D1 D2 D3 D4 D5 D6 D7 D8 D9 · E1 E2 E3 E4 E5 E6 · F1 F2 F3 F4 F5 F6 F7

Forty-nine steps. Each is a checkbox in `PROGRESS.md` with sub-items for the integrity findings it owns.
