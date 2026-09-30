# U14 Hong Kong date/report — 2026-10-01 HKT

## Source and isolation

Detached candidate `8691421eb79a57e8bb3fdbc4a7e54367d493611f`, deployment `dpl_JCVzK97MveRif6vBPSyD2JydUbZK`, dedicated synthetic Neon/Auth environment. Genuine own accounting identity; actual Chromium contexts use America/Los_Angeles and Pacific/Auckland. [Raw result](evidence/u14-hk-report-8691421-2026-10-01.json). No production connection, customer data, provider messages or migration.

## Actual report and date outcomes

Four cases PASS. The real HK business date is2026-10-01; seven-day inclusive lower bound is2026-09-24T16:00:00Z (HK2026-09-25 00:00). Six retained synthetic report fixtures distinguish HKD100.25 and USD100.25 atHK00:30, HKD7 exactly at midnight, HKD5 one second before, HKD500 sixty days old and HKD700 with missing accepted_at. Their accepted-version snapshots are real persisted synthetic report fixtures; they are not evidence of an actual issuance/acceptance workflow (see U04 for that).

Actual report/CSV deltas are HKD107.25, USD100.25 and unverified+1. The pre-boundary5, old500 and unverified700 are excluded from accepted totals. Updating the old row's metadata leaves its accepted_at/version unchanged and cannot move its accepted period. No FX sum or rounded-away decimal. Both browser zones download exactly identical report rows and display the quote's timestamp as **25 Sept 2026, 00:30**. The observer also verifies the real HK date did not roll during the run. Previous invoice/duplicate calendar-date proofs remain linked in [billing](billing-role-uat-2026-09-30.md) and [quote](quote-role-uat-2026-09-30.md).

[LA report](evidence/u14-report-la-8691421-2026-10-01.png), [Auckland report](evidence/u14-report-auckland-8691421-2026-10-01.png), [LA quote](evidence/u14-quote-midnight-America-Los_Angeles-8691421-2026-10-01.png), [Auckland quote](evidence/u14-quote-midnight-Pacific-Auckland-8691421-2026-10-01.png). Exact downloaded BOM CSVs are archived separately with hashes. Initial pre-hydration download observer failure and a Bun Playwright launch failure are retained privately; the final Node observer waits for actual range interaction before accepting downloads. No product/date/permission gate was weakened.

U14 PASS for this isolated scenario. Historical accepted dates cannot be reconstructed from synthetic fixtures; missing provenance/reconciliation and release remain open.
