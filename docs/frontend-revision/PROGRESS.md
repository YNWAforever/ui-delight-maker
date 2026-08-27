# Frontend Revision — Progress

**Branch:** `feat/clientops-frontend-revision`
**Plan:** [execution-plan.md](./execution-plan.md) · **Instruction:** [master-instruction.md](./master-instruction.md)
**Release rule:** Draft PR + Vercel preview only. No merge to `main`, no production promotion, until a human explicitly approves.

Legend: `[ ]` not started · `[x]` done · `[~]` done-with-dependency (see [backend-dependencies.md](./backend-dependencies.md))

---

## Phase A — Onboarding and audit

- [ ] **A0** — Workspace setup
- [ ] **A1** — Repository onboarding and repo map
- [ ] **A2** — Baseline gates and before-state capture
- [ ] **A3** — Route/function parity map
- [ ] **A4** — Control integrity inventory
- [ ] **A5** — Shared pattern inventory
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
- [ ] **C7** — Quote PDF `/quotes/$id/pdf`
- [ ] **C8** — Approvals `/approvals`
- [ ] **C9** — Job Sheets list `/job-sheets`
- [ ] **C10** — Job Sheet detail `/job-sheets/$id`

## Phase D — Relationship and retention workflows

- [ ] **D1** — Accounts list `/accounts`
- [ ] **D2** — Account 360 `/accounts/$id` (XL)
- [ ] **D3** — Active Clients list `/clients`
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
- [ ] **E6** — Admin alignment `/admin/*` (7 routes)

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

| # | Plan says | Repository reality | Resolution |
|---|---|---|---|

---

## Session log

Two lines per step: what changed, what was learned.
