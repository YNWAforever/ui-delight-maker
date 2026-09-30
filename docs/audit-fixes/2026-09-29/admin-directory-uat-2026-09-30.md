# R03 / U10 Admin directory and invitation — 2026-09-30

## Actual baseline and partial acceptance

Independent UAT source `a18aa46273b10edc9cc75dbb11188ad9d49c98e6`; genuine admin identity matched the server Auth session. A disposable fixture contained 250 active and 50 deactivated synthetic profiles. The fixture was removed by exact IDs in cleanup; no real account role changed. No valid invitation or provider message was submitted.

- Admin invitation initial email focus, 22 Tab / 9 Shift+Tab focus containment, Escape close and trigger focus return passed. Invalid email showed an error without an invitation POST.
- The actual 250th eligible profile loaded through pages 50/100/150/200/250, was selected, and its name survived another search and an empty search. [Picker screen](evidence/r03-admin-picker250-a18aa46-2026-09-30.png).
- The 390px dialog fitted and its submit control/focus return were reachable. [Screen](evidence/r03-admin-invite390-a18aa46-2026-09-30.png).
- At 768px the underlying People document measured **800px** against a **768px** viewport: actual overflow FAIL. The run stopped there; super_admin and later widths were not reached. [Failed partial run](evidence/r03-admin-partial-failed-a18aa46-2026-09-30.json), [diagnostic](evidence/r03-admin-768-before-a18aa46-2026-09-30.json), [before screen](evidence/r03-admin-768-before-a18aa46-2026-09-30.png).
- An earlier attempt failed its first focus assertion before recording a role result. Its cause was not established and it remains incomplete/success=false. [Retained first attempt](evidence/r03-admin-incomplete-first-a18aa46-2026-09-30.json).

## Narrow source correction

The app sidebar and Admin rail leave 288px at viewport 768px. The People grid started its two-column layout at md while requiring a 320px detail column. Move the existing grid breakpoint to xl: directory and selected-person detail stack at tablet widths; wide screens retain the 20rem side detail. Existing detail visibility and all directory, selection, role and mutation controls remain present.

26 existing meaningful Admin/dialog/directory/URL/route tests passed across five files. TypeScript, touched-file ESLint, pure `bunx vite build` client/SSR and bundle budgets passed. No migration or seed was run for this local source build. Fixed-SHA hosted verification at 390/768/1024/1280/1440px and genuine admin/super_admin is pending.

The ongoing 5,000-row R05 lifecycle is bound to a18aa46; leave that dedicated deployment and operation intact until the run finishes. This layout candidate can be reviewed and CI-tested while the full hosted Admin recapture waits.

## Remaining acceptance and delivery

U10 remains incomplete for manager/read_only eligibility, team partial results, reassignment audit and scope denials. U15 remains incomplete for the full journeys, actual 200% browser zoom and a screen reader. No viewport/CSS scaling is counted as browser zoom. This partial 250th-picker proof does not accept those gates.

The candidate is source-only; rollback is a source revert. No schema/data reconciliation is needed for the breakpoint change. Retain all durable import receipts and keys. Production release stays NO-GO; no promotion, production DB connection or customer/provider message occurred.

## Exact candidate follow-up: second layout failure

Source `89f487dbe6d9143980d92cee18cd016a98b49dd3`, PR #137, passed exact-source CI Checks36707320661 and Database contract36707320561, including migration/seed replay. A separate actual production SSR browser used real loopback PostgreSQL and the same seven own identities through independent Auth. Its adapter kept GET/HEAD-only and blocked POST405. No remote UAT deployment was changed; the ongoing import continues at a18aa46.

The 250th-picker/focus and 390/768px checks passed, confirming the first fix, but **1024px still failed**. Independent diagnostics after exact fixture cleanup measured document1375px at viewport1024px, originating from an870.8px table. The directory table was selected from viewport width despite narrower available content beside the two navigation rails. At1280px the table also extended under the detail rail even when the document itself fitted. [Failed local run](evidence/r03-admin-local1024-failed-89f487d-2026-09-30.json), [diagnostic](evidence/r03-admin-local-widths-89f487d-2026-09-30.json), [screen](evidence/r03-admin-local1024-before-89f487d-2026-09-30.png). This is not a hosted acceptance PASS.

The follow-up opts only People into a CSS container breakpoint: the existing full-record cards remain until the list itself has56rem; wider space shows the existing table. The table wrapper retains horizontal access for exceptional long values. Other viewport-breakpoint consumers keep their existing behavior. Shared row destinations, actions and selection remain unchanged. Fixed-source local and hosted browser recapture, static gates and final-head CI are pending; PR remains draft.
