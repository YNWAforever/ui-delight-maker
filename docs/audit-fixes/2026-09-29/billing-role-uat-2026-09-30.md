# Billing role UAT — 2026-09-30

## Binding

Source `f7f0be67934c2650f0ce1aeab2e7584a01498629`, dedicated UAT deployment `dpl_DRTaoN5PTsdHj5y81rdMt6KJuJna`. Independent Neon project `polished-forest-15724329`, empty-origin branch `br-solitary-butterfly-b3883kwo`, real independent Auth and seven distinct session identities. Synthetic Job Sheet `5b559907-919e-4b7e-a825-5ac466b4a06b`, accepted quote HKD 200.50. No production data copy/mutation or real provider/customer message.

## Actual role and workflow results

[Twenty-two UI/request/PostgreSQL cases](evidence/billing-workflow-2026-09-30.json) passed.

| Role | Sheet planning | Manual invoice record |
|---|---|---|
| super_admin | allowed | allowed |
| admin | allowed | allowed |
| manager | denied | denied |
| sales | denied | denied |
| client_success | denied | denied |
| accounting | allowed | allowed |
| read_only | denied | denied |

[Before server denial](evidence/billing-read-only-before-2026-09-30.png), [read_only after](evidence/billing-read_only-billing-boundary-after-2026-09-30.png), [accounting](evidence/billing-accounting-billing-boundary-after-2026-09-30.png). Before the fix, read_only could type a billing amount and click Save; the actual server correctly rejected it without changing persisted portions.

[Accounting portion deny](evidence/billing-accounting-portion-deny-2026-09-30.png) leaves sheet planning allowed while disabling invoice edits. [read_only scoped portion allow](evidence/billing-read-only-portion-allow-2026-09-30.png) allows only that invoice record. Temporary overrides are revoked; expired/revoked grants fail closed.

The real accounting identity selected itself as owner and persisted a documented no-PO reason. Billing saved at HKD 100.00 remained blocked; HKD 200.50 reconciled. [Note-only save](evidence/billing-accounting-note-only-2026-09-30.png) kept the portion planned with no invoice number. [Acceptance confirmation](evidence/billing-accounting-accept-confirm-2026-09-30.png) did not mutate before confirmation; confirmation locked the Job Sheet. A replay of the earlier commercial write failed as immutable with unchanged portions.

[Manual invoice evidence](evidence/billing-accounting-manual-entry-after-2026-09-30.png) stored fake invoice `UAT-INV-20260930`, date `2026-09-30`, and entered state. This records operator-supplied evidence without contacting or verifying Xero. Same-key replay did not advance the row version. manager/sales/client_success/read_only replays were denied and data stayed unchanged.

The first harness queried the DOM before the completed lock mutation's read invalidation finished. Persistent lock was verified, then a fresh role page and explicit hidden-control wait completed the remaining checks. No accepted data was reset.

## Follow-up readback defects

A refreshed actual accounting browser reproduced [blank invoice date and enabled locked owner picker](evidence/billing-date-lock-before-2026-09-30.json). Persisted date is correct, but ISO date readback is invalid for a native date input. Date drafts and their persisted comparison now use the original calendar portion; the locked/busy owner picker is enclosed in a disabled fieldset. Four of five new regression cases failed before the fix, then **65 focused tests** passed. Full gate and corrected actual browser readback are pending; U07 remains partial until those pass.

## Verification and rollback

At source `f7f0be6`: fresh local disposable PostgreSQL and exact-head CI passed **2,252 tests / 0 skipped**, plus TypeScript, full source lint, pure Vite client/SSR, browser collector and two-run migration/seed replay. PR #132 remains open for the follow-up.

No migration or role-policy baseline change. Dedicated UAT rollback is `dpl_52qArfnRNHpMEHLe8jp7kneEDi7D`; do not roll back authorization or transaction guards. Production remains held. Legacy snapshots, provider sandbox, four historical anomaly dispositions, authenticated runtime before/after, screen reader and operator release gates remain open.
