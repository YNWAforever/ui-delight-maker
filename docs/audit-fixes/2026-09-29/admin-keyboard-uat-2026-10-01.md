# Admin modal keyboard and narrow management entry — 2026-10-01 HKT

## Actual defects / source repair

Own Admin on isolated source `ea76d3b` reproduces both Role and Lifecycle initial focus/Tab-containment/Escape failures. [Actual probe](evidence/admin-keyboard-before-ea76d3b-2026-10-01.json). At390px the selected panel is hidden; full record has no management entry. [Actual narrow probe](evidence/admin-narrow-before-ea76d3b-2026-10-01.json), [directory](evidence/admin-narrow-directory390-before-ea76d3b-2026-10-01.png), [record](evidence/admin-narrow-record390-before-ea76d3b-2026-10-01.png). These defect probes are not release gates.

Both dialogs now use the existing Radix modal with appropriate title/description, initial input focus, Tab trap, Escape and return to the exact connected trigger. Existing Close/Cancel, field validation, impact/reassignment UI and submit handlers remain. Shared DialogContent accepts optional showCloseButton (default true); these two dialogs retain their own named Close controls. Dialog height/width are bounded by native viewport and scroll internally.

The full-person header exposes Manage person only to existing management capabilities, after authorized non-null record resolution. It navigates to the existing selected-person parent; that selected panel appears first on narrow layouts and returns to the side atxl. Existing full-record cards and server scope/authorization remain. No new write API, policy, grant, schema or migration.

## Local verification and retained failures

Four positive keyboard regressions fail on original source, then pass with the repair. Final related21 tests PASS; TypeScript, touched lint, pure Vite build, bundle budget and diff check PASS. Fresh real PG17.10 suite **2,344 tests/319 files/zero skipped or todo**, 275.8401149902344 seconds. [Gate evidence](evidence/admin-keyboard-source-gates-2026-10-01.json).

An initial full run omitted DATABASE_TEST_URL and skipped321 integration tests; the unchanged zero-skip guard rejected it. The correct fresh DB run above replaces it. Two initial empty-result inventory helper errors created no DB. Typecheck also caught a test callback type and a header prop/branch insertion; both corrected before publication. Private logs retained. The local full run precedes the two navigation-only entry changes; final related/static gates cover those, and exact committed-source full CI is still required.

## Exact-source hosted acceptance

Verify exact-source own Admin/SA Role and Lifecycle at390/768/1440 and real native200, visible errors, both Tab directions, Escape/exact-trigger return; own reader narrow entry/control omission; preserve original profile/Task/audit snapshots with zero mutation POSTs. Keep U10 fixed-source proof and original fixture IDs. No full U15/screen-reader/mixed-receipt release claim until its own gates execute.

Production remains held/publicbed941b unchanged. Legacy/provider/anomaly provenance/operator/PITR gates remain; release NO-GO.

## Actual inner-width failure and source follow-up

Source `4fb0b4a` exact CI passes2,344/zero skipped/replay; seventeen own-role keyboard/entry cases pass their executed scope. Visual review then found390px Lifecycle/reassignment clipping. Real modal clientWidth356px/scrollWidth458px; whole-modal horizontal scroll is required. This fails complete readability/U15 acceptance. [Measured defect](evidence/admin-modal-overflow-before-4fb0b4a-2026-10-01.json), [native screenshot](evidence/admin-modal-overflow-before-4fb0b4a-2026-10-01.png), [original scoped result/disposition](evidence/admin-keyboard-initial-scope-4fb0b4a-2026-10-01.json). A first absolute-button-box probe failed because focus changed horizontal scroll; corrected measurement uses actual inner width independently. No mutation submitted.

Both modal grid children now have min-width0; the existing reassignment rows stack on phones with labels/counts/one successor input, retaining the desktop table. One input set, selected IDs, counts, submit handlers and server authorization remain. After this follow-up21 related tests/static/pure Vite/bundle gates PASS. [Source gate](evidence/admin-modal-overflow-source-gates-2026-10-01.json). Expanded own-role390x844/768/1440/native200 gate now checks internal horizontal width and complete successor/clear/name/submit bounds, after errors and inventory changes. Exact-source follow-up hosted acceptance/CI now PASS as recorded below. Screen reader/mixed receipts remain separate.

## Expanded acceptance on repaired source fc4a2fd

[Actual seventeen-case result and screenshots](evidence/admin-keyboard-expanded-fc4a2fd-2026-10-01.json) match exact detached UAT source `fc4a2fd311d38d05ca6295a43e4fc8571158fd6f`. Own Admin and super_admin each passed Role/Lifecycle at390x844,768x1000,1440x1000 and native browser200%; own reader390 has readable selected record without management/write controls. Native Chrome zoom reports factor2, CSS1424→712 and DPR1→2. All modal cases check initial focus,12 forward and12 reverse Tabs, readable validation, Escape/exact-trigger return and complete required-control bounds after layout changes. Deactivate review retains the existing fake249 successor name after hydration and changed search, with clear/search/reason/submit visible. No deactivation or role mutation was submitted.

Actual390 inner width is356/356px for both dialogs, replacing the failed356/458px result. [Phone lifecycle](evidence/admin-keyboard-fc4a2fd-admin-390-lifecycle.png) and [native200 lifecycle](evidence/admin-keyboard-fc4a2fd-super_admin-1440-lifecycle-native200.png) were visually inspected. Internal vertical scrolling is intentional; controls remain reachable. Original profile001/249/250, both original Tasks and audit snapshots are unchanged; zero mutation POSTs and no provider/customer send.

[Fresh exact-source CI](evidence/pr147-source-ci-fc4a2fd-2026-10-01.json): Checks36782167097 and DB36782166951 PASS; fresh contract job110114825945 confirms2,344/319/zero skipped; two-run isolated migration/seed replay and Vercel PASS. Local full-suite provenance/invalid attempt remain above. Final documentation-head CI remains required before merge.

This completes the defined Admin directory/U10 repair and this expanded R03 slice. Full U15 mixed-result receipt rendering and screen-reader evidence remain open. Dedicated stable UAT alias still servesa18aa46 at this checkpoint; the tested fc4a2fd deployment is separate. Production held/not released; overall NO-GO remains.

## Final delivery

[#147 merged](https://github.com/YNWAforever/ui-delight-maker/pull/147) final05a3897 at2026-09-30T22:21:09Z; main2606334. Exact final and post-main2,344/319/zero skipped/replay/static PASS. [Merge proof](evidence/pr147-merge-2026-10-01.json). Dedicated stable UAT subsequently upgraded and seven own-role entry sessions verified; [environment](isolated-uat-environment.md). [Original mixed receipt responsive checks](responsive-journey-uat-2026-10-01.md) now PASS in six-case scope. Screen reader and external release gates remain; productionCANCELED/publicbed941b, NO-GO.
