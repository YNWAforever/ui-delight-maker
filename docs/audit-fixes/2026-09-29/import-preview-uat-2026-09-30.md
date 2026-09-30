# R05 import preview and hydration — 2026-09-30

## Reproduced on independent UAT

Source `53dc62f8a19e4a2449c9e445651bbeb43bd3158b`, own genuine sales session; isolated app/Neon DB/Auth binding checked before each attempt. The 5,000 synthetic Lead rows contain a BOM, Chinese, CRLF, quoted multiline text, distinct source IDs with the same name, invalid email/owner, skip, identical/conflicting duplicates and a missing explicit target.

- First upload selected an SSR file control before its change handler was attached: no preview POST and a 360-second observer timeout. This is not a server runtime measurement.
- After waiting for hydration, the actual preview POST returned **HTTP 504 at 301,568ms**; complete UI elapsed 301,795ms, generic error alert. No commit was issued and synthetic business rows remained zero.
- [Unhydrated failed observation](evidence/r05-import-unhydrated-before-53dc62f-2026-09-30.json) and [actual 504 observation](evidence/r05-import504-before-53dc62f-2026-09-30.json) remain success=false. These failed probes originally exited zero when no exception was thrown; that harness exit behavior is corrected. Neither is a passing release gate.

## Source correction

The existing import panel is mounted through TanStack ClientOnly. SSR presents an accessible loading status; the CSV picker is offered after its handler attaches. Three SSR cases first failed, then all four component cases passed (three kinds plus immediate hydrated upload without commit).

Production preview now loads request-local lookup sets/maps once for owners, active products, source/type-scoped identities, company/contact ambiguity, existing event attendees and target versions. SQL retains its previous case/trim matching rules. Parameterized batched queries, at most five independent lookups then a dependent version lookup, replace thousands of round trips. CSV order, record/source line, validation precedence and duplicate hashing remain unchanged.

The cache is discarded after this request. applyRow still reads the current actor/role/status, target ownership, effective permissions, identity mapping and row version inside the existing transaction/locks. Existing 20-row chunks, worker limit, leases, expiry, savepoints, receipt owner and idempotency key are retained. No migration, provider, dependency or grant change.

## Real PostgreSQL verification

The new mixed 5,000-row production-adapter test observed **9,992 lookup queries before** versus at most three after for this input. This is an executed SQL count, not a runtime formula. Ready 4,994 / invalid 2 / skipped 2 / ambiguous 1 / stale 1; all 5,000 record indexes and multiline source line retained; zero Lead writes at preview.

All three kinds compare batch versus independent single-row database matching, including uppercase UUIDs/emails, explicit targets, mapped identities, disagreement, missing targets/products/owners, skip, namespace separation and event-specific target semantics. A separate case changes an owner after preview: a fresh preview detects it and commit returns stale with no business write.

Focused 21 cases pass against actual loopback PostgreSQL (production handlers, concurrency, rollback, idempotency, resume and UI hydration). Full fresh database, exact-SHA hosted upload lifecycle, runtime and final-head CI are pending; this is **not full U09 PASS**.

## Delivery and release

PR #135 merged at `f378fdf0f7c726238dabc03516fd6477d07612a6` after final-head Checks 36693744669 / DB 36693744842 (2,282 tests, zero skipped). Post-main Checks 36694591177 / DB 36694591172 passed. [Production metadata](evidence/production-hold-after-135-2026-09-30.json) confirms the hold, canceled merge attempt, and unchanged public build bed941b. No production promotion or business data operation.

All 30 CO and 16 UAT rows remain tracked. Full Lead/Client/Event lifecycle, download authorization/encoding, retention dry run, source inventory, broader bulk/risk/admin/accessibility UAT, legacy/provider/anomaly/operator gates remain open. Rollback uses the previous dedicated UAT app; keep durable import receipts/identity mappings and never reset business versions.

Full-suite first run: 2,270 passed / 21 failed because two pre-existing route mocks replaced the router without ClientOnly. Both now retain the real export; all 25 affected route/hydration UI cases pass. No assertion/skip gate removed. Fresh full rerun pending. The initial implementation run also exposed unexpanded SQL-writing placeholders, corrected before the passing production-adapter run; failed local logs retained privately.

Fresh final source gate: **2,291 real PostgreSQL/full-suite tests / 0 skipped / 0 todo**,313files; TypeScript, full source lint, pure Vite client/SSR and bundle budgets pass. applyRow unchanged from merged main. Hosted exact-source verification and CI remain required.

## Exact-source hosted delta / new recovery defect

PR #136 source d0f451c4cf65fe7e3c3c8e42619e75698904a85c passed Checks36700699589 and DB36700699592: **2,291 / zero skipped**, replay/browser/Vercel. Own seven actual role sessions were independently attested before import.

Same unchanged CSV bytes/hash, app/database/Auth/actor: actual POST **9,698ms / HTTP200**, UI9,956ms; before HTTP504 at301,568ms is a censored failure, not a successful baseline latency. [Actual single pair](evidence/r05-import-preview-runtime-pair-2026-09-30.json), [accepted preview](evidence/r05-import-preview-after-d0f451c-2026-09-30.json), [screen](evidence/r05-import-preview-after-d0f451c-2026-09-30.png). Classification all5,000 correct, zero preview Lead writes. No p95/percentage/SLA inference.

The full lifecycle then forwarded the actual first commit and lost its response: eight synthetic Leads succeeded, saved key survived reload. Receipt reads were interrupted deliberately. Actual UI offered **no Check/Retry** while its receipt was unavailable, yet allowed replacement file input. [Failure](evidence/r05-import-recovery-failed-d0f451c-2026-09-30.json), [screen](evidence/r05-import-recovery-failed-d0f451c-2026-09-30.png). This is a product recovery defect, not merely an observer timeout. The test remains success=false; eight writes/receipt retained, not reset. The pending observer rejection during cleanup is also retained privately.

Three new Lead/Client/Event recovery tests failed for missing Retry. Candidate now initializes saved recovery state before presenting controls, blocks replacement while unresolved, exposes a read-only Retry loading result, and retains the exact saved key. A synthetic change cannot bypass the disabled replacement input. All28 affected UI cases pass. Full fresh DB/static/build and exact-source hosted recovery remain pending; U09 not accepted.

Recovery final local source: **2,294 / zero skipped / zero todo**,313files on fresh real PostgreSQL; types, full source lint, pure Vite and bundles pass. Hosted recapture and final-headCI still required.

## Recovery source acceptance and remaining full U09

Source **a18aa46273b10edc9cc75dbb11188ad9d49c98e6**: exact-source Checks36702543051 / DB36702542944 passed **2,294 / zero skipped**, isolated replay, browser collector and Vercel. Real UAT recovered the **original** d0f451c session after receipt-read interruption, retaining its eight prior writes and exact original key. Retry made no business writes; replacement input remained disabled before/after read. [Accepted original-session recovery](evidence/r05-original-recovery-pass-a18aa46-2026-09-30.json), [blocked-input screen](evidence/r05-original-recovery-blocked-input-a18aa46-2026-09-30.png), [recovered screen](evidence/r05-original-recovered-a18aa46-2026-09-30.png).

A fresh actual5000Lead run at a18aa46 previews all5,000 in9,688msPOST/9,925msUI with correct mixed classifications and no preview writes; [raw preview](evidence/r05-final-preview-a18aa46-2026-09-30.json). Actual loss/reload/key replay and bounded continuation are running. Until its persisted final read, replay, seven-role receipt denials and browser issues download finish, full U09 remains pending. Client/Event lifecycle, source inventory, target-specific retention and other release gates are also open.

The recovery fix has no import-server change from d0f451c. Existing schema/receipt/key remains compatible; rollback to d0f451c restores the demonstrated missing-retry UI defect. Retain all synthetic paused sessions and their keys while investigating, rather than resetting them to obtain a green run.

Final documentation-head CI is still required before merging #136. Source fixes/isolated acceptance do not authorize production promotion. All30CO/16UAT remain tracked and release stays NO-GO.

## Final source merge checkpoint

PR #136 merged at `1b48265d913c82d1d476fe2e701682cd88ff7af4` (2026-09-30 10:56:15Z), after exact final head `f6126d762d66ecfe5cf7a51aaf79424a6deaf88f` passed Checks `36704661537` / DB `36704661510`, **2,294 real PostgreSQL tests / zero skipped**, replay/browser/Vercel. Post-main Checks `36705446703` and DB `36705446706` also passed **2,294 / zero skipped**. [Production hold proof](evidence/production-hold-after-136-2026-09-30.json): canceled merge deployment, public build bed941b unchanged, no promotion. Full U09 lifecycle remains running.

## Full Lead5000 scoped lifecycle acceptance
Source `a18aa46273b10edc9cc75dbb11188ad9d49c98e6` remained fixed from 10:33:38Z to 13:00:57Z. The original stable dedicated UAT URL and exact import key/body were preserved throughout. Actual UI network response loss, interrupted receipt reads during reload, Retry, same-key commit replay and **623 actual bounded Continue actions** completed without reset, changed chunk/workers or gate relaxation.

Final persisted counts: **4,994 succeeded / 2 invalid / 2 skipped / 1 ambiguous / 1 stale = 5,000**; UI completed with5,000/5,000. PostgreSQL confirms4,994 distinct created business IDs, all owned by sales, distinct source namespaces with identical names retained separately, Chinese/multiline preserved and no duplicate business IDs. Same-key terminal replay changes no prior business/receipt rows. Seven independent actual identities/cookie sets are checked: sales owner reads; all six others, including super_admin/admin, are denied receipt read without business-ID leakage.

Actual browser issues download has BOM and exactly four issue rows; skipped rows excluded. [Full raw observations including actual network timings](evidence/r05-lead5000-completed-a18aa46-2026-09-30.json), [completed screen](evidence/r05-lead5000-completed.png), [lost response](evidence/r05-lead5000-lost-response.png), [actual CSV](evidence/r05-lead5000-issues.csv). Earlier failed/paused runs and their original keys remain retained; this does not retrospectively convert them into passing runs.

U09 **Lead lifecycle PASS in isolation**. Client/Event lifecycle, cross-kind import source inventory and target-specific7-day retention remain pending. No full all-kind/U09 or production release claim. No production DB connection, provider/customer message or promotion occurred.
