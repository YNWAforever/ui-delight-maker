# Backend Dependencies

One entry per gap that stops the frontend telling the truth. Template per execution plan §11.5.

**This register is deliberately short.** Of 217 integrity findings, 169 are frontend-owned and only 12 need backend work — and the audit demoted several candidates that looked like backend gaps but were not. Those demotions are recorded at the bottom, because a dependency filed against work that is already possible is worse than no entry at all: it parks a fixable defect behind an imaginary blocker.

---

### BD-1: Existing quotes carry no account link

- **Affected routes:** `/quotes`, `/quotes/$id`, `/quotes/new`, `/accounts/$id` (Commercial tab)
- **What is missing:** data repair, not schema. `quotes.account_id` **exists and is canonical** — added in `neon/migrations/003_client_relationship_360.sql:105`, FK-constrained at `:143`, re-asserted in `004:13`, indexed at `004:33`, and joined by every consumer. Nothing anywhere matches quotes to accounts by company name. What is missing is a backfill of rows already written with `account_id = NULL`.
- **Why the UI cannot be truthful without it:** Account 360's Commercial tab counts quotes with `select count(*) from quotes where account_id = $1`. Every quote created through the product to date has `account_id = NULL`, because the wizard never sent the column. So an account with quotes reports zero, and the page is not wrong about the query — it is wrong about the data.
- **UI state implemented meanwhile:** the forward path is fixed in this branch (C5 sets `account_id` on create; C6 surfaces and allows correcting the link), so new quotes link correctly. Historic rows stay unlinked until backfilled, and Account 360 shows the real count rather than inventing one.
- **Proposed backend change:** a one-off backfill deriving `account_id` from `clients.account_id` / `leads.account_id`. No migration — the column, constraint and index all exist. Risk: low; a `NULL`-only update with an obvious dry-run.
- **Integrity finding IDs:** IF-C2-14, IF-C2-30

> **Note against the source Instruction.** Instruction §9.5 and plan §2.4/§12 assume this column is *absent* and prescribe a "Not linked" state plus a name-matched count shown separately. That premise is wrong (PROGRESS.md PC-11). Building the prescribed UI would have made a write-path bug look like a permanent schema limitation.

---

### BD-2: Revenue Desk timeline summary has no server path

- **Affected routes:** `/`
- **What is missing:** any server function that summarises a lead's timeline. `src/server-functions/` was searched exhaustively; `ai-note-tidy.ts` exports only `tidyTouchpointNote` and `isAiNoteTidyAvailable`, which tidy a single note and are not a timeline summary.
- **Why the UI cannot be truthful without it:** the control sat on the pipeline's lead card and produced a toast. Nothing was summarised.
- **UI state implemented meanwhile:** UNAVAILABLE — disabled with a plain reason. Never a success toast.
- **Proposed backend change:** a read-only summariser over the existing activity log, dispatched like the other n8n agents so it inherits their capability check and audit trail. No migration.
- **Integrity finding IDs:** IF-C1-01

---

### BD-3: AI Ops runtime controls are not enforced anywhere

- **Affected routes:** `/agents`, `/agents/$name`, `/settings`
- **What is missing:** the whole enforcement chain — a versioned policy store, server-side dispatch enforcement, capability checks on policy writes, an audit log, rollback, and runtime telemetry. There is no agent-config table in `neon/migrations/` at all; `status` and `human_approval` come from the code-defined `AGENT_DEFINITIONS` catalogue.
- **Why the UI cannot be truthful without it:** the enable/pause switches, auto-execute toggle, temperature and confidence-threshold sliders changed React state only. One toasted `"Agent enabled"`. Worse, `/agents/$name` rendered its "Status" row *from that local state*, so flipping a switch that did nothing visibly changed the status the page reported.
- **UI state implemented meanwhile:** READ-ONLY displays of the catalogue values, with the standard sentence: "Configuration is read-only until runtime policy enforcement is enabled."
- **Proposed backend change:** substantial and explicitly out of scope for a frontend revision. Requires a migration. Should be scoped as its own project.
- **Integrity finding IDs:** IF-E1-04 and the `/agents/$name` config-tab findings
- **Priority note:** these controls are the ones most likely to be mistaken for working, because they look and feel exactly like real ones.

---

### BD-4: Agent long-term memory is not persisted

- **Affected routes:** `/agents/$name` (Memory tab)
- **What is missing:** persistence, a retention policy, access controls, and deletion/audit behaviour.
- **Why the UI cannot be truthful without it:** the tab is a URL-addressable destination whose entire body says memory is not yet persisted — an empty room with a signpost.
- **UI state implemented meanwhile:** a read-only explanation naming what is required before it becomes real, per Instruction §9.22. The tab trigger itself is a candidate for removal, since a navigable tab with nothing in it is what §16 calls "coming soon presented as active navigation".
- **Proposed backend change:** requires a migration and a data-retention decision. Out of scope.
- **Integrity finding IDs:** M-1

---

### BD-5: Lead CSV import has no server path

- **Affected routes:** `/leads`
- **What is missing:** a lead-import validate/commit pair. `createLead` exists, but nothing validates or commits a batch.
- **Why the UI cannot be truthful without it:** the button toasted that import was "mocked in this prototype".
- **UI state implemented meanwhile:** UNAVAILABLE with a reason.
- **Proposed backend change:** small and well-precedented — the repository already ships this exact two-phase pattern twice (`validateClientImportRows`/`commitClientImportFn` and `validateEventImportRowsFn`/`commitEventImportFn`, with server-side dedupe). This is a mirror of an existing module, not a new design. No migration.
- **Integrity finding IDs:** IF-C1-10 … IF-C1-15

---

### BD-6: Approvals cannot be assigned to a reviewer

- **Affected routes:** `/approvals`
- **What is missing:** an assignment server function. `src/server-functions/approvals.ts` exports only `getApprovals` and `decideApproval`.
- **Why the UI cannot be truthful without it:** the bulk-assign control had no write path; the code said so in a comment.
- **UI state implemented meanwhile:** removed rather than disabled — an assignment control that can never work misleads more than its absence does.
- **Proposed backend change:** additive; an `assignApproval` mutation plus the capability to guard it. Whether a migration is needed depends on whether an assignee column already exists — to be confirmed.
- **Integrity finding IDs:** IF-C3-05

---

### BD-7: Future report families

- **Affected routes:** `/reports`
- **What is missing:** read models for forecast accuracy, campaign attribution, gross margin, renewal and expansion, AI cost per outcome, human-review workload, and AI quality and latency.
- **Why the UI cannot be truthful without it:** each would be an empty chart claiming a measurement nobody is taking.
- **UI state implemented meanwhile:** none of them appear. They are documented here rather than shipped as visible empty reports, per Instruction §9.23.
- **Proposed backend change:** one read model per family, sized individually. Several need no migration; AI cost and latency need run-level telemetry that does not exist yet (see BD-3).
- **Integrity finding IDs:** —

---

### BD-8: Projects has no Neon-backed route or permissions

- **Affected routes:** none — it stays out of navigation
- **What is missing:** the route, its read model, and its capability rules. `src/server/repositories/projects.ts` still reads from the legacy Supabase database.
- **Why the UI cannot be truthful without it:** Instruction §6.1 is explicit that Projects must not appear in navigation until a real Neon-backed route and permissions exist.
- **UI state implemented meanwhile:** absent from navigation, as required.
- **Proposed backend change:** part of the Supabase-to-Neon migration already tracked in `src/legacy-supabase/README.md`. Out of scope.
- **Integrity finding IDs:** —

---

## Demoted candidates — filed as backend work, but not

Each of these looked like a dependency and is not. Recording them stops a future reader re-filing them.

| Candidate | Why it is not a backend dependency |
|---|---|
| `/quotes/new` **Save draft** | `createQuote` is already imported and called in the same file, and the repository hard-codes `status='draft'` on insert. Save draft is the existing submit path minus the approval call. Pure frontend wiring. |
| `/quotes` **Duplicate** | Needs no new server function. `CreateQuoteInput` already accepts every field required, and `parent_quote_id` is settable through `updateQuote` — both exported and capability-checked. |
| `/settings` **Team tab** (invite / role / remove) | `inviteUsers`, `changeAdminUserRoleFn`, `suspendAdminUserFn` and `deactivateAdminUserWithReassignmentFn` all exist and are already called by `/admin/people`; a finished invite dialog exists. The correct treatment is removal as a duplicate surface with a link to Admin — Instruction §9.24 forbids duplicating Admin — not a backend ask. |
| Contact and account editing | Thirteen server functions are exported, capability-checked and wired to **nothing**: `updateClientContact`, `createAccountContact`, `updateAccountContact`, `createAccount`, `updateAccount`, `updateCampaign`, `addCampaignMember`, and six admin-user functions. `/clients/$id` ships Add and Remove contact but no Edit, though `updateClientContact` exists. These are missing controls over live server paths. |
