# Unnumbered related Quote link — 2026-10-01 HKT

## Actual reproduction and correction

[Own sales readonly reproduction](evidence/unnumbered-quote-before-5568af9-2026-10-01.json) confirms a pending unnumbered Quote's Lead-tab anchor has no text or aria-label. It blocks the last navigation step in [U02](sales-day-uat-2026-10-01.md).

The existing link now uses the existing Quote list's trimmed number / **Untitled quote** wording. Its persisted Quote ID, target, amount and status remain unchanged. No new API, query, permission, assignment or migration.

Two positive UI cases verify numbered and unnumbered links have an accessible name and point to the persisted Quote. Valid before: **1 failed / 13 passed**. After: **14 passed**. An initial CRLF-sensitive test-fixture edit ran zero tests and is retained separately; it was corrected before counting valid red evidence. The unsupported Testing Library exact option was removed after TypeScript rejected it; final focused behavior and TypeScript pass.

Fresh dedicated isolated PostgreSQL 17.10 full suite: **2,336 tests / 317 files / zero skipped or todo**, actual 313.56-second suite duration. Final focused cases, app TypeScript, changed lint, pure Vite build, route/login bundle gate and diff check PASS. [Exact-source isolated deployment](evidence/quote-link-detached-deployment-0376f5c-2026-10-01.json) and [complete eleven-case U02](sales-day-uat-2026-10-01.md) PASS. Sales, manager and read_only use their own Auth sessions to focus and press Enter on the visible Untitled quote link; each reaches the original persisted Quote. Reader approval POST returns a serialized authorization error without business/receipt changes; manager retains the same one pending handoff. [Source CI and local gates](evidence/quote-link-source-gates-0376f5c-2026-10-01.json) PASS; final documentation-head CI is still required before merge. No production operation; release NO-GO.
