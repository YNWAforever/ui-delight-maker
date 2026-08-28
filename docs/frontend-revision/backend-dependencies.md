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
- **Backfill script:** `neon/backfill-quote-account-ids.mjs` (design: `docs/superpowers/specs/2026-08-28-quote-account-backfill-design.md`). It copies the account already recorded on the quote's own client or lead — client wins over lead, matching `linkedRecord` and `resolveLinkedQuoteVisibility`. It **never infers an account from a company name**; a quote whose client and lead both lack an account stays `NULL` and is reported as unresolvable, with the reason, so the underlying link can be fixed by hand.
- **How to run it.** It dry-runs by default and prints the blast radius; `--apply` is the only way to write.

  ```bash
  # 1. Dry run. Writes nothing, exits 0, prints counts, the reasons rows are unresolvable,
  #    and a sample of up to ten rows it would change.
  DATABASE_URL=... node neon/backfill-quote-account-ids.mjs

  # 2. Apply, after reading the dry run.
  DATABASE_URL=... node neon/backfill-quote-account-ids.mjs --apply
  ```

  The UPDATE runs in a transaction and is guarded by `account_id is null`, so it is idempotent — a second run is a no-op — and it never re-points a quote that already has an account.

> **BD-1 stays open.** The backfill script ships in this branch; it has **not** been run against the production database. Running it is the repository owner's action, after reading a dry run. This entry closes when that has happened, not when the code merged.

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

### BD-9: The quotes list read returns rows, not a searchable or summable result set

- **Affected routes:** `/quotes`
- **What is missing:** three things on `listQuotesPage` (`src/server/repositories/quotes.ts:129`): a text-search filter, a join to `leads.company_name` / `clients.company_name`, and aggregates over the whole filtered set rather than the page.
- **Why the UI cannot be truthful without it:** the search box can only ever narrow the fifty rows the loader returned, so it cannot find a quote on page three; the list can show *that* a quote belongs to a lead or a client but not *which company*; and the value tiles can only sum the loaded page. `status` needed none of this — it was already a filter on the repository and now reaches it — which is what makes the remaining three genuinely server-side.
- **UI state implemented meanwhile:** the search box is labelled "Filter this page by quote number" and matches the number only; the fabricated Lead and Created-by columns are replaced by a "Linked record" link and a real `created_at`; the money tiles carry the hint "this page" and are grouped per currency instead of being stamped HKD. Nothing claims a workspace-wide number it does not have.
- **Proposed backend change:** additive filters plus two left joins on the existing list query, and a sibling aggregate read grouped by `currency`. No migration.
- **Integrity finding IDs:** IF-C2-04, IF-C2-05, IF-C2-06, IF-C2-07

---

### BD-10: Approval requests carry no assignee and no routing rule

- **Affected routes:** `/quotes/new`, `/quotes/$id`
- **What is missing:** `requestQuoteApproval` (`src/server-functions/quotes.ts:123`) accepts `{ id }` and only flips the status to `pending_approval`. It never sees the discount or the total, and it never writes `human_approvals.assigned_to` — a column that already exists (`neon/migrations/001:138`).
- **Why the UI cannot be truthful without it:** the builder offered an Approver Select whose value was silently discarded, and a Pricing-rules card promising that discounts over 10% go to a manager and quotes over HKD 400K go to a director. Both quotes go to the same queue.
- **UI state implemented meanwhile:** the Approver Select is removed rather than left as a control that writes nothing, and the pricing card is restated as guidance with an explicit line saying routing is not automated.
- **Proposed backend change:** accept an optional assignee on `requestQuoteApproval` and persist it; separately, decide whether threshold routing is a product rule worth encoding. No migration for the assignee.
- **Integrity finding IDs:** IF-C2-13, IF-C2-16

---

### BD-11: A lead-linked quote is unopenable by a role that may see quotes but not leads

- **Affected routes:** `/quotes` (every row link), `/quotes/$id`, `/quotes/$id_/pdf`
- **What is missing:** graceful degradation in `authorizeLinkedQuoteParties` (`src/server-functions/quote-workspace.ts:100-117`). It requires `leads.view` whenever `quote.lead_id` is set, and `accounting` holds `quotes.view` without `leads.view` (`src/lib/admin/policy.ts:122-135`), so every lead-linked row on a list that role is allowed to see throws into an error boundary.
- **Why the UI cannot be truthful without it:** the list is allowed to show the row, and the row's own link is a dead end.
- **UI state implemented meanwhile:** **none, deliberately.** The two frontend options both do harm. Omitting the lead block client-side is not available — that is a server-side capability change, and this branch may not weaken one. Hiding lead-linked rows from roles whose *baseline* lacks `leads.view` would hide real data from anyone holding a `permission_overrides` allow for it, which the client cannot see. The row link is therefore left intact and the route-level `errorComponent` now renders a sanitized `ErrorState` instead of the root boundary's raw `error.message`.
- **Proposed backend change:** make the linked-party check degrade — omit the lead block from the read for an actor without `leads.view` — rather than throwing. That is a deliberate authorization decision and needs the owner's sign-off, per plan §0.6.
- **Integrity finding IDs:** IF-C2-09

---

### BD-12: The client cannot know what the signed-in user is actually allowed to do

- **Affected routes:** every route that would like to gate a control — surfaced here by `/quotes` and `/quotes/new`
- **What is missing:** an effective-capability set on the app-shell read. `AppShellRead` (`src/server/app-shell/loaders.ts:5`) carries `profile.role`, and `ROLE_GRANTS` is importable client-side, but `permission_overrides` is read only inside `loadAuthorizationContext` on the server. So the client knows the role baseline and nothing about individual grants or denials.
- **Why the UI cannot be truthful without it:** `quotes.create` is granted to manager, sales, admin and super_admin, so `client_success`, `accounting` and `read_only` could fill in the whole five-step builder and only learn at Submit. But disabling the control from `ROLE_GRANTS` alone would lock out a user who has been granted an exception, which is a worse failure than the one it fixes.
- **UI state implemented meanwhile:** an advisory, not a gate. `/quotes/new` states plainly that creating quotes is not part of the reader's role and that saving will be refused unless they hold an exception; every control stays enabled and the server remains the only thing that decides.
- **Proposed backend change:** return the actor's resolved capability set from `getAppShellRead`, computed by the same `evaluateAuthorization` the server already runs, so UI gating and server enforcement cannot disagree. No migration.
- **Integrity finding IDs:** IF-C2-08

---

## Demoted candidates — filed as backend work, but not

Each of these looked like a dependency and is not. Recording them stops a future reader re-filing them.

| Candidate | Why it is not a backend dependency |
|---|---|
| `/quotes/new` **Save draft** | `createQuote` is already imported and called in the same file, and the repository hard-codes `status='draft'` on insert. Save draft is the existing submit path minus the approval call. Pure frontend wiring. |
| `/quotes` **Duplicate** | Needs no new server function. `CreateQuoteInput` already accepts every field required, and `parent_quote_id` is settable through `updateQuote` — both exported and capability-checked. |
| `/settings` **Team tab** (invite / role / remove) | `inviteUsers`, `changeAdminUserRoleFn`, `suspendAdminUserFn` and `deactivateAdminUserWithReassignmentFn` all exist and are already called by `/admin/people`; a finished invite dialog exists. The correct treatment is removal as a duplicate surface with a link to Admin — Instruction §9.24 forbids duplicating Admin — not a backend ask. |
| Contact and account editing | Thirteen server functions are exported, capability-checked and wired to **nothing**: `updateClientContact`, `createAccountContact`, `updateAccountContact`, `createAccount`, `updateAccount`, `updateCampaign`, `addCampaignMember`, and six admin-user functions. `/clients/$id` ships Add and Remove contact but no Edit, though `updateClientContact` exists. These are missing controls over live server paths. |
