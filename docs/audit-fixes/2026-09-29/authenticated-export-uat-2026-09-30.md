# R05 / U16 authenticated exports
## Actual before / remaining UI defect
Dedicated detached source0075e198a84e2ea8d1c3a04638dcc11a69db2e96; independent synthetic DB/Auth, genuine own accounting/SA/admin/read_only identities. [Retained actual run](evidence/r05-export-before-0075e19-2026-09-30.json).

- Accounting actual browser report download: UTF8 BOM, all seven formula-shaped client text fields escaped, numeric **-12.5 and100.25** remain machine-readable.
- OwnSA and admin actual Admin audit page CSV download: precisely seven filtered rows, seven escaped action fields, visible page-only label/hint.
- Ownread_only has no audit export control; captured exact authenticated export **GET** is Forbidden with no audit IDs leaked.
- Matching effective audit.export deny on ownSA leaves role-only Export offered. Exact real GET correctly refuses, no IDs leaked. Run stays success=false for this UI defect. [Deny screen](evidence/r05-audit-effective-deny-before.png).
- Exact synthetic business fixtures cleaned;14 synthetic append-only audit rows from two observer runs intentionally retained, immutable trigger kept enabled. Temporary deny revoked. No real audit/prod record edited.

Initial observer import path was one level too high (noDB operation); subsequent run incorrectly waited for POST although actual export uses GET (report passed; Admin download saved before observer timeout). Retained failures are not accepted product runs. Correct observer captures the actual method/URL/body and uses the actor's own cookies for the denied request.

## Actual spreadsheet behavior
[Both exact downloaded CSVs](evidence/r05-actual-downloads-before-0075e19.zip), [SHA256/byte manifest](evidence/r05-actual-downloads-before-0075e19.sha256.json), [report screen](evidence/r05-accounting-report-before.png), [Admin screen](evidence/r05-admin-export-before.png).

Actual LibreOffice CLI imports both real downloaded files with formula evaluation enabled, standard numeric recognition and no forced text-column formats. Its XLSX cell records contain **14 literal text cells, zero formulas**, and report numeric-12.5/100.25. A harmless unescaped=1+1 CSV control is an actual formula with cached result2. [Cell evidence](evidence/r05-export-calc-2026-09-30.json). Token13 enables evaluation per [official CSV filter documentation](https://help.libreoffice.org/latest/en-GB/text/shared/guide/csv_params.html). LibreOffice normalizes embeddedCR toLF; seven separate text cells verified, original downloaded CSV bytes retained.

Actual Microsoft Excel isolated hidden instance opened both downloadedCSV read-only with automation macros disabled.14textcells have HasFormula=false; negative/decimal values are Double. UnescapedcontrolHasFormula=true/value2. Workbooks closed without saving and owninstance quit. [Excel evidence](evidence/r05-export-excel-2026-09-30.json).

CSV output/application-display acceptance is independent of the misleading effective-deny control. Wider U14 currency/HK-midnight periods and the remaining R05 Client/Event/inventory/retention gates remain open.

## Narrow correction / source gates
Admin audit now reads the existing server-evaluated shell audit.export capability; absent snapshot fails closed, active deny hides Export and effective allow retains it. The authoritative export GET independently rechecks authorization. No new permission, CSV writer, aggregation, server function, schema, data or dependency behavior.

Three valid route behavior regressions failed before fix;61affected cases green. Earlier test scaffolds omitted real queryOptions/SectionHeader exports; those observer fixture failures were repaired before the valid red run. Fresh isolated actualPostgres **2,313 tests / zero skipped / zero todo**,315files, passes. Types/touchedESLint/pureVite client+SSR/bundles/diff pass. Fixed-source hosted recapture and exact-head CI follow; wholeU16/release PASS not inferred.

The exact downloads contain required CRLF plus embedded CR in quoted text. They are archived without altering bytes; no whitespace gate exemption is introduced. The first staged diff correctly flagged mixed-newline CSVs as trailing whitespace, so binary ZIP plus SHA256 manifest preserves this evidence exactly.

## Fixed-source hosted acceptance
**176c770c2b318dbf2f0288833b442637d706027e**, dedicated detached **dpl_J9nYAcZNCx9QrJzVM2iRqtd9NVhR**, independent DB/Auth. Stable UAT remainsa18aa46 and real productionbed941b. [Safe deployment metadata](evidence/export-detached-deployment-176c770-2026-09-30.json).

Actual own accountingreport, ownSA/admin auditfiltered7rows and reader GET refusal pass again. Matching ownSA effective deny now hides Export; real exact GET refuses with no audit IDs. Ownread_only with separate explicit audit.view+audit.export grants downloads the seven filtered safe rows using its ownAuth session; revoke both grants/reload removes Export and refuses exactGET again. [Full seven-case proof](evidence/r05-export-after-176c770-2026-09-30.json), [effective deny](evidence/r05-export-after-audit-effective-deny.png), [reader effective allow](evidence/r05-export-after-audit-reader-effective-allow.png). Synthetic business fixtures cleaned, appended synthetic auditfixtures retained and all temporary grants revoked.

CSV writer and report aggregation are byte-for-byte unchanged; real downloaded files retain the existing seven safety prefixes and numeric values. Earlier actual LibreOffice/Excel validation therefore accepts the unchanged export serialization/application behavior. U16 authenticated report/Admin export and spreadsheet safety **PASS in isolation**. General currency/HK-midnightU14 and Client/Event/inventory/retention/broader role/release gates remain open.

Source Checks36724505438 / DB36724505437 all green: fresh isolated CI contract **2,313tests/0skipped**, two-run migration/seed replay, browser collector, types/lint/Vite/bundles/Vercel. The GH CLI cached partial setup-only job logs; direct fresh job-log download verifies the explicit2313/0skips gate. No test/log gate waived.
