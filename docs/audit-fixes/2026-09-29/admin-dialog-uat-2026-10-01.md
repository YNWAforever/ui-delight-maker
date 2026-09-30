# Admin selected-record dialog repair / U10 — 2026-10-01 HKT

## Reproduced behavior

Actual own read_only at protected isolated source `0376f5c` loaded retained synthetic profile250. Both role and lifecycle dialogs opened automatically; the reader saw Suspend user despite the absent mutation toolbar. The genuine POST was denied by the server and the complete profile row remained unchanged. [Result](evidence/admin-dialog-before-0376f5c-2026-10-01.json), [native viewport screenshot](evidence/admin-dialog-before-reader-2026-10-01.png). This is an unauthorized UI exposure, with server authorization preserved.

The initial U10 toolbar-only reader observation does not satisfy full mutation-control omission. Admin's intended lifecycle trigger was intercepted by the auto-open dialog. The original failed observers and fixture IDs are retained privately; no duplicate fixture or team operation was created.

## Source repair and local gates

`admin.people.tsx` starts both dialog intents closed and guards rendered dialogs by the existing effective capabilities. Selecting or loading a record alone cannot open a mutation dialog. Explicit permitted actions retain their existing selected record and lifecycle inventory flow. No policy, API, schema, migration or role grant changed.

Four positive component regressions failed against the original behavior after correcting two invalid test-harness attempts, then passed with the repair. The final focused set passed15 tests. The fresh real PG17.10 full suite passed **2,340 tests / 318 files / zero skipped or todo**, 299.8399880371094 seconds. TypeScript, changed lint, pure Vite client/SSR build, bundle gate and diff check passed. [Gate metadata](evidence/admin-dialog-source-gates-2026-10-01.json). Component mocks cover rendering only; full DB and genuine-role browser evidence are separate.

## Hosted acceptance — source `ea76d3b` / PR #146

Twelve fixed-source actual cases PASS with own SA/admin/manager/reader identities: no automatic dialogs; reader no mutation controls; actual saved suspend POST denied with complete profile unchanged; explicit keyboard role intent and Cancel; manager outside-report GET without payload; original Team operation/key unchanged; reader Team POST denied; original Admin deactivation once, open Task moved to retained text-profile successor, done Task/history/version0 unchanged, one actor audit, independent refreshed UI; Manager/reader original deactivation POST denied with complete profile/Tasks/audit unchanged. [Actual result](evidence/admin-u10-fixed-ea76d3b-2026-10-01.json), [reader](evidence/admin-u10-read_only-no-auto-dialog-ea76d3b-2026-10-01.png), [deactivated state](evidence/admin-u10-admin-deactivation-after-ea76d3b-2026-10-01.png).

Four valid earlier `0376f5c` cases are retained with their source identity: genuine Manager250th eligible selection/name, outside-report denial, real three-member mixed operation1success/1stale/1forbidden/two failures selected/exact-key replay, reader Team denial. Relevant picker/team/service/server-function files are byte-for-byte unchanged. [Source/CI proof](evidence/admin-u10-source-ci-ea76d3b-2026-10-01.json), [mixed Team screenshot](evidence/admin-u10-team-partial-0376f5c-2026-10-01.png). Current eligibility changed after the controlled inactive/deactivation fixtures; the original250th position is not relabelled as a new250th position.

Three failed fixed-source observers are retained: selected person is a panel paragraph rather than a heading; Team refusal is the actual owner-only denial; status was counted before the invalidation refresh completed. The last command completed successfully once and was not repeated. Independent fresh UI/DB reads and genuine negative POSTs complete the same records. [Failures](evidence/admin-u10-observer-failures-ea76d3b-2026-10-01.json). The initial toolbar-only reader assertion is superseded by full no-dialog/no-control proof.

Successor full name hydration and retention across unrelated search also PASS without a commit. The pre-hydration reviewed screenshot briefly shows the existing name-unavailable fallback; the later explicit name wait proves loaded state. U10 defined scenario PASS. CO-20 retains the wider Admin keyboard gate below; CO-16 other bulk domains remain open. Source/local CI2,340 zero-skip gates PASS; final documentation-head CI remains required.

No production DB operation, customer/provider send or production promotion. Legacy snapshots, provider sandbox, anomaly provenance, screen reader and operator/PITR gates remain open; release **NO-GO**.

## R03/U15 keyboard defects carried forward

Actual own Admin role/lifecycle dialogs at `ea76d3b` both fail initial focus,16-tab containment and Escape closing. These are two defect probes, not a passing release gate. [Result](evidence/admin-keyboard-before-ea76d3b-2026-10-01.json), [role](evidence/admin-role-keyboard-before-ea76d3b-2026-10-01.png), [lifecycle with hydrated selected name](evidence/admin-lifecycle-keyboard-before-ea76d3b-2026-10-01.png). Next batch must convert them to positive behavior regressions and exact-source real-browser verification. No mutation was submitted by this probe; both Tasks remained unchanged.
