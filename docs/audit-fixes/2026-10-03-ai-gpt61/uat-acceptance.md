# R11 exact-candidate UAT acceptance

**Candidate journeys not-tested; external acceptance blocked.** Fresh read-only UAT inventory has seven active persisted identities with seven distinct cookie sets. This does not prove live sessions or journeys. The independent UAT site still serves `3d851c23dc0d1b5aa52cae8f8e51fc68e8ae9c63`, migrations001–022; this AI candidate requires001–025. Authenticated mutation tests against an unverified default PR preview are excluded. No candidate was provisioned/deployed/migrated to that independent target in this request.

Each role must use its own identity and session: super_admin, admin, manager, sales, client_success, accounting, read_only. No super_admin cookie file is copied. Keep configs/session cookies in controlled local storage; do not paste, commit or put secrets in command-line arguments. QA records actual allowed/denied decisions and row ownership against server capabilities/overrides, rather than guessing them from role names.

| Case | Journey / required facts | Code evidence | Exact candidate acceptance |
|---|---|---|---|
| UC-01 | legacy/new workflow identity, specific run, unknown/restricted subject | R01/R07 SQL + loader/component | not-tested |
| UC-02 | 59:59 /60:00 created_at; updated_at independent | R01 real PG/R08 expiry | not-tested |
| UC-03 | explicit HKD1000 and unknown budget, manual follow-up | R03 schema/native/physical writeback | blocked: real provider + role journey |
| UC-04 |2×100 total200; supplied1 rejects entire output/zero writes; issue remains separate | R03 physical transaction/native negative contracts | blocked: pricing/provider/commercial owner + role journey |
| UC-05 | actual provider envelope/model/usage, missing remains unknown | R02 physical binding; R10 source guards | blocked: worker/provider receipts |
| UC-06 | pending/escalated context, manual handoff/issue, cancel no write, terminal immutable | existing + R07 Review tests | not-tested |
| UC-07 | local recovery receipt, external confirmation, late callback denied | single recovery/R08 physical; R02/R03 callbacks | blocked: true external outcome + candidate journey |
| UC-08 | active/inactive-only policy CAS, view-only POST403, rollback appends/current humanApproval | R05 physical races/denials + UI | not-tested |
| UC-09 | original/suggested notes, cancel/late edit/manual Save, own auxiliary run | R06 physical invocation + UI/mock provider | blocked: real provider + candidate journey |
| UC-10 |100 mixed items, reason/eligibility, snapshot/permission recheck, original intent after reload | R08 physical100/resume/concurrency + UI | not-tested |
| UC-11 |500 bounded sweep, failure/checkpoint/no duplicates, ambiguous/no resend, next-round pause | R09 actual PG + mock dispatcher | blocked: verified deployment duration/native n8n |
| UC-12 | all7 roles, scoped counts/403,100k queues, native responsive/accessibility and bound callbacks | R07/R09 actual PG/runtime; jsdom interactions | blocked: exact target + native/browser/AT/provider |

## Evidence checklist for each applicable role

1. Record actual app SHA, isolated Neon project/branch/schema and Auth identity; verify provider and outbound controls before any mutation.
2. Record route arrival, allowed action, forbidden direct POST403, owned/foreign/missing-owner row behavior and manual fallback. Manager/team/specific overrides must be backed by actual fixture relationships. A loader/HTTP200 is insufficient.
3. Capture timestamped desktop and390px mobile UI, full keyboard paths/focus return, native200% zoom, and manual assistive-technology review. Each category currently **not-tested** on this candidate. jsdom keyboard/polling tests are reported separately.
4. For lost response/reload use the original immutable intent/key and durable actor-owned receipt; record per-row results and prove no duplicate writes. Do not substitute a new key for an unresolved provider outcome.
5. Bind screenshots/API receipt/result to role ID (deidentified), app SHA, fixture version and server response; keep cookie/secret material out of evidence.

## Owner / next action

QA + UAT operator: provision the exact reviewed candidate only on the confirmed independent target with migration/worker/provider controls and then validate seven genuinely separate sessions. Business/provider operator owns R10 approvals and receipts; data owner owns R04 dispositions. No exception has been signed. These blockers preserve NO-GO; old UAT or source CI does not close them.
