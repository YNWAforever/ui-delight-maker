# R10 worker / provider acceptance contract

**External acceptance blocked.** No independent worker/provider execution scope, cost ceiling, owner-approved cases or scoring thresholds were provided for this candidate. No paid call, customer message, cloud import or activation was performed. All 120 proposed cases are blocked; none are approved/executed/passed. Source tests are separate evidence.

## Version and receipt binding

See [provider acceptance](evidence/provider-acceptance.json) for five actual local workflow hashes, common output contract hash, app code SHA and required receipt fields. Local source hashes do not prove deployed worker versions.

| Path | Invocation identity | Actual external evidence required |
|---|---|---|
| qualify_lead | run + lead + workflow + attempt | worker execution, deployed/source hash, provider request/model/usage, callback receipt |
| draft_reply | run + lead + workflow + attempt | same; draft only, no customer delivery claim |
| draft_quote | run + lead + workflow + attempt | same; trusted pricing, currency and server-computed total |
| score_renewal_risk | run + engagement + workflow + attempt | same; unknown dispatch outcome reconciled before any new attempt |
| relationship_intelligence | run + account + workflow + attempt | same; verified source facts only |
| note_tidy | invocation + command receipt + actor | app SHA + direct provider receipt/model/usage; worker hash and n8n callback N/A |

An HTTP 200/accepted webhook proves only the particular transport response. Agent completion requires a correctly bound, validated and durably committed callback. The five templates use a response node; actual native n8n version/timing/timeout and its response semantics remain **not-tested**. Sweep batch completion means every candidate has a recorded local outcome, including failed/ambiguous; it does not mean all models completed successfully.

Before importing any source, operator records independent project/worker identity, actual native version, callback target isolation, outbound/schedule controls and a finite cost ceiling. Keep schedules and paid dispatch disabled until accepted. Do not copy production credentials, activate cloud n8n, remove production hold or send real customer messages under branch/CI approval.

## Execution matrix

For each of six paths record success, known provider error, timeout, missing key and invalid JSON. For five n8n paths additionally record repeated and late callbacks, wrong subject/workflow/attempt denial, and dispatch >15s remaining unknown without duplicate attempt. For direct Note Tidy record repeated invocation and a response after its deadline. Closing a local run must prevent late commercial writes. Real DB state, UI result and provider usage must agree; a toast or confidence is not acceptance.

Every attempt records started/finished timestamps, isolated target labels, app SHA, model actually returned (nullable), transport receipt, actual usage/cost (nullable), and safe callback/command receipt references. Keep sensitive originals in controlled storage and publish only deidentified references. Unknown usage/cost is null, never a manufactured zero.

## Owner cases and scoring

[Proposed synthetic cases](evidence/provider-cases.proposed.json) contain 20 distinct fixed cases for each of six features: 120 unique IDs. They are evaluator fact envelopes, not already seeded CRM invocation requests. Owner must approve/replace facts and expected outcomes, map them to isolated CRM fixtures, freeze actual prompt/template/model versions and approve the rubric **before** execution. [Case results](evidence/provider-case-results.csv) leaves actual outcome, model, usage, cost, receipts and reviewers empty/not-tested.

Proposed hard gates: zero invented budgets, zero unapproved promises, zero wrong currencies; all schema/authorization/commercial negative cases pass. D03: 2×100 / supplied total1 rejects the entire output and creates zero quotes/approvals; correct total200 alone may proceed through existing authorization/transaction gates. Owner still must define fact-consistency and human-acceptance thresholds. Do not retrospectively lower thresholds or treat 120 cases as general accuracy.

## Immutable historical evidence

Original ZIP, VM harness and 20-pass/12-fail baseline remain unchanged. A new byte-identical harness copy exits1 at its historical arithmetic check because it assumes an invalid quote remains present for repair; D03 now rejects that whole output. That old assumption is not the release gate. Independent native regressions retain the 20 provider key guards and verify the accepted D03 contract. They are synthetic source execution, **not actual n8n/provider acceptance**.

## Owners / next actions / rollback

- Business owner: approve 20 cases per feature and objective rubric/thresholds.
- Provider/worker operator: approve sandbox/cost ceiling, verify deployed hashes/native response semantics, provide per-attempt receipts.
- QA: execute on the exact independent candidate and record genuine roles/UI/negative commercial cases.
- Release owner: keep NO-GO until these and data/runtime/performance/operator gates are resolved.

Rollback preparation: stop new dispatch, preserve histories/receipts, deploy compatible Neon-only source under separate release authority. Do not resend ambiguous outcomes or restore Supabase. This acceptance pack changes documentation only.
