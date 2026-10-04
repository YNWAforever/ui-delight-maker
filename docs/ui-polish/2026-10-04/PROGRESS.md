# UI/UX polish — progress

Resume here cold. Read [audit.md](audit.md) (findings UX-01…UX-40) and [direction.md](direction.md)
(tokens, moves, decisions) first.

## Ground rules (from the owner's brief and CLAUDE.md)

- Branch `feat/ui-ux-polish-2026-10` from `origin/main` `bc130de`. Draft PR only; never merge,
  mark ready, force-push or deploy to production.
- Frontend only: no change to authorization, capability checks, server-function contracts,
  repositories, read models, workflow handlers, migrations, seed or data. Server needs go to
  SP-1…SP-4 in the audit.
- Do not hand-edit `src/components/ui/` or `src/routeTree.gen.ts`. `bunx vite build` on Windows
  rewrites `src/routeTree.gen.ts`; restore it with `git checkout -- src/routeTree.gen.ts`.
- No new packages except the approved `@axe-core/playwright` dev dependency (D-4); keep the 24 h
  `minimumReleaseAge` guard. No Supabase, no `bun run build`.
- Dates only through `src/lib/format.ts`. Commits: Conventional Commits, lowercase imperative,
  one concern each, audit IDs in the body.
- `src/lib/__tests__/route-catalogue-import.test.ts` is an untracked file that predates this
  work. Leave it alone and never stage it.

## Owner decisions (2026-10-04)

| ID | Decision |
|---|---|
| D-1 | UAT screenshots stay local (`.git/info/exclude`); the report describes them in text. |
| D-2 | No deploy to the UAT Vercel project. Logged-in "after" screenshots are environment-gated; verify with component tests, axe in jsdom and public pages. |
| D-3 | Focus ring: CSS-only global `:focus-visible` outline; `src/components/ui/` untouched. |
| D-4 | Add `@axe-core/playwright` as a dev dependency. |
| D-5 | Server proposals SP-1…SP-4 are write-ups only. |
| D-6 | Apply Plus Jakarta Sans as the code intends, with Traditional Chinese fallbacks. |

## Phase status

- [x] Phase 1 — audit (`audit.md`)
- [x] Phase 2 — direction (`direction.md`), checkpoint approved
- [ ] Phase 3 — polish (log below)
- [ ] Phase 4 — verification
- [ ] Final report (`report.md` + draft PR)

## Phase 3 plan (order: P0 → P1 → foundations → moves → P2)

| # | Concern | Audit IDs | Status |
|---|---|---|---|
| 1 | Activation links in the invitation result | UX-01 | done (revoke deferred: needs its own confirm UI) |
| 2 | Status tone text tokens readable in both themes | UX-02, UX-04 | done |
| 3 | Permission denials stay inside the app shell; sidebar filtered by capability | UX-03 | done (boundary + sidebar filter) |
| 4 | Navigation progress + focus on route change | UX-08, UX-40 | done (Approvals tab-stop count addressed with UX-11) |
| 5 | Per-row control names from the record, not its id | UX-05 | done (rowLabel on 17 lists; access-request decision controls without ids) |
| 6 | Names instead of identifiers (leads, sidebar role, renewals, access requests) | UX-06 | done for lead subtitle/header, sidebar role, Today status, audit action/target type, access capability/team; renewal owner, requester and audit actor names need SP-2 |
| 7 | Lead actions and invitable roles gated by capability | UX-07 | done |
| 8 | Follow-up task from a lead | UX-10 | done (shared `FollowUpTaskDialog`, gated by `tasks.create`; notes apology removed) |
| 9 | Honest summary strip instead of page-scoped stat cards | UX-09, UX-29 | done: page-scoped strips removed (Leads, Clients, Companies, Campaigns, Tasks, Job Sheets), Revenue Desk on server totals, `MetricStrip` one compact bordered row (no icon chips, sentence-case labels, 2-up below `xl`, tone-fg text) |
| 10 | Money that fits (quote line items, job sheet) | UX-13, UX-14 | done (`QuoteLineItemsView` list below md / table from md; numeric columns never wrap; job sheet handoff panel stacks below 2xl) |
| 11 | Approvals split view; admin audit layout and labels | UX-11, UX-12 | done (Approvals: two-column queue, split from xl, focus to record; Admin: tabs below 2xl, actor picker, IDs wrap; actor/requester names still need SP-2) |
| 12 | Accounting Today | UX-15 | done (job sheet list with client, accepted total, status badge, arrival date; standard header chrome; sidebar link and tab title read "Today" without leads.view) |
| 13 | Foundations: font, type, radius, elevation, input/accent/sidebar tokens, focus outline | UX-21, UX-22, UX-25, UX-39 | done except elevation: the card shadow is in `src/components/ui/card.tsx` (not hand-editable); flattening it needs a shadcn re-sync or call-site classes, deferred |
| 14 | P2 polish: field errors, copy, freshness, lifecycle panel, hydration, file inputs, tablet, pickers, 360 view | UX-16…UX-38 | |

## Commit log

| Commit | Concern | IDs | Tests |
|---|---|---|---|
| `69c2319` | docs: audit, direction, progress | — | — |
| `e999e30` | fix(admin): show activation links after inviting users | UX-01 | invitation-delivery 13, invite dialog +2 (23/23 with admin intent) |
| `9d59899` | fix(ui): make status text readable in both themes | UX-02, UX-04 | new tone-contrast.test.ts (10), status-labels 33; `vite build` emits `text-tone-*-fg` |
| `36ec096` | fix(shell): keep permission denials inside the app shell | UX-03 | route-error-boundary.test.tsx (2), workspace-access.test.ts (8), errors 9, router 2 |
| `491d3f6` | feat(nav): offer only the workspaces the session can open | UX-03 | app-sidebar +2 (16/16 with root boundary); tsc clean |
| `50f0bfe` | feat(shell): show navigation progress and move focus to the new page | UX-08, UX-40 | navigation-feedback 5, router 2, root boundary |
| `6af9f35` | fix(a11y): name row controls by the record, not its id | UX-05 | 7 suites 80/80 (data-table-shell, responsive-record-list, access-request-queue, approvals, job sheets, leads, quotes); tsc clean |
| `49115d6` | fix(ui): show names and labels instead of ids and keys | UX-06 | access-request-queue +1, humanize-key 2, 9 suites 83/83; tsc clean |
| `21828b0` | fix(leads): offer lead actions and invite roles only to those who can use them | UX-07 | lead detail 15/15 (+1 read-only), invite dialog 12/12 (+1); tsc clean |
| `fe30e41` | feat(leads): add a follow-up task from the lead page | UX-10 | new follow-up-task-dialog 3, lead detail 16/16 (+1 gating); tsc clean |
| `b429b08` | fix(ui): stop counting only the loaded page in workspace summaries | UX-09 | 13 route suites 102/102; revenue desk +1 (whole-workspace metrics), campaigns count test updated; tsc clean |
| `a1636fd` | feat(ui): make the workspace summary one compact row | UX-09, UX-29 | metric-strip 13 (+3), sales+admin 24 files 174 (1 timing flake in admin-modal-keyboard under parallel load, passes alone); `vite build` emits the odd-cell span; static render checked at 375/1280 light+dark |
| `63f3f05` | fix(quotes): keep line-item money visible on phones and tablets | UX-13 | new quote-line-items 3; quote detail, quotes row actions; tsc clean |
| `622758a` | fix(job-sheets): stop amounts and billing headers wrapping | UX-14 | data-table-shell +1 (numeric never wraps), job-sheets + quotes 7 files 63/63; tsc clean |
| `83f9ad3` | fix(approvals): fit the desk at laptop width and take focus to the record | UX-11, UX-40 | approvals 27/27 (+2: two-column queue, focus to record region); tsc clean |
| `a4dd150` | test(admin): expect the humanised audit action in the export test | UX-06 | fixes a test broken by `49115d6` and missed by the focused run then |
| `86214f4` | test(campaigns): match the header count's full stop literally | UX-09 | campaigns 1 file |
| `008a4f7` | feat(admin): give admin pages the width and find audit actors by name | UX-12 | admin-shell +1, audit route +2 (picker with users.view, ID fallback without), audit table; tsc clean |
| `5c58123` | feat(today): give accounting's landing page something to triage by | UX-15 | new today-job-sheet-list 2, app-sidebar 8/8 (Today vs Revenue Desk), dashboard landing + revenue desk; tsc clean |
| `7730610` | fix(ui): render the product typeface, with Traditional Chinese fallbacks | UX-39, UX-25 (D-6) | new typeface 3, tone-contrast 10; built CSS served over HTTP in Chromium: body stack starts with Plus Jakarta Sans, latin woff2 loaded, `document.fonts.check` true |
| `1b431d0` | fix(ui): visible field borders, a quiet hover surface and an 8 px radius | UX-21, UX-22 | tone-contrast 15 (+5: input ≥3:1 on card and page in both themes, text on --accent ≥4.5:1, low-chroma light accent) |
| `a98d4eb` | feat(a11y): show keyboard focus everywhere and mark the current page | UX-22, UX-21 (D-3) | new focus-indicator 2 (rules present and unlayered); real Button/Input/SidebarMenuButton rendered with the built CSS and focused by keyboard in Chromium, light and dark: 2 px outline at 2 px offset, active item shows the 3 px bar |
| `7824663` | feat(ui): one page-title and one section-title size | UX-29 (type scale) | workspace-header +1, section-header +1 (11/11); tsc clean |
| `859cc72` | fix(quotes): say how fresh the page is, not when the quote was edited | UX-19 | quote effective actions 7/7 (+1 freshness; useQuery mock now carries dataUpdatedAt like the real hook) |
| `ba9a3e5` | fix(copy): plain words instead of internal vocabulary and apologies | UX-18 | relative-time +1, new pipeline-toolbar 2, approvals 27/27 (reviewer label), 24 related files 223/223; tsc clean |
| `0729a20` | docs(audit): withdraw UX-24, a harness false positive | UX-24 | — |
| `260f479` | test(quotes): give the URL-state test's query mock a fetch time | UX-19 | fixes a test broken by `859cc72`, missed by its focused run |
| `00df917` | fix(ui): status badges in sentence case | UX-30 | status-badge +1, status-labels, admin-status-labels; 19 badge/label/freshness suites 265/265; tsc clean |
| `5b517f5` | test(reports): expect the sentence-case fallback for an unmapped stage | UX-30 | caught by the full UI run |
| `a88c670` | fix(forms): show validation at the field it concerns | UX-16 | access-request-queue 6/6 (rewritten validation test), tasks 4 files 18/18 (+1 title at the field); tsc clean |
| `2c545d3` | fix(approvals): collapse the decided history on phones and tablets | UX-28 | approvals 28/28 (+1 disclosure); tsc clean |
| `ac43b4e` | fix(ui): two lines for long record names instead of a one-line ellipsis | UX-25 | attention-queue +1 (CJK name), renewals; tsc clean |
| next | fix(ui): theme tokens for notification and role-dialog colours | UX-27 | new theme-colour-tokens guard (fails on the old files, passes now); bell + role dialog suites 14/14 |

## Resume notes (keep current)

- Last commit: UX-10 (see log). The log's `next` row is always the latest commit; replace it
  with the hash at the start of the next commit.
- Next: item 14 (P2 polish, highest value first: copy pass incl. "0s from now", sign-out error, "(inline)" label, apologies; quote freshness; badge `capitalize`; field-level errors; CJK two-line clamp). Then Phase 4.
- Tooling note: the Bash tool collapses a doubled backslash to one, even inside a quoted heredoc, so regexes or paths written through it lose escapes. Build them with String.fromCharCode(92), use pathToFileURL for paths, or write files with the Write/Edit tools; re-read regex lines after writing. Token tests read CSS blocks up to the first closing brace, so keep braces out of comments inside them.
- Watch in Phase 4: `src/components/admin/__tests__/admin-modal-keyboard.test.tsx` (role modal Tab containment) failed once when 24 suites ran in parallel and passed alone.
- Cleanup PR candidates (UX-32, not this PR): `getClientPortfolioMetrics`, `getTaskBoardMetrics` (`src/lib/sales-workspace.ts`), `formatAcceptedValueSummary` (`src/lib/job-sheet-editor.ts`) and `getPipelineSummary` (`src/lib/pipeline.ts`) lost their last route callers in the UX-09 commit.
- Working method: one concern per commit; run the focused suites that query changed names
  (`grep -rln "<old name>" src --include=*.test.tsx`), `bunx prettier --write <files>`,
  `bunx eslint <files>`, `bunx tsc --noEmit > log; echo $?` (do not trust exit codes through a
  pipe), commit with a Bash heredoc message ending in the Co-Authored-By line.
- UAT shots and scripts: session scratchpad `uat/` (harness.mjs, capture.mjs, keyboard.mjs,
  cjk.mjs, navtiming.mjs); before-screenshots in `before/` (git-excluded). Run against UAT one
  session at a time — four parallel sessions caused HTTP 500s.

## Verification notes

- 2026-10-05 second full UI run (after UX-30): 1,692/1,704. Real failures were two stale expectations of the old lowercase fallback (`reports.test.ts`, fixed in `5b517f5`; `admin-status-labels.test.ts`, fixed in `00df917`) and the UX-19 mock gap (fixed in `260f479`). The rest were 5 s timeouts under load that pass in isolation (token-gate, job-sheet accept, leads bulk, admin modal keyboard, invite dialog, permission override, queue navigation, admin nested routes) plus the untracked `route-catalogue-import.test.ts`. From here every batch ends with a full UI run.

- 2026-10-05 UI-only run (`bunx vitest run src/components src/routes src/lib src/hooks`, no database): 1,678/1,683. Four failures were 5 s timeouts under 197 parallel files (touchpoint-logger-ai, campaigns create, clients create, leads bulk preview) and pass in isolation (43/43); the fifth is the untracked pre-existing `route-catalogue-import.test.ts`. Authoritative run is Phase 4's `bun run test` against a disposable database.

- Focused tests: `bunx vitest run <files>` (component tests need `// @vitest-environment jsdom`).
- Full suite needs a disposable database: local Docker image `pgvector/pgvector:pg17` (matches CI),
  `DATABASE_TEST_URL=postgres://clientops:clientops@127.0.0.1:<port>/clientops_test`.
- UAT capture harness and scripts live outside the repo (session scratchpad); UAT role sessions
  expire 2026-10-06 ~18:57 HKT.
