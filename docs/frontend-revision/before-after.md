# Before / After

Step F6. What a person using Fimmick ClientOps experienced before this branch, and what changed.

## Product-level summary

**Navigation.** The sidebar grouped pages by when they were built rather than by the lifecycle a relationship moves through. Campaigns sat under Convert although it feeds the top of the funnel; Job Sheets sat there too although it is post-acceptance delivery work. There are now six lifecycle groups — Today, Acquire, Convert, Deliver, Retain & Grow, Operate — plus capability-gated Administration, and the agent control tower is called AI Ops rather than "Agent Monitor".

**Hierarchy.** Two rival page headers had drifted apart: `PageHeader` on 15 routes, `CommandHeader` on 10, zero overlap, and 10 further routes using neither. That split is the mechanical reason the product read as unrelated templates. One `WorkspaceHeader` now serves every route, with a lifecycle context label, one `h1`, one primary action and at most two secondary ones.

**Integrity.** This is the substantial change. 217 controls were audited and given a verdict; the ones that lied were fixed. A user can now trust that a control which looks operational is operational.

**Responsiveness.** Lists switch from table to cards below `md` through shared components rather than per-page markup, using CSS rather than JavaScript width detection so the switch survives SSR.

**Accessibility.** One `h1` per page, `aria-sort` on the `th`, real anchors instead of click handlers on rows, status conveyed as text and not colour alone, focus returned to whatever opened a panel.

**Consistency.** Every workspace composes the same vocabulary: header, metric strip, filter toolbar, record list, attention queue, activity timeline, and one shared set of loading, empty, filtered-empty, permission-denied and error states.

---

## The shell

**Before.** The sidebar's grouping did not match the lifecycle. The page title was capped at 20px. Global search was capped at 448px on a 1440px header. Header icon buttons were 36px. The identity avatar announced two unexplained letters to a screen reader. The global error boundary rendered `error.message` verbatim into the page body — and since most routes had no boundary of their own, that boundary caught almost everything, including raw Neon driver text.

**After.** Lifecycle grouping, a 24–30px page title, search that widens on `lg+`, 40px icon buttons, an avatar hidden from the accessibility tree, and an error boundary that renders a sanitised message while the real one goes to `console.error`.

**Preserved deliberately:** the active-state rule (it was already correct), collapse-to-icon with tooltips, favorites, footer identity and sign-out, and admin gating with its capability-aware first destination.

---

## Acquire — Leads, Campaigns, AI Review

**Before.** The Leads owner filter had exactly one option, so it could never narrow anything; its filter chip and clear-callback were dead code. Import CSV toasted that it was "mocked in this prototype". Bulk assign asked for a pasted UUID, sent an empty string when untouched, and printed the resulting Postgres foreign-key error to the user. Lead detail's notes and comments were local arrays seeded with a hardcoded date, and the entire Files tab was fabricated. "Qualify" and "Generate Quote" toasted success unconditionally — with n8n unconfigured, they announced AI work that had never started. `/campaigns` invalidated nothing when a campaign was created, so a new one was missing from the index for up to 30 seconds.

**After.** The dead filter is gone. Import is disabled with its reason on screen. Bulk assign refuses an empty owner before writing, awaits the write, and keeps failed rows selected so a retry targets exactly them. Fabricated content is removed. Agent triggers report failure when nothing fired. `/campaigns` repaints.

---

## Convert — Quotes, Approvals

**Before.** "Archive" removed the row from the visible table and toasted success — then the next loader run put it back, so the user watched a destructive action succeed and then undo itself. "Duplicate" toasted a "local preview" that persisted nothing. "Save draft" wrote nothing at all, while `createQuote` sat imported and called forty lines below in the same file. "Submit for approval" was the one lifecycle button missing the in-flight guard its siblings had, so a double-click re-entered a lifecycle transition on a financial document — and on the builder, each extra click persisted a second quote **and** a second approval row. Approvals offered a reviewer-assignment control with no server function behind it; the code said so in a comment.

**After.** Archive is removed (no archived state exists in the check constraint). Duplicate is a real two-write action that reports honestly when the copy succeeds but the lineage link fails. Save draft works. Every write takes an in-flight lock. Assignment is disabled with its reason.

**The quote–account link.** The Instruction assumed `quotes.account_id` was missing and prescribed a "Not linked" state with a name-matched count. The column has existed since migration 003 — FK-constrained, indexed, joined by every consumer — and nothing anywhere matches quotes to accounts by name. The defect was that the wizard never sent it, so every quote created through the product was invisible to Account 360. New quotes now link correctly; the backfill of historic rows is [BD-1](./backend-dependencies.md).

---

## Deliver — Job Sheets

**Before.** Irreversible actions — lock, accept — did not name their consequence. Xero-linked billing portions could be edited even though the server rejects it. Server validation errors surfaced as a generic toast rather than beside the field that caused them. Billing progress was shown without a truthful denominator on the list page.

**After.** Lock and accept confirm through a dialog naming the sheet, the locked total and the absence of an undo. Xero-linked portions are read-only with the reason shown. Validation errors render inline against the portion. Billing progress is textual and only where the data supports it.

---

## Retain & Grow — Accounts, Clients, Relationships, Renewals, Tasks

**Before.** `/renewals` could not repaint at all. It loaded through the query cache but rendered loader data with neither `useQuery` nor `useRouter`, while its children refreshed through `invalidateQueries` alone — so a renewal, an ending, a risk-score run or a touchpoint all landed in the database while the screen kept showing the old state. The accounts preview panel displayed "Leads 0 / Open quotes 0 / Open tasks 0" for **every** company, because it was fed literal empty arrays. Account 360 toasted raw `error.message`, leaking capability-check and driver text, and its signal mutations never refreshed the Activity tab where a dismissal is supposed to appear. Client detail offered Add and Remove contact but no Edit, though `updateClientContact` existed and was capability-checked.

**After.** `/renewals` repaints. The preview shows real counts, and says so when the read fails rather than showing zeros. Account 360 sanitises its errors, refreshes Activity, and has a Signals tab. Contact editing is wired on both Account 360 and Client detail.

**One deliberately awkward truth:** the fixture user table resolves no real profile id, so an owned account would have rendered "Unassigned". It now reads "Assigned (name unavailable)" until a profile-name lookup exists. Ugly, but not false.

---

## Operate — AI Ops, Agent detail, Reports, Settings

**Before.** This was the worst area. Enable/pause switches, an auto-execute toggle and two threshold sliders changed React state and nothing else — one of them toasted "Agent enabled". The auto-execute switch's own description promised "When off, all actions go to the approval inbox", a governance guarantee nothing enforced. Compounding it, agent detail rendered its Status row *from that same local state*, so flipping a switch that did nothing visibly changed the status the page reported. A Memory tab was a URL-addressable destination whose entire body said memory was not persisted. Reports offered "Export CSV" that toasted "queued" — there was no queue and no file. Settings duplicated Admin with a Team tab that toasted "mocked", while the real invite, role-change and deactivation functions sat wired on `/admin/people` beside a finished invite dialog.

**After.** Every ungoverned control is read-only or removed, showing the real catalogue value with the sentence "Configuration is read-only until runtime policy enforcement is enabled". Status reads from the catalogue, and a source guard fails the build if those setters return. The Memory tab is removed and its content moved into Governance, naming the six prerequisites. Reports exports a real file through `src/lib/csv.ts` with RFC 4180 quoting — commas, embedded quotes and newlines each unit-tested — labelled for what it actually contains. Settings links to Admin instead of imitating it.

---

## Administration

**Before.** Eight routes with their own conventions, and dangerous actions competing visually with primary ones.

**After.** The shared header, list and badge conventions; dangerous actions visually subordinate and behind confirmations that state the consequence.

**What did not change, and is provable:** `git diff` against baseline for `src/lib/admin/`, `src/server/admin/` and `src/server/auth/` is **empty**, and `requireCapability` across non-test server functions is **213 before and 213 after**. No capability check was removed, loosened or moved client-side.

---

## Behaviours deliberately preserved

- Every server function the routes called at baseline is still reachable — checked by diffing imports and confirming each is invoked, not merely imported.
- Capability enforcement, protected-role rules and management scope: byte-identical.
- The Neon and n8n integrations, and the protected workflow API routes.
- Favorites, admin first-destination resolution, the active-state rule, route ids (including `/quotes/$id_/pdf`, whose underscore is meaningful).
- Charts remain lazy-loaded in their own chunk.

## Screenshots

**None.** No credentials means no authenticated session, so no route renders real data — see [validation-report.md](./validation-report.md) EG-2. `origin/main` is untouched at `5c8590a`, so a true before/after pair is still capturable from a worktree at that commit by anyone with credentials; the matrix is in [qa-responsive.md](./qa-responsive.md).
