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

## Corrected exact-source local browser acceptance

Source **eaedb659b6aac4559114299c717faa46fb6a436e**: all33 focused tests, types, touched lint, pure Vite and the actual performance:bundles gate pass. Exact-source Checks36708989497 / Database contract36708989440 are successful; full contract count is verified from its log before final delivery. The earlier lint-format issue and nonexistent script invocation were corrected, with no threshold or assertion changes.

Actual production SSR + real loopback PostgreSQL passed all six widths **390/768/1024/1280/1440/1920px**. Existing cards are visible at the first five; the table is visible at1920 when its own available width is sufficient. No document overflow; dialog submit remains reachable and Escape restores trigger focus. Own admin and own super_admin each passed initial email focus, Tab/Shift+Tab containment, invalid-input error without invitation POST. The250th eligible profile still loads/selects and retains its name. Exact synthetic fixture IDs were cleaned;10000Task/100000Approval counts and aggregate versions remained unchanged. [Actual local result](evidence/r03-admin-local-pass-eaedb65-2026-09-30.json), [768px after](evidence/r03-admin768-local-after-eaedb65-2026-09-30.png), [1024px after](evidence/r03-admin1024-local-after-eaedb65-2026-09-30.png), [1920px table](evidence/r03-admin1920-local-after-eaedb65-2026-09-30.png).

Actual **200% native browser zoom** used the official [Chrome tabs.setZoom API](https://developer.chrome.com/docs/extensions/reference/api/tabs#method-setZoom) inside a fresh disposable extension/browser profile, following the [Playwright extension workflow](https://playwright.dev/docs/chrome-extensions). tabs.getZoom returned2, automatic/per-tab mode; unchanged native window reflowed CSS viewport1424→712 and DPR1→2. No CSS zoom, device-scale emulation or pinch scale was used. Anonymous sign-in retained exactly one main and keyboard skip/Enter focused main-content. Own admin invitation fitted, trapped Tab, exposed submit and returned focus on Escape. [Raw proof](evidence/r03-native-zoom-local-pass-eaedb65-2026-09-30.json), [public native200](evidence/r03-public-native200-local-eaedb65-2026-09-30.png), [Admin native200](evidence/r03-admin-native200-local-eaedb65-2026-09-30.png).

The first native-zoom run passed DOM/browser factor checks but the Playwright screenshot observer cropped the native viewport; those private artifacts are retained. Recapture uses CDP captureScreenshot for the full native surface and adds explicit dialog bounds. Neither screenshot scaling nor a resized viewport is substituted for the native zoom test.

Hosted recapture uses a separate candidate URL on the same independent UAT project/DB/Auth. CLI53.3.0 --skip-domain disables automatic domain promotion. The original stable UAT URL remains bound to a18aa46 for the ongoing5000Lead run; verify both build SHAs before and after. No real production project configuration is changed. Screen-reader and full U10/U15 role/team/reassignment/journey gates remain open.

## Hosted source acceptance / final review checkpoint

Dedicated candidate deployment **dpl_6jEgB9pxFCjuTdPASWb2xiSXyYFZ**, project **prj_jlIsv7mLYGpZR4XEV4njX05jAZYJ**, exact source **eaedb659b6aac4559114299c717faa46fb6a436e**, independent Neon DB/Auth. --skip-domain left the stable import URL serving a18aa46; real production public endpoint still serves bed941b. Provider target production refers only to this synthetic UAT project. [Safe deployment/binding metadata](evidence/r03-dedicated-deployment-eaedb65-2026-09-30.json).

Vercel MCP temporary-access tool returned an internal error. Plain fetch correctly reached deployment protection, and the initial URL parser selected a team alias rather than the specific Production URL; corrected before any acceptance run. Authorized [Vercel CLI curl](https://vercel.com/docs/cli/curl) retrieved candidate-only machine access and a private HttpOnly cookie. Its first response was a redirect; following it returned the exact source SHA. No deployment-protection setting was disabled. This credential covers the hosting access layer; ClientOps admin/SA still independently match their own real Auth identities and own role cookies. Cookies/credentials remain Git-ignored and unprinted.

All six actual hosted widths **390/768/1024/1280/1440/1920px PASS**, correct card/table surfaces, no document overflow, reachable submit and Escape focus return. Own admin and own super_admin passed initial/Tab/Shift+Tab/invalid-input checks. The250th eligible profile and off-search selection/name retention passed again against the isolated Neon fixture. No valid invitations/POST or new invitation rows; all300 exact synthetic profile IDs cleaned. [Full scoped hosted result](evidence/r03-admin-hosted-pass-eaedb65-2026-09-30.json), [picker](evidence/r03-admin-picker250-hosted-eaedb65-2026-09-30.png), [1024px](evidence/r03-admin1024-hosted-after-eaedb65-2026-09-30.png), [1920px table](evidence/r03-admin1920-hosted-after-eaedb65-2026-09-30.png).

Hosted **native200%** anonymous skip/main and own-admin invitation fit/focus/submit/Escape PASS: Chrome factor2, automatic/per-tab mode, actual reflow1424→712, DPR1→2, no emulated/CSS/pinch scale. [Raw result](evidence/r03-native-zoom-hosted-pass-eaedb65-2026-09-30.json), [public screen](evidence/r03-public-native200-hosted-eaedb65-2026-09-30.png), [Admin screen](evidence/r03-admin-native200-hosted-eaedb65-2026-09-30.png). Screen reader remains not verified; full U10/U15 other-role/team/reassignment/business-journey gates stay open.

Source CI Checks36708989497 / Database contract36708989440 passes **2,294 real PostgreSQL tests / zero skipped**, two-run isolated migration/seed replay, browser collector, types/lint/Vite/bundles/Vercel. Documentation/screenshots follow without further application-source edits. Exact final documentation head must pass every required check before #137 merges. Rollback is a source revert; no schema change, data reset, production promotion or provider message.
