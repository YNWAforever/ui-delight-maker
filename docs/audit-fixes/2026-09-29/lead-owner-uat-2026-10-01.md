# Lead owner display — 2026-10-01 HKT

## Reproduction and source correction

Own sales at protected detached source `8691421` sees **Owner / demo-sales-user** on its scoped synthetic Lead, although the actual profile name is **UAT sales**. [Actual before result](evidence/lead-owner-before-8691421-2026-10-01.json), [before screen](evidence/lead-owner-before-8691421-2026-10-01.png). This blocks the owner-name requirement in U02.

The existing authorized Lead workspace query now joins the assigned profile's primary key and returns only its trimmed display name. It preserves the text profile ID and includes inactive historical owners without changing assignment. The UI shows the current name, **Name unavailable** for an assigned owner with no usable name, or **Unassigned**. No raw-ID fallback, directory request, permission widening, new endpoint or migration.

## Local positive regression evidence

Nine new cases: six run actual repository SQL on temporary PostgreSQL tables, including the 250th text-ID profile, changed/inactive name, blank name, orphan assignment, unassigned Lead and missing Lead; three render named/unavailable/unassigned UI. These are separate from genuine hosted-role Auth evidence.

Before correction: **7 failed / 11 passed** across the two affected suites. After: **18 passed**. Fresh dedicated disposable PostgreSQL 17.10 full suite: **2,334 passed / 317 files / zero skipped or todo**, 342.70 seconds actual suite runtime. TypeScript, changed-file ESLint, pure `bunx vite build`, route/login bundle gate and diff check pass. No local migration/seed build wrapper was run.

## Remaining acceptance

Exact-source protected candidate and actual own-role browser/GET recapture are pending. U02's complete same-Lead follow-up, Task and draft Quote approval handoff remain pending. Production remains unchanged and release NO-GO. Legacy snapshots, historical anomaly provenance, provider sandbox/callback receipts, screen reader and operator/PITR remain independent gates.
