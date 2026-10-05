# UI/UX polish — final report (2026-10-05)

Branch `feat/ui-ux-polish-2026-10`, from `origin/main` `bc130de`. Frontend only. Read with
[audit.md](audit.md) (findings UX-01…UX-40), [direction.md](direction.md) (tokens, moves,
decisions) and [PROGRESS.md](PROGRESS.md) (commit-by-commit log).

## Summary

ClientOps now tells the truth about its numbers, keeps people inside the app when the server
says no, and reads cleanly in both themes and at phone, tablet and laptop widths.

- **P0 (2):** both fixed. Activation links are shown and copyable; dark-mode warning text went
  from 1.33:1 to above 9:1.
- **P1 (14):** all fixed. For two of them (UX-06, UX-12) some names need a server read (SP-2).
- **P2 (17):** 8 fixed (UX-23 awaiting confirmation on UAT), 3 partly fixed, 1 withdrawn as a
  false positive, 4 deferred with a reason, 1 proposed as a server change.
- **P3 (7):** 3 fixed, 4 deferred.

Authorization, capability checks, server-function contracts, repositories, read models, workflow
handlers, migrations and data are unchanged. Every capability-based UI change is advisory; the
server still decides.

## What did not happen here, and why

- **No logged-in "after" screenshots of UAT.** Owner decision D-2: this branch is not deployed
  to the UAT project. Logged-in surfaces were checked instead by rendering the real components
  with the production CSS build and invented data, in Chromium, at 375/768/1280/1440 in light
  and dark, with axe (below). These are component renders, not whole pages.
- **Screenshots are not committed.** Decision D-1: the repository is public and the "before"
  set shows UAT data, so `before/` and `after/` stay local (`.git/info/exclude`). This report
  describes them by file name.
- **Public "after" pages, on the branch's Vercel preview.** The preview is behind Vercel
  Authentication; the owner signed in to Vercel in the browser pane (no share link was created).
  `/api/build` on the preview returned `29ac91734578c64469354f9ceff5b39418ccbec5`, this branch's
  HEAD. Read-only: pages were loaded and one Tab was pressed; nothing was typed or submitted.
  - Screenshots (JPEG, local only), each paired with the PNG of the same name in `before/`:
    `after/public-login-{375,768,1280,1440}.jpg`,
    `after/public-login-forgot-password-{375,768,1280,1440}.jpg`, and
    `after/public-login-keyboard-focus-1280.jpg`. The 375 and 768 shots are full resolution;
    the browser pane scales the 1280 and 1440 shots down to 800 px wide.
  - Measured in the page as well: no horizontal overflow at 768 or 1440 on either page, the body
    set in Plus Jakarta Sans with the font loaded, and field borders using the new `--input`
    token.
  - Visible change: the system font (Segoe UI on Windows) becomes Plus Jakarta Sans, field
    borders go from barely visible to clearly drawn, controls use the 6 px radius, and the first
    Tab shows "Skip to main content" with the 2 px focus outline. The sign-in copy ("Sign In",
    "Login", `m@example.com`) is Neon Auth's and unchanged (UX-34, deferred). The round icon at
    the right edge of the preview shots is Vercel's preview toolbar, not the app.

## Changes by journey

Before files are in `before/` (UAT, local only); after files are in `after/components/`
(component renders, local only; names are `<fixture>-<width>-<theme>.png`).

### Arrive and orient (all roles)

| Change | IDs | Before → after |
|---|---|---|
| The product typeface renders, with Traditional Chinese fallbacks (it never had: Neon Auth's `--font-sans` won) | UX-39, UX-25 | every `before/*` (system font) → every `after/components/*` |
| Navigation progress bar after 150 ms, a skeleton of the next page, focus and an announcement on arrival | UX-08, UX-40 | 2–3.6 s of no feedback on UAT → tests `navigation-feedback` (5) |
| Sidebar offers only workspaces the session can read; denials stay inside the shell with a way out | UX-03 | accounting's sidebar links ending on a root error page → tests `app-sidebar`, `route-error-boundary` |
| Keyboard focus outline (2 px, offset 2 px) on every control; current page marked with a bar and weight | UX-22, UX-21 (D-3) | 1 px ring; 1.13:1 active item → `after/components/controls-keyboard-focus-1280-light.png`, `controls-*` |
| Field borders at ≥3:1; hover surface calm instead of blue; 8 px radius | UX-21, UX-22 | `before/*` → `after/components/controls-*` |
| One page-title size (24 px) and one section-title size (15 px); sentence-case context line | UX-29 | `before/super_admin-home-1280.png` → `after/components/revenue-desk-top-1280-light.png` |

### Revenue Desk and lists (sales, manager)

| Change | IDs | Before → after |
|---|---|---|
| Summary shows server totals only (open leads, open tasks, waiting approval, quote value); board-scoped "0 overdue" gone | UX-09 | `before/super_admin-home-1280.png` → `after/components/revenue-desk-top-*` |
| Page-scoped stat cards removed from Leads, Clients, Companies, Campaigns, Tasks, Job Sheets; the list starts under the header | UX-09 | `before/sales-leads-375.png`, `before/read_only-tasks-375.png` (no record visible) → tests |
| The summary strip is one compact bordered row, two cells per row below `xl` | UX-09, UX-29 | ~480 px of cards → ~120 px at 1280 (`revenue-desk-top-1280-*`) |
| Long CJK names wrap to two lines with the full name on hover | UX-25 | `before/cjk-super_admin-home-1280.png` → `revenue-desk-top-375-*` |
| Row controls named by the record ("Select Harbour Beauty Lab"), not a UUID or position | UX-05 | 51 checkboxes named "Select row <uuid>" → tests on 7 suites |
| Names and words instead of ids and keys (lead subtitle, role, Today status, audit action, access request) | UX-06 | tests |
| Lead page offers only actions the session can run; follow-up task from the lead | UX-07, UX-10 | tests `-lead-detail-write-safety`, `follow-up-task-dialog` |
| Tasks search commits after a pause; owner filter hidden while it has no source | UX-17, UX-18 | tests |
| Plain copy: "Updated just now", no internal vocabulary or apologies | UX-18 | tests |

### Quote to cash (sales, accounting)

| Change | IDs | Before → after |
|---|---|---|
| Quote line items as short blocks below `md` with the total always visible; table from `md` | UX-13 | `before/super_admin-quotes-id-375-full.png`, `before/sales-quotes-id-768.png` → `after/components/quote-line-items-375-*`, `-768-*` |
| Quote freshness from fetch time, not edit time ("Out of date" on almost every quote) | UX-19 | test |
| Money columns never wrap; job sheet handoff panel stacks below 2xl | UX-14 | `before/accounting-job-sheets-id-1280.png` → test `data-table-shell` |
| Accounting's Today: client, accepted total, status badge, arrival date; sidebar says "Today" | UX-15 | `before/accounting-home-1280.png` → `after/components/today-job-sheets-*` |

### Decide (manager, admin)

| Change | IDs | Before → after |
|---|---|---|
| Approvals queue in two columns; split view from `xl`; choosing a request takes focus to the record, which stays beside the queue | UX-11, UX-40 | `before/dark-manager-approvals-1280.png`; 131 Tab stops to a decision → tests |
| Decided history collapsed on phones and tablets | UX-28 | `before/super_admin-approvals-375-full.png` (11,056 px) → test |
| Access decisions validate at the field, state the 8-character rule, no error before typing | UX-16 | test |
| Status badges in sentence case, readable in both themes (including solid red in dark) | UX-02, UX-04, UX-30 | `before/*` → `after/components/status-badges-*` |

### Administer (admin, super_admin)

| Change | IDs | Before → after |
|---|---|---|
| Activation links listed with Copy when invitation email is not set up | UX-01 | the links never reached the screen → `after/components/activation-links-*` |
| Invite dialog offers only roles the inviter may grant | UX-07 | test |
| Admin links as tabs below 2xl; audit actor found by name; IDs no longer widen the table | UX-12 | `before/admin-admin-audit-1280.png` (1,452 px wide) → tests |
| Theme tokens for notification and role-dialog colours, with a guard test | UX-27 | test |

## Audit table, updated

| ID | Sev | Status | Where / why |
|---|---|---|---|
| UX-01 | P0 | Fixed | `e999e30`; revoke needs the pending-invitation read (SP-1) |
| UX-02 | P0 | Fixed | `9d59899`, `8db9428` |
| UX-03 | P1 | Fixed | `36ec096`, `491d3f6`, `faf4194` |
| UX-04 | P1 | Fixed | `9d59899` |
| UX-05 | P1 | Fixed | `6af9f35` |
| UX-06 | P1 | Fixed; names for renewal owners, requesters and audit actors are a proposed server change (SP-2) | `49115d6` |
| UX-07 | P1 | Fixed | `21828b0` |
| UX-08 | P1 | Fixed | `50f0bfe` |
| UX-09 | P1 | Fixed | `b429b08`, `a1636fd` |
| UX-10 | P1 | Fixed | `fe30e41`, `9c99f1f` |
| UX-11 | P1 | Fixed | `83f9ad3`, `e5ed9cb` |
| UX-12 | P1 | Fixed; actor names need SP-2 | `008a4f7` |
| UX-13 | P1 | Fixed | `63f3f05` |
| UX-14 | P1 | Fixed | `622758a` |
| UX-15 | P1 | Fixed | `5c58123`, `faf4194` |
| UX-40 | P1 | Fixed | `50f0bfe`, `83f9ad3`, `e5ed9cb` |
| UX-16 | P2 | Partly fixed: access decisions and New task; invite and quote forms keep their current alerts | `a88c670` |
| UX-17 | P2 | Partly fixed: Tasks; Leads, Clients and Campaigns need server search (SP-3) | `e806d97`, `bc4c42b` |
| UX-18 | P2 | Fixed | `ba9a3e5` |
| UX-19 | P2 | Fixed | `859cc72` |
| UX-20 | P2 | Deferred — the lifecycle panel's "disabled with a reason" is a deliberate, tested design; hiding actions is a product call | — |
| UX-21 | P2 | Fixed | `1b431d0`, `a98d4eb` |
| UX-22 | P2 | Fixed | `1b431d0`, `a98d4eb` |
| UX-23 | P2 | Fixed (mechanism reproduced and tested); confirmation on UAT environment-gated (no deploy, D-2) | `79a675e` |
| UX-24 | P2 | Won't fix — withdrawn, harness false positive (see audit "Corrections") | `0729a20` |
| UX-25 | P2 | Fixed | `7730610`, `ac43b4e` |
| UX-26 | P2 | Proposed server change (SP-4, `vercel.json` headers) | — |
| UX-27 | P2 | Partly fixed: raw colours; the hand-rolled admin controls are deferred | `e14d1c4` |
| UX-28 | P2 | Fixed | `2c545d3` |
| UX-39 | P2 | Fixed | `7730610` |
| UX-36 | P2 | Deferred — sidebar collapse state lives in `src/components/ui/sidebar.tsx` and its cookie; the trigger already collapses it | — |
| UX-37 | P2 | Deferred — picker redesign touches ten callers | — |
| UX-38 | P2 | Deferred — account and client 360 layout | — |
| UX-29 | P3 | Fixed | `a1636fd`, `7824663` |
| UX-30 | P3 | Fixed | `00df917` |
| UX-31 | P3 | Deferred (not trivial: child-route search params) | — |
| UX-32 | P3 | Deferred to a separate cleanup PR, per the direction | — |
| UX-33 | P3 | Deferred | — |
| UX-34 | P3 | Deferred (Neon Auth UI copy) | — |
| UX-35 | P3 | Fixed | `5276e1f` |

Elevation (direction token): deferred — the card shadow is in `src/components/ui/card.tsx`.

## Server-side proposals (write-ups only, D-5)

- **SP-1** Pending-invitation read so admins can see, copy, resend or revoke outstanding
  invitations (UX-01 revoke).
- **SP-2** Display names (actor, requester, target person, renewal owner) in the audit,
  access-request and renewal read models (UX-06, UX-12).
- **SP-3** Server-side text search for the leads, clients and campaigns lists (UX-17).
- **SP-4** Security headers in `vercel.json`: CSP starting with `frame-ancestors 'none'`,
  `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin` (UX-26).

## Gates

All at HEAD `8db9428` (the code head; later commits are docs only).

| Gate | How | Result |
|---|---|---|
| `bun run test` | `vitest run --no-file-parallelism --testTimeout=30000` with JSON output, as in CI; `DATABASE_TEST_URL` pointed at a disposable local container from `pgvector/pgvector:pg17` (the CI image) on a loopback port, recreated empty for this run | **PASS** — 375 files, 3,016 tests, 0 failed, **0 skipped**; `scripts/clientops/assert-vitest-no-skips.ts`: "Database contract gate passed: 3016 tests, 0 skipped" |
| `bun run lint` | `eslint .` | **PASS** — 0 errors, 1 warning, the same pre-existing one as the baseline (`data-table-shell.tsx`, react-refresh) |
| `bunx tsc --noEmit` | | **PASS** (exit 0) |
| `bunx vite build` | `src/routeTree.gen.ts` restored after every build | **PASS** — main chunk 653.22 kB (baseline 648.77 kB, +4.45 kB) |
| `git diff --check` | `bc130de..HEAD` and the working tree | **PASS** |
| Coverage | | Not run — needs a coverage package that was not approved |
| `bun run build` | | Not run — forbidden by the brief (it runs migrations and seed) |
| Logged-in "after" on UAT | | **Environment-gated, not run** — no deploy from this branch (D-2) |
| Public "after" on the Vercel preview | `/api/build` = `29ac917`; `/login`, `/login/forgot-password` | **Done** — both pages captured at 375, 768, 1280 and 1440, plus keyboard focus at 1280; no overflow, typeface loaded |

One file was excluded from the test run: `src/lib/__tests__/route-catalogue-import.test.ts` is
an untracked file that predates this work, is not part of the branch, and fails on its own.
Earlier parallel runs (all files at once, not the project's `--no-file-parallelism` script) hit
5-second timeouts under load; every such test passed in isolation and in the gate run above.

## Accessibility and visual checks

- axe 4.13 (`@axe-core/playwright`, dev dependency added under D-4) with the WCAG 2.0/2.1/2.2
  A and AA tags, on six component fixtures rendered with the production CSS: 24 scans (375 and
  1280, light and dark). The first run found one failure — near-white text on the solid red in
  dark mode, 3.25:1 — fixed in `8db9428` with a token test for every solid fill. Final run:
  **0 violations**, with each page checked to carry the theme it was meant to before scanning.
  Automated scans cover roughly a third of WCAG; keyboard paths and focus were checked
  separately below.
- Horizontal overflow: none at 375/768/1280/1440 in either theme for any fixture.
- Keyboard: two Tabs land on the outline button with a `2px solid` outline in `--ring`.
  Approvals: choosing a request moves focus to the record heading (test), removing the 131-stop
  walk measured on UAT.
- Hydration: `StaleDataIndicator` is server-rendered and hydrated in a test with the browser's
  props (refetch on mount, different fetch time) — no mismatch; the previous version fails it.
- Typeface: in Chromium against the built CSS the body's family starts with Plus Jakarta Sans and
  the latin woff2 loads.

## Found and fixed during verification

The self-review of the diff (`engineering:code-review`) and the full test runs found problems in
this branch's own earlier commits; each was fixed in its own commit:

| Commit | What |
|---|---|
| `a4dd150`, `260f479`, `5b517f5`, `86214f4` | Tests broken or weakened by earlier commits (stale expectations, a mock without `dataUpdatedAt`, a regex that lost its escape); the focused runs had missed them. After that, every batch ended with a full UI run. |
| `bc4c42b` | Tasks search: a trailing space was dropped when the trimmed commit came back, so typing continued as "renewalc". |
| `e5ed9cb` | Approvals: focusing the record scrolled a mouse user back to the top; the panel is now sticky and focus does not scroll. |
| `faf4194` | "Go to Revenue Desk" was wrong for sessions whose start page is now "Today". |
| `9c99f1f` | Follow-up title prefill could exceed the 255-character schema limit. |
| `8db9428` | Dark-mode solid red text contrast (axe). |

Accounts and Quotes search had the same trailing-space edge as the Tasks one fixed in
`bc4c42b`. That fix is a separate draft PR, YNWAforever/ui-delight-maker#178, which adds a
shared `useSearchDraft` hook; Tasks moved onto the same hook here in `4f32f09`, with the hook
file identical in both PRs so they merge cleanly in either order.

## Skills

Used: `ecc:react-review`, `ecc:code-review`, `ecc:react-performance`, `ecc:security-review`,
`ecc:click-path-audit`, `ecc:browser-qa`, `design:design-critique`,
`design:accessibility-review`, `ecc:frontend-a11y`, `ecc:design-system`, `design:ux-copy`,
`taste-skill:redesign-skill`, `ecc:frontend-design-direction`, `ecc:make-interfaces-feel-better`,
`ecc:react-patterns`, `ecc:frontend-patterns`, `ecc:verification-loop`, `ecc:react-test`,
`engineering:code-review`.

Unavailable or adapted: `taste-skill:redesign-existing-projects` is not installed (used
`taste-skill:redesign-skill`). Skills that delegate to subagents were applied inline because the
repository's status notes say the owner prohibits subagents. Coverage was not measured: it needs
a coverage package and no new package beyond D-4 was approved.
