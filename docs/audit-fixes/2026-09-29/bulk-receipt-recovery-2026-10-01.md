# Approval and Job Sheet bulk receipt recovery — 2026-10-01 HKT

## Reproduced actual defect

Source4a0e06b, own manager identity, dedicated isolated UAT: original100 synthetic qualification-review approvals,100 eligible actual preview (14,810ms observed runtime, not p95/before-after). After preview10 scoped denies/10 concurrent stale edits/10 deletions, the actual first commit reaches the server and its response is aborted. The original pending commit key is saved. Offline reload cannot show Retry loading result because the page requires a selection or loaded result to render its recovery bar. [Actual failure](evidence/approval-recovery-before-4a0e06b-2026-10-01.json), [retained screenshot](evidence/approval-recovery-before-4a0e06b-2026-10-01.png). Original operation036eda18-ebef-4480-92c5-20b5c877bbd6 remains paused; acceptance is pending recovery with the same IDs/token/key, no replacement preview/seed. No provider/agent/customer delivery.

The first observer assumed an ignored limit=100 URL query; the actual route loads50 and has Load more pending. Its failure is retained, then the observer used that existing button on the same untouched100 fixtures. The receipt storage key was corrected to the actual Approval key before any command. The100-row actual preview then succeeded; the missing retry above is a product failure.

## Source and regressions

The Approval page and both Job Sheet bulk surfaces use the existing recoveryState/retryLoadResult hook and existing bar. Approval recovery remains visible even when the queue/filter has no records. Owned portion receipts remain readable after header write permission is revoked; new invoice-date controls still require the original permission. Backend ownership, policy rechecks, durable keys, individual transactions and commercial locks are unchanged.

Nine positive UI regressions use the real hook/bar and mocked server-function transport only for deterministic failure/retry: exact saved-key resume, read-only owned receipt dismissal, inaccessible pointer removal on each of three surfaces. Valid old-source red: five failures/36 existing or discriminating passes across41 cases; first index-test hoisting syntax failure was corrected before its meaningful one-failure/two-pass red. Repaired41 pass. Hosted acceptance must use the real isolated DB and own sessions; unit mocks do not satisfy it. Fresh complete isolated DB and source static/pure build are running.

## Release state

#149 exact final abed594 and post-merge main3e0c455 pass2,368/321/zero skipped and migration/seed replay/static/browser. [Merge](evidence/pr149-merge-2026-10-01.json), [production hold](evidence/production-hold-after-149-2026-10-01.json): main production attemptCANCELED/publicbed941b unchanged. Lead scope accepted; CO-16 Approval/Job Sheet remains in_progress. All30 CO/16 UAT and individual legacy/provider/history/operator/PITR/screen-reader gates retained; release NO-GO.

## Fresh local source gates — PASS

Fresh disposable loopback PostgreSQL17.10 full suite: **2,377 tests /322 files /zero failed, skipped or todo**, actual287,149ms runner elapsed. [Safe proof](evidence/bulk-recovery-source-gates-2026-10-01.json). The container's requested automatic host port is empty in HostConfig; the guard initially stopped before database creation, then verified the actual NetworkSettings binding127.0.0.1:56489. TypeScript, pure Vite client/SSR build, existing performance:bundles gate and complete source lint pass (one existing warning). An incorrect local bundle script name was caught, then the actual repository script passed; the failure log is retained. Clean GitHub must run its complete unchanged lint and full isolated suite/replay.

The application diff was reviewed: existing hook/bar wiring only, empty-queue receipt visibility, and the portion receipt separated from header edit permission. New invoice-date controls still require canUpdateHeader. Existing server policy and commercial locks continue to decide each resumed item. Hosted verification must restore the original Approval100 receipt/key after a genuine transport failure and complete the original paused operation. Job Sheet owner and invoice-date real hosted evidence remain pending, so CO-16 is in_progress.
