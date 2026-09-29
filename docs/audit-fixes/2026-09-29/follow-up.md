# 2026-09-29 audit follow-up — candidate source

> Latest: [2026-09-30 source/environment checkpoint](checkpoint-2026-09-30.md) supersedes source and production identity statements below. Earlier audit counts and measurements remain historical evidence.

Audit baseline: main `46dd6107e7c08582ae6b626f1af4afc1e451cdac` (#110). User-supplied SHA256SUMS verified all 34 files. CSVs contain 718 action candidates, 751 test scenarios, 51 routes and 214 server functions. Those counts describe the audit inventory; they are not newly executed UI coverage. The audit's 0/18 cross-role business journeys remains 0/18 here.

## Backlog disposition

| Package / findings | Source result | Acceptance still required |
| --- | --- | --- |
| R00 / CF-01 | Base pinned; local checkout clean before branch. Production build hold confirmed active; latest READY still audited SHA `2904faa`. | Seven isolated role sessions, target IDs, synthetic fixtures, runtime worker/flags identity. |
| R01 / CF-01, CO-05–11/19/27 | Existing command and reconciliation fixes retained. Four historical anomalies have no new owner provenance. | Disposable copy compatibility rehearsal, record-level dispositions and cross-role handoff. No historical values invented. |
| R02 / CF-04, CO-16 | `53b942c`: transient GET failure retains the same pending receipt and key; Leads/Tasks show `Retry loading result`; new preview is blocked while result is unresolved. Owner-denied pointer is cleared. | Real actor browser retry/offline/reconnect. Existing isolated PostgreSQL bulk suite covers 100 mixed outcomes, owner denial, rollback and idempotency; PR #111 real isolated PostgreSQL CI reran it with 2,182 tests and zero skipped. |
| R03 / CF-02/03 | `4467ae3`, `e4e6c17`, `48673e4`: public/auth and root fallback skip targets; the Radix invitation dialog has focus entry, Escape, focus return, disabled close while submitting and the prior overlay tone. | Actual browser keyboard, 390/768/1280/1440, 200% zoom and screen reader. |
| R04 / CO-02/08/14/19/20/21 | `2326b02`: non-Leads Today landing offers only potentially visible work queues, suppresses resource-wide explicit denies, and does not call an inaccessible Job Sheet queue empty. `55186f6`: People directory exposes failed refresh and retry without claiming zero people, retaining cached rows. `4b7d50d`: narrow cards open the existing full record instead of setting an invisible selection panel. Other role/commercial workflows remain unchanged. | Seven-role, same-record handoff and state/scope browser evidence; source hints do not replace route authorization. |
| R05 / CO-17/18/29 | Existing import/export and real PostgreSQL gates retained. | Authenticated upload through independent read, retention owner and target-specific dry run. |
| R06 / CO-22/23/24 | `1c9f0ce`, `95f1851`: HTTP collector now returns request metric scope; verifier requires complete scoped count and duration; strict collector TypeScript is wired into static CI. Mocked collector test is a contract test, not performance evidence. | Actual authenticated 10 cold browser navigations and 30 warm runs, same data/machine before/after, 10k/100k isolated dataset. Existing HTTP no-cache mode correctly fails browser gate. |
| R07 / CO-12/13/25/28 | Existing source guards and governed AI remain. | Legacy plus Neon snapshots, five-domain parity, provider sandbox receipts and scoped actor UI. |
| R08 / all | This ledger and existing release checklist retain NO-GO. | Every required matrix case must have case-specific browser/network/provider/data proof before release. |

## Verification of source changes

- R02 audit probe reproduced red, then Leads/shared bulk tests 14/14 green; TypeScript, changed-file lint and diff check passed.
- R03 skip and invitation focus/Escape probes reproduced red; after fixes, six affected files/27 tests green. Submitting-close assertion reproduced red then invite suite 5/5 green. After the final overlay composition, invite tests 5/5, TypeScript, changed-file lint and pure `bunx vite build` client/SSR passed; PR #111 exact-head and post-merge main CI passed (2,182 tests, zero skipped). Repo lint had one pre-existing Fast Refresh warning.
- R06 two metric-scope assertions reproduced red then measurement suite 6/6 green; script-specific TypeScript and lint passed.
- R04 task-only, quote-only and explicit-deny navigation assertions reproduced red then four relevant/neighboring test files 34/34 green; TypeScript, changed-file lint, pure `bunx vite build` client/SSR, bundle gate and diff check passed. No actor browser acceptance is claimed.
- Local Docker engine query hung and was stopped; no local full PostgreSQL result is claimed. PR #111–#113 isolated PostgreSQL CI passed; local full-DB execution remains unavailable. No `bun run build`, migration or seed touched an unverified target.
- Browser tool initialization failed with Windows sandbox ACL error; no screenshot or viewport/role verification is claimed.

## Data, UAT, performance and release

No schema change, data repair or cutover in this branch. Existing [production reconciliation disposition](../2026-09-27/production-reconciliation-disposition.md) records four anomalies; each needs provenance and owner decision before a data plan. Existing [UAT matrix](../2026-09-27/uat-results.md) stays blocked for seven roles. Existing [performance report](../2026-09-27/t19-evidence.md) has static bundle and isolated SQL component measurements; this branch adds no full-route before/after result. Use the [release checklist](../2026-09-27/release-checklist.md) for compatibility, PITR, flags, worker, provider, promotion and rollback checks. A source merge is not permission to release. The Vercel production hold is active; latest READY production remains audited SHA `2904faa`.

Rollback of these source-only changes is a source revert; do not erase durable bulk operations or their receipts. A future production rollback also needs new-code/old-code compatibility with already applied migrations 010–021 and data reconciliation, not just a prior bundle. No customer message, provider call or production write was made.

## Source merge checkpoints

- [PR #111](https://github.com/YNWAforever/ui-delight-maker/pull/111) merged at `7ba1330`: exact-head Types/lint, isolated replay, protected preview SHA and 2,182/2,182 real PostgreSQL tests with zero skipped passed; post-merge main repeated these gates.
- [PR #112](https://github.com/YNWAforever/ui-delight-maker/pull/112) merged at `e379a7c`: exact-head Types/lint, isolated replay, protected preview SHA and 2,185/2,185 real PostgreSQL tests with zero skipped passed; post-merge main repeated these gates. Supabase Preview skipped and is not counted as acceptance.
- R06 strict collector typecheck `95f1851`: local `bun run typecheck:runtime`, `bun run typecheck`, measurement tests 6/6 and diff check passed; PR #113 and post-merge main ran the new strict step, 2,185 real PostgreSQL tests with zero skipped and isolated replay successfully. The production build hold canceled all three source-merge production attempts; the audited deployment remains READY. No production promotion, data repair or external message occurred.

## Final source checkpoint

- [PR #113](https://github.com/YNWAforever/ui-delight-maker/pull/113) merged at `60cdbc108c06f529ace7512429e87a0d6cff8497`. Exact-head and post-merge main Types/lint, strict runtime collector typecheck, pure Vite build, bundle gate, real isolated PostgreSQL contract (2,185 tests, 0 skipped) and two-run migration/seed replay passed. Protected PR preview `/api/build` matched exact head `96039a4`.
- All 30 CO IDs remain tracked in the [finding matrix](../2026-09-27/status.md). R02/R03/R04/R06 source slices are merged; seven-role browser UAT, four historical anomaly dispositions, legacy plus Neon snapshots, provider sandbox and real authenticated runtime before/after are still unverified. R08 production release remains NO-GO. No promotion, production write, customer message or paid provider call occurred.

## Continued R04 source checkpoints

- [PR #115](https://github.com/YNWAforever/ui-delight-maker/pull/115) merged at `8f773f1`. Exact-head and post-merge main Checks, real isolated PostgreSQL contract (2,187 tests, 0 skipped) and two-run migration/seed replay passed. Protected preview `/api/build` matched head `c66642d`. Production build hold remains active.
- Narrow People card source commit `4b7d50d` passed 19 focused/adjacent tests, TypeScript, changed-file lint and pure Vite client/SSR build. It still needs real narrow-viewport and role browser acceptance. No schema, production data or provider operation occurred.

## Final audit delta

[Acceptance delta](acceptance-delta.md) reconciles the supplied 751-case baseline with current source proof. [PR #116](https://github.com/YNWAforever/ui-delight-maker/pull/116) merged at `8b62413` after exact-head and post-merge main Checks, real isolated PostgreSQL contract (2,188 tests, 0 skipped), two-run migration/seed replay and matching protected preview SHA. Four old audit FAIL probes have positive source regressions, but their browser acceptance is blocked. Seven-role, legacy/Neon snapshot, provider sandbox, historical data provenance and authenticated runtime before/after gates remain open; production release stays NO-GO.
