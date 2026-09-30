# Lead owner display — 2026-10-01 HKT

## Reproduction and source correction

Own sales at protected detached source `8691421` sees **Owner / demo-sales-user** on its scoped synthetic Lead, although the actual profile name is **UAT sales**. [Actual before result](evidence/lead-owner-before-8691421-2026-10-01.json), [before screen](evidence/lead-owner-before-8691421-2026-10-01.png). This blocks the owner-name requirement in U02.

The existing authorized Lead workspace query now joins the assigned profile's primary key and returns only its trimmed display name. It preserves the text profile ID and includes inactive historical owners without changing assignment. The UI shows the current name, **Name unavailable** for an assigned owner with no usable name, or **Unassigned**. No raw-ID fallback, directory request, permission widening, new endpoint or migration.

## Local positive regression evidence

Nine new cases: six run actual repository SQL on temporary PostgreSQL tables, including the 250th text-ID profile, changed/inactive name, blank name, orphan assignment, unassigned Lead and missing Lead; three render named/unavailable/unassigned UI. These are separate from genuine hosted-role Auth evidence.

Before correction: **7 failed / 11 passed** across the two affected suites. After: **18 passed**. Fresh dedicated disposable PostgreSQL 17.10 full suite: **2,334 passed / 317 files / zero skipped or todo**, 342.70 seconds actual suite runtime. TypeScript, changed-file ESLint, pure `bunx vite build`, route/login bundle gate and diff check pass. No local migration/seed build wrapper was run.

## Remaining acceptance

Source commit `5568af93c817305a33499ab6f4cabd52380410c5` and its exact-source CI pass 2,334 tests / zero skipped, isolated migration/seed replay, Types/lint/browser/Vercel. [Gate proof](evidence/lead-owner-source-gates-5568af9-2026-10-01.json). Protected detached source matches `/api/build`; original stable import source and actual production stay unchanged.

[Eight actual hosted cases](evidence/lead-owner-eight-cases-5568af9-2026-10-01.json) PASS. Seven real Auth identities and own cookie sets are distinct. Six authorized roles display **UAT sales**, with the joined name present in their authorized SSR response; accounting retains its Lead denial without Lead/owner payload. A matching sales `leads.view` deny rejects the actual browser workspace GET without owner/name payload and removes the Owner UI. Business Lead is unchanged and temporary denies are revoked. [Sales](evidence/lead-owner-sales-5568af9-2026-10-01.png), [reader](evidence/lead-owner-read_only-5568af9-2026-10-01.png), [accounting](evidence/lead-owner-accounting-5568af9-2026-10-01.png), [matched deny](evidence/lead-owner-sales-deny-5568af9-2026-10-01.png).

Initial direct replay through APIRequestContext returned plain transport 403 because it omitted browser same-origin headers; this was not an authorization-policy result. The corrected observer freezes the verified workspace GET and uses actual browser fetch. Initial attempts remain private; no permission exception was introduced. [Same-Lead U02](sales-day-uat-2026-10-01.md) has six actual executed steps; its final unnumbered related Quote link is now independently reproduced empty and awaits a separate repair. U02 remains pending. Production remains unchanged and release NO-GO. Legacy snapshots, historical anomaly provenance, provider sandbox/callback receipts, screen reader and operator/PITR remain independent gates.
