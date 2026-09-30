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

## Persisted quote workflow — 2026-09-30 follow-up

Source `1ec7531e9c5cb1e113d6fb8ba1089e6fc8313936`, UAT deployment `dpl_GuYENvNovoL2P4k4cQzrhRzEohCA`. The earlier Save failure is repaired by projecting persisted line items into the strict commercial contract. Fresh isolated PostgreSQL full suite passed **2,234 tests / 0 skipped**; PR #131 exact-head checks, migration/seed replay and preview passed.

[Eleven actual UI/request/database cases](evidence/quote-journey-2026-09-30.json) passed: sales submits approval, manager claims and approves, admin issues immutable HKD 200.50 version, five denied identities cannot issue, accounting accepts and creates exactly one Job Sheet, same-key replay adds no Job Sheet, read_only acceptance is denied without changing state. Auth cookies remain private and distinct.

Quote `b469d269-522f-4c55-9dbc-7f6d81b1d504`; approval `28fa6405-c1c4-45b9-9bdb-080bc1ffd660`; issued version `6f3b6fa4-d5aa-4ae1-a747-7999a99ef694`; accepted snapshot `78b73e88-c73a-4900-bf7a-5d1c3dac0d5d`; Job Sheet `5b559907-919e-4b7e-a825-5ac466b4a06b`. Acceptance creates a distinct accepted snapshot from the issued version; these IDs are not expected to be equal.

[Manager](evidence/quote-manager-approved-no-issue-2026-09-30.png), [issuer](evidence/quote-admin-issued-2026-09-30.png), [accounting](evidence/quote-accounting-accepted-quote-2026-09-30.png). This completes the U03 manager/issuer path; U04 revised-B isolation and U07 billing still require separate checks.

Actual sales Duplicate then exposed a second strict-input error: readback `valid_until` is ISO midnight, while create expects a calendar date. A regression reproduces this mismatch; the client now projects the date portion without timezone conversion or relaxing validation. Date-only, ISO-midnight and null component cases pass; full gate and actual Duplicate retest follow.

### Duplicate correction accepted

Commit `b2bbd435f60439343fb6e536878034b097b5eee0`, dedicated UAT `dpl_52qArfnRNHpMEHLe8jp7kneEDi7D`: real sales Duplicate created draft `1aaf323b-c1b7-4cbf-bc35-d0977c7888f9`, parent linked, HKD 200.50, original calendar date `2026-10-30` preserved. [Actual result](evidence/quote-duplicate-results-2026-09-30.json), [snapshot/date readback](evidence/quote-snapshot-date-readback-2026-09-30.json), [UI](evidence/quote-sales-duplicate-2026-09-30.png). Accepted snapshot explicitly points at issued source and matches its line items and amount.

Fresh local isolated suite and exact-head CI each passed **2,237 tests / 0 skipped**. PR #131 merged at `80ee0505f4a83adee03ea3ed0930351ab77ec998`; main Checks `36661939861` and Database contract `36661939839` passed. Dedicated UAT rollback is `dpl_GuYENvNovoL2P4k4cQzrhRzEohCA`; no schema changes. Production remains held.
