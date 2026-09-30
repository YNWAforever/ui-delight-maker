# Admin selected-record dialog repair / U10 — 2026-10-01 HKT

## Reproduced behavior

Actual own read_only at protected isolated source `0376f5c` loaded retained synthetic profile250. Both role and lifecycle dialogs opened automatically; the reader saw Suspend user despite the absent mutation toolbar. The genuine POST was denied by the server and the complete profile row remained unchanged. [Result](evidence/admin-dialog-before-0376f5c-2026-10-01.json), [native viewport screenshot](evidence/admin-dialog-before-reader-2026-10-01.png). This is an unauthorized UI exposure, with server authorization preserved.

The initial U10 toolbar-only reader observation does not satisfy full mutation-control omission. Admin's intended lifecycle trigger was intercepted by the auto-open dialog. The original failed observers and fixture IDs are retained privately; no duplicate fixture or team operation was created.

## Source repair and local gates

`admin.people.tsx` starts both dialog intents closed and guards rendered dialogs by the existing effective capabilities. Selecting or loading a record alone cannot open a mutation dialog. Explicit permitted actions retain their existing selected record and lifecycle inventory flow. No policy, API, schema, migration or role grant changed.

Four positive component regressions failed against the original behavior after correcting two invalid test-harness attempts, then passed with the repair. The final focused set passed15 tests. The fresh real PG17.10 full suite passed **2,340 tests / 318 files / zero skipped or todo**, 299.8399880371094 seconds. TypeScript, changed lint, pure Vite client/SSR build, bundle gate and diff check passed. [Gate metadata](evidence/admin-dialog-source-gates-2026-10-01.json). Component mocks cover rendering only; full DB and genuine-role browser evidence are separate.

## Hosted continuation pending

Deploy the exact committed source to the independent UAT project, verify own SA/admin/manager/reader deep-link behavior, explicit allowed actions, reader actual saved-POST refusal, and complete the retained target001 mutable-task reassignment/history/audit. The existing team partial operation (one success/one stale/one forbidden) and same-key replay remain retained. U10/CO-20 and broader CO-16 remain in progress until their applicable real-browser criteria pass.

No production DB operation, customer/provider send or production promotion. Legacy snapshots, provider sandbox, anomaly provenance, screen reader and operator/PITR gates remain open; release **NO-GO**.
