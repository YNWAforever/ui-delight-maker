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
| 7 | Lead actions and invitable roles gated by capability | UX-07 | |
| 8 | Follow-up task from a lead | UX-10 | |
| 9 | Honest summary strip instead of page-scoped stat cards | UX-09, UX-29 | |
| 10 | Money that fits (quote line items, job sheet) | UX-13, UX-14 | |
| 11 | Approvals split view; admin audit layout and labels | UX-11, UX-12 | |
| 12 | Accounting Today | UX-15 | |
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
| next | fix(ui): show names and labels instead of ids and keys | UX-06 | access-request-queue +1, humanize-key 2, 9 suites 83/83; tsc clean |

## Resume notes (keep current)

- Last commit: UX-06 (see log). The log's `next` row is always the latest commit; replace it
  with the hash at the start of the next commit.
- Next: item 7 (UX-07 gate lead actions in `leads.$id.tsx` with shell capabilities: status Select, New quote, agent triggers; invite role options filtered by actor role in `invite-users-dialog.tsx`). Then items 8–14.
- Working method: one concern per commit; run the focused suites that query changed names
  (`grep -rln "<old name>" src --include=*.test.tsx`), `bunx prettier --write <files>`,
  `bunx eslint <files>`, `bunx tsc --noEmit > log; echo $?` (do not trust exit codes through a
  pipe), commit with a Bash heredoc message ending in the Co-Authored-By line.
- UAT shots and scripts: session scratchpad `uat/` (harness.mjs, capture.mjs, keyboard.mjs,
  cjk.mjs, navtiming.mjs); before-screenshots in `before/` (git-excluded). Run against UAT one
  session at a time — four parallel sessions caused HTTP 500s.

## Verification notes

- Focused tests: `bunx vitest run <files>` (component tests need `// @vitest-environment jsdom`).
- Full suite needs a disposable database: local Docker image `pgvector/pgvector:pg17` (matches CI),
  `DATABASE_TEST_URL=postgres://clientops:clientops@127.0.0.1:<port>/clientops_test`.
- UAT capture harness and scripts live outside the repo (session scratchpad); UAT role sessions
  expire 2026-10-06 ~18:57 HKT.
