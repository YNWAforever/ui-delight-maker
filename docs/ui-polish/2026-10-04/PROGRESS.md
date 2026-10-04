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
| 13 | Foundations: font, type, radius, elevation, input/accent/sidebar tokens, focus outline | UX-21, UX-22, UX-25, UX-39 | |
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
| next | feat(today): give accounting's landing page something to triage by | UX-15 | new today-job-sheet-list 2, app-sidebar 8/8 (Today vs Revenue Desk), dashboard landing + revenue desk; tsc clean |

## Resume notes (keep current)

- Last commit: UX-10 (see log). The log's `next` row is always the latest commit; replace it
  with the hash at the start of the next commit.
- Next: item 13 (foundations: D-6 font after the Neon Auth import with CJK fallbacks, type scale, radius 8 px, elevation, --input, calm --accent, sidebar active bar, D-3 global :focus-visible outline). Then item 14.
- Tooling note: `node -` heredoc scripts on this machine drop a backslash from `\x` escapes inside template literals (evalTypeScript); build regexes with String.fromCharCode(92) or edit with the Edit tool, and re-read regex lines after writing.
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

- 2026-10-05 UI-only run (`bunx vitest run src/components src/routes src/lib src/hooks`, no database): 1,678/1,683. Four failures were 5 s timeouts under 197 parallel files (touchpoint-logger-ai, campaigns create, clients create, leads bulk preview) and pass in isolation (43/43); the fifth is the untracked pre-existing `route-catalogue-import.test.ts`. Authoritative run is Phase 4's `bun run test` against a disposable database.

- Focused tests: `bunx vitest run <files>` (component tests need `// @vitest-environment jsdom`).
- Full suite needs a disposable database: local Docker image `pgvector/pgvector:pg17` (matches CI),
  `DATABASE_TEST_URL=postgres://clientops:clientops@127.0.0.1:<port>/clientops_test`.
- UAT capture harness and scripts live outside the repo (session scratchpad); UAT role sessions
  expire 2026-10-06 ~18:57 HKT.
