# CO-04 actual seven-role import authorization — 2026-10-01 HKT

## Source, identities and actual results

Stable dedicated UAT sourcefc4a2fd (same app as merged main2606334). Seven own independent Auth users/cookie sessions; pinned empty-origin synthetic Neon/Auth UAT binding. [Twenty-five actual cases](evidence/import-roles-fc4a2fd-2026-10-01.json) use new one-row synthetic inputs, actual UI upload/preview/commit and same-origin original-shaped POST for inaccessible preview route. No super_admin substitution. Preview changes no business rows.

| Own role | Lead create | Client/contact/engagement create | Event/new Account/contact/member |
|---|---|---|---|
| super_admin | succeeded | succeeded | succeeded |
| admin | succeeded | succeeded | succeeded |
| manager | succeeded | succeeded | succeeded |
| sales | succeeded | forbidden; no side effects | preview denied |
| client_success | forbidden | forbidden | forbidden; no side effects |
| accounting | preview denied | forbidden | preview denied |
| read_only | forbidden | forbidden | preview denied |

These outcomes reflect unchanged role grants and each required side effect. A transport200 wrapping a serialized server error counts as denial. Allowed preview is distinct from permission to commit a row. Denied commits persist a forbidden receipt without business rows/source keys. Four denied previews create no import session; nine denied commits have no result ID or identity mapping. Twelve successful rows validate current own owner, exact Client/contact/engagement links and100.25/start date, Event account/contact/member/campaign links/follow-up owner and corresponding source key. Original three5000 completed sessions remain retained.

## Boundary and revocation checks

After actual manager Client preview, added contacts.create deny: actual commit forbidden with zero Client/contact/engagement writes. Repeated with engagements.create deny: same no-orphan result. All required side effects are reauthorized before writing; both temporary denies revoked. Existing real PostgreSQL owner/status/concurrency/rollback/idempotency contracts remain mandatory; exact source/final/main2344/319/zero skipped/replay pass.

Two positive boundaries preserve existing legitimate paths: own sales creates a Client/contact with no engagement side effect; own client_success attaches contact/member to an existing own Account, with that Account's complete row unchanged. No role grant or policy changed. An extras observer syntax failure occurred before any request and is retained privately.

## Scope and delivery

CO-04 defined import-write authorization is verified_fixed with positive real DB contracts and this actual seven-role UI/network/side-effect proof. No app code, migration, seed or production data changed in this evidence batch. New synthetic fixtures and terminal receipts retained. All30 CO/16 UAT still tracked; other bulk domains, legacy/provenance/provider/screen-reader/operator gates remain. Production held/publicbed941b, release NO-GO.
