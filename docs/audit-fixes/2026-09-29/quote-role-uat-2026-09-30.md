# Quote role UAT — 2026-09-30

## Environment and source

Dedicated [UAT](https://clientops-uat-20260930.vercel.app), Neon project `polished-forest-15724329`, empty-origin branch `br-solitary-butterfly-b3883kwo`, independent Auth and seven distinct session identities. No production data or customer/provider messages.
Tested source `4b5f94a924712353ecf0d035603a33679a12e91b`; deployment `dpl_2oHm744qiYsbm9rA9VdPeyAatxkq`.

## Executed action boundaries

| Role | Issue on approved synthetic QT-DEMO-002 |
|---|---|
| super_admin | enabled |
| admin | enabled |
| manager | disabled |
| sales | disabled |
| client_success | disabled |
| accounting | disabled |
| read_only | disabled |

Admin scoped issue deny disables both issue controls. A temporary sales scoped issue allow enables them. All temporary overrides revoked. [Nine sanitized cases](evidence/quote-actions-2026-09-30.json).
[Before deny](evidence/quote-issue-deny-before-2026-09-30.png), [after deny](evidence/quote-admin-issue-scoped-deny-after-2026-09-30.png). Before the fix, clicking the incorrectly enabled control produced a serialized Forbidden response despite HTTP 200; quote status and version stayed unchanged.

Real isolated PostgreSQL action tests additionally cover matching deny over allow, expired/revoked grants, grant specificity and manager ownership. UI tests cover missing capabilities failing closed and draft edit/submission permissions. Role baselines and mutation guards unchanged.

## Quote journey remains open

Sales created synthetic quote `b469d269-522f-4c55-9dbc-7f6d81b1d504` through the UI: owner `demo-sales-user`, HKD 200.50 (2 × 100.25), correct account/lead. Subsequent Save & Request Approval failed with **Invalid input**. Captured real request shows persisted line-item metadata (quote_id, dates, computed total and additional fields) sent to the strict five-field commercial validator. No approval or lifecycle advancement is accepted. Fix this input projection next, then resume manager claim/approve → authorized issue → accounting version acceptance → billing and rollback checks.

This is partial U03/U04/U06 evidence, not full quote/accounting acceptance. Historical anomaly provenance, legacy snapshots, provider sandbox, runtime before/after and release gates remain open.
