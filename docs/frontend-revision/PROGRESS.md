# Frontend Revision — Progress

**Branch:** `feat/clientops-frontend-revision`
**Plan:** [execution-plan.md](./execution-plan.md) · **Instruction:** [master-instruction.md](./master-instruction.md)
**Release rule:** Draft PR + Vercel preview only. No merge to `main`, no production promotion, until a human explicitly approves.

Legend: `[ ]` not started · `[x]` done · `[~]` done-with-dependency (see [backend-dependencies.md](./backend-dependencies.md))

---

## Phase A — Onboarding and audit

- [x] **A0** — Workspace setup
- [x] **A1** — Repository onboarding and repo map
- [~] **A2** — Baseline gates and before-state capture
- [x] **A3** — Route/function parity map
- [x] **A4** — Control integrity inventory
- [x] **A5** — Shared pattern inventory
- [ ] **A6** — Navigation and visual system decisions
- [ ] **A7** — Implementation checklist confirmation

## Phase B — Global shell and foundational components

- [ ] **B1** — Sidebar information architecture
- [ ] **B2** — Top header
- [ ] **B3** — `WorkspaceHeader` (command header)
- [ ] **B4** — `MetricStrip`
- [ ] **B5** — Global state components
- [ ] **B6** — `DataTableShell` and `ResponsiveRecordList`
- [ ] **B7** — Status and identity primitives
- [ ] **B8** — Workflow composites
- [ ] **B9** — Route-discovery warning cleanup

## Phase C — Revenue and commercial workflows

- [ ] **C1** — Revenue Desk `/`
- [ ] **C2** — Leads list `/leads`
- [ ] **C3** — Lead detail `/leads/$id`
- [ ] **C4** — Quotes list `/quotes`
- [ ] **C5** — Quote builder `/quotes/new`
- [ ] **C6** — Quote detail `/quotes/$id`
- [ ] **C7** — Quote PDF `/quotes/$id_/pdf`  _(PC-2: real route id)_
- [ ] **C8** — Approvals `/approvals`
- [ ] **C9** — Job Sheets list `/job-sheets`
- [ ] **C10** — Job Sheet detail `/job-sheets/$id`

## Phase D — Relationship and retention workflows

- [ ] **D1** — Accounts list `/accounts`
- [ ] **D2** — Account 360 `/accounts/$id` (XL)
- [ ] **D3** — Active Clients list `/clients`
- [ ] **D3b** — Client import `/clients/import`  _(PC-1: route omitted by the plan)_
- [ ] **D4** — Client detail `/clients/$id`
- [ ] **D5** — Relationships `/relationships`
- [ ] **D6** — Renewals `/renewals`
- [ ] **D7** — Tasks `/tasks`
- [ ] **D8** — Campaigns list `/campaigns`
- [ ] **D9** — Campaign detail `/campaigns/$id`

## Phase E — AI and operating workspaces

- [ ] **E1** — AI Review `/ai-review`
- [ ] **E2** — AI Ops Control Tower `/agents`
- [ ] **E3** — Agent detail `/agents/$name`
- [ ] **E4** — Reports `/reports`
- [ ] **E5** — Settings `/settings`
- [ ] **E6** — Admin alignment `/admin/*` (8 routes incl. `/admin/`)  _(PC-1)_
- [ ] **E7** — Account settings `/account`  _(PC-1: route omitted by the plan)_
- [ ] **E8** — Notifications `/notifications`  _(PC-1: route omitted by the plan)_

## Phase F — Responsive, accessibility, performance and QA

- [ ] **F1** — Responsive pass
- [ ] **F2** — Keyboard and accessibility pass
- [ ] **F3** — Links, actions, console and network verification
- [ ] **F4** — Performance and bundle review
- [ ] **F5** — Full repository gates
- [ ] **F6** — Draft pull request and Vercel preview
- [ ] **F7** — Final report to the human

---

## Plan corrections

Per plan §0.1, the repository is the authority. Corrections to the plan are recorded here.
Evidence for each is in [repo-map.md](./repo-map.md) under the matching VF number.

| # | Plan says | Repository reality | Resolution |
|---|---|---|---|
| PC-1 | 31 authenticated routes (§3) | **35.** The table omits `/account`, `/notifications`, `/clients/import`, and `/admin/` (a separate registration from the `/admin` layout). | A3 builds 35 parity rows. F1's screenshot matrix becomes 35×4. The 4 extra routes join the nearest phase: `/account` and `/notifications` → E; `/clients/import` → D (with `/clients`); `/admin/` → E6. None gains a nav entry. (VF-1) |
| PC-2 | Route id `/quotes/$id/pdf` | Registered id is **`/quotes/$id_/pdf`**. The `_` opts the route out of the `/quotes/$id` layout and is meaningful. | Use the real id everywhere. Note that two in-repo registries also spell it wrong. (VF-1) |
| PC-3 | Mutations use `useMutation` — `isPending`, optimistic updates, rollback (§2.3, §6 step 4) | **`useMutation` appears 0 times repo-wide**; so does `useSuspenseQuery`. Every write is `await serverFn({data})` in an async handler with hand-written invalidation. | Keep the imperative pattern; deliver §12.3's guarantees through a shared wrapper over the existing shape. Introducing `useMutation` across 35 routes is out of scope. Optimistic updates stay out except where rollback already exists. (VF-2) |
| PC-4 | "Never call `router.invalidate()`" for small mutations (§2.3) | Too absolute. A loader is not a query observer, so `invalidateQueries` repaints only where the **component** holds a `useQuery`. 23 routes do; 4 read loader data but correctly use scoped `router.invalidate`; **6 read loader data with no `useRouter` and no `useQuery`** — `campaigns`, `job-sheets`, `quotes`, `renewals` (+2 benign). `/renewals` and `/campaigns` are broken today. | Rule becomes: component subscribes via `useQuery` → narrow `crmQueryKeys`; component reads `useLoaderData` only → **scoped** `router.invalidate({filter})`, never bare; both when a mutation spans them. (VF-3, **corrected in A4** — the first version wrongly used `ensureQueryData` as the discriminator and named 9 routes.) |
| PC-5 | Create shared components in `src/components/workspace/` (§5) | That folder does not exist. `src/components/sales/index.ts` is the **only barrel** in the tree and already exports the shared workspace vocabulary to 10 routes. | Extend `src/components/sales/` and its barrel. Creating `workspace/` would add a fourth convention. Naming caveat recorded in A6. (VF-5) |
| PC-6 | Create `MetricStrip` (B4) | Already exists at `src/components/sales/metric-strip.tsx`, exported with a `SalesMetric` type. | B4 becomes extend-and-reconcile (four-metric cap, `tabular-nums`), not create. (VF-6) |
| PC-7 | Create `WorkspaceHeader` (B3) | **Two** header components already exist with a clean 15/10 split and zero overlap: `PageHeader` and `CommandHeader`. 10 further routes use neither. | B3 converges the two into one rather than adding a third. This split is the concrete cause of the "unrelated templates" feeling in Instruction §3.6. (VF-4) |
| PC-8 | Create `src/lib/invalidate.ts` (§2.3) | Two partial helpers already exist — `operational-invalidation.ts` (4 mutations, returns keys only) and `company-workspace/invalidation.ts` (2 mutations, with a real executor). | Consolidate and extend those two; do not add a third module. The consolidated helper must also cover PC-4's router case, which neither does today. (VF-8) |
| PC-9 | F3 gate: `rg -n "supabase" src` must be zero | **240 matches in 20 files.** Six non-test modules import `@/legacy-supabase/server`, one of them on the authorization hot path. A test exists specifically to block deletion, and the documented exit criteria are unmet. | Restate the gate as Instruction §4.3 actually words it: **no new Supabase import, and none reachable from a route component**. (VF-7) |
| PC-10 | Create `src/lib/status-labels.ts` as the single status mapping (B7) | The file is absent (correct), but `status-badge.tsx` already holds `STATUS_STYLES` with 30 keys, and its `replace(/_/g," ")` label fallback is duplicated at ~29 sites in 20 files. | Create it, but wire `StatusBadge` to consume it, or the two maps drift. (VF-8 / Libraries) |

---

## Session log

Two lines per step: what changed, what was learned.

### 2026-08-27

- **A0** — Scaffolded `docs/frontend-revision/` on `feat/clientops-frontend-revision`; copied Instruction and plan verbatim; ignored screenshots and un-ignored baseline logs. Learned the repo is a planning/app split: the app lives in `YNWAforever/ui-delight-maker`, cloned fresh, and `bun install --frozen-lockfile` is clean at 726 packages.
- **A2** — Captured all gates. Learned `bun run build` is not a pure build: it migrates and verifies schema first and dies without `DATABASE_URL`, so bundle evidence came from `bunx vite build`. Marked `done-with-dependency` because the before screenshots need credentials this environment does not have (G-3).
- **A2 correction** — BF-1 is a Windows-only test bug, not a product defect: the fixture exemption compares a `resolve()` path against a forward-slash literal, so it never fires here. CI is ubuntu-latest and green. Learned not to trust a red local gate as evidence of a real defect.
- **A1** — Wrote `repo-map.md` from ten parallel readers plus a verification pass, then re-checked the load-bearing claims by hand. Learned the plan is wrong in ten places (PC-1..PC-10); the two that matter most are that `useMutation` does not exist anywhere in this codebase, and that nine routes load outside the query cache so `invalidateQueries` cannot refresh them.
- **A3/A4/A5** — Seven auditors classified every control on all 35 routes, then an eighth attacked the results. 217 findings: 91 REAL, 57 READ-ONLY, 27 UNAVAILABLE, 21 REMOVED, and 169 of them fixable in the frontend. Learned that the adversarial pass earns its keep: it overturned my own VF-3 framing, found four controls written off as needing backend work that already have live server functions, and caught /quotes Archive locally deleting a row and toasting success.
