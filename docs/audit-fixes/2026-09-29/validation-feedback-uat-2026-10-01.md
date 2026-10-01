# CO-30 safe field feedback — 2026-10-01

## Baseline and actual defect

[PR151](https://github.com/YNWAforever/ui-delight-maker/pull/151) merged final0cfdbcb to main271095d at2026-10-01T04:27:28Z. Final-head and post-main required checks pass2,414/323/zero-skipped PostgreSQL tests plus migration/seed replay, types/lint and browser collection. [Merge proof](evidence/pr151-merge-2026-10-01.json). [Production hold](evidence/production-hold-after-151-2026-10-01.json) cancels its attempt; public source remainsbed941b. No production DB operation.

Actual own Sales Task form on source879 rejects an impossible date before Task/audit writes and retains the draft. The real default server-function Error transport removes custom fieldErrors and only displays Invalid input; no offending field is shown. [Hosted characterization](evidence/task-field-error-before-879911b-2026-10-01.json), [screenshot](evidence/task-field-error-before-879911b-2026-10-01.png).

## Focused change and safety

Strict schemas, money/date bounds, authorization and writes stay authoritative. The parser error message now contains up to three application-owned field labels, plus a bounded human row number for import rows, portions or quote line items. It carries no submitted value, unknown field name, custom Zod message, SQL or connection detail. The original machine field paths remain on the server error. The existing default Error transport and safe display helper are unchanged. No migration, provider action or new role grant.

## Local verification

Ten corrected positive/non-disclosure cases are observed RED on the merged baseline and GREEN after the repair; existing validation/error regressions total46/46. The first portion fixture omitted required name and used the old wrong quote-line field; corrected to the actual schema, then allten assertions were rerun on the saved baseline before accepting the implementation. The failed fixture and failed shell-quoting attempt are retained privately and are not product defect evidence. Formatting and touched lint PASS; whole TypeScript PASS.

The initial all-directory local lint traversed retained private candidate archives. Its exact own process was verified and stopped; no tracked file was excluded. The first narrow replacement still found old private R06/zoom diagnostics outside uat. Git confirms the entire .clientops-perf tree is untracked; the final invocation excludes that private tree and includes every tracked source file. These retained diagnostic style failures are not application regressions; remote CI remains unchanged. Tracked-source lint (zero errors/one existing Fast Refresh warning), pure Vite/bundles and whole TypeScript PASS. Fresh full isolated PG clientops_validation_feedback_final_20261001_1236 passes **2,424 tests /324 files /zero failed, skipped or todo** in461,516ms. [Actual full proof](evidence/validation-feedback-full-local-2026-10-01.json). Source7dc40fd is published in [draft PR152](https://github.com/YNWAforever/ui-delight-maker/pull/152); protected exact-source hosted form recapture and final-head CI are still pending. Those exact-source acceptance gates now pass as recorded below; final documentation-head checks remain required.

## Release and rollback

Rollback is a compatible source revert; original Tasks, financial state, audits and durable receipts are retained. Provider/legacy snapshots/four historical dispositions/retention operator/PITR/screen-reader gates remain separate. Release NO-GO. This local fix is not production deployed.

## Exact source7dc40fd acceptance

[Exact-source CI](evidence/pr152-source-ci-7dc40fd-2026-10-01.json) passes2,424/324/zero-skipped PostgreSQL, migration/seed replay, types/lint/browser collection. [Protected isolated candidate](evidence/validation-feedback-detached-7dc40fd-2026-10-01.json) and [seven own live session bindings](evidence/validation-feedback-seven-bindings-7dc40fd-2026-10-01.json) match exact source. The identity check is separate from workflow acceptance.

[Five actual native cases](evidence/validation-feedback-hosted-7dc40fd-2026-10-01.json) PASS: own Sales impossible date, excessive Title and Description name their field without echoing the value; the draft and original Tasks/audits remain unchanged. Corrected form creates exactly one new synthetic Task and supported search/reload agrees, preserving all original Tasks. Reader valid-payload POST denies independently. [Actual date feedback](evidence/validation-feedback-sales-date-7dc40fd-2026-10-01.png).

[Three real server-boundary cases](evidence/validation-feedback-boundaries-7dc40fd-2026-10-01.json) PASS: own Sales invalid quote currency, own Accounting invalid invoice date and own Manager invalid approval decision return fixed safe labels, echo no malformed value and leave all original Quotes/versions/Sheets/portions/approvals/audits/receipts unchanged. These are actual Error-transport/non-write checks from previous captured form wire, not native UI feedback or business-state acceptance.

The defined CO30 runtime validation/locatable-feedback finding now passes its source/local/real DB/hosted criteria. Final documentation-head CI and merge remain pending. Release NO-GO; no production deployment, schema mutation or provider/customer message. Focused author self-review verifies the allowlisted labels, three-field/row bounds, Error transport, existing machine fields and unchanged strict authorization/writes; no agents used.
