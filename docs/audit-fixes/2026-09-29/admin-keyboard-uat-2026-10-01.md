# Admin modal keyboard and narrow management entry — 2026-10-01 HKT

## Actual defects / source repair

Own Admin on isolated source `ea76d3b` reproduces both Role and Lifecycle initial focus/Tab-containment/Escape failures. [Actual probe](evidence/admin-keyboard-before-ea76d3b-2026-10-01.json). At390px the selected panel is hidden; full record has no management entry. [Actual narrow probe](evidence/admin-narrow-before-ea76d3b-2026-10-01.json), [directory](evidence/admin-narrow-directory390-before-ea76d3b-2026-10-01.png), [record](evidence/admin-narrow-record390-before-ea76d3b-2026-10-01.png). These defect probes are not release gates.

Both dialogs now use the existing Radix modal with appropriate title/description, initial input focus, Tab trap, Escape and return to the exact connected trigger. Existing Close/Cancel, field validation, impact/reassignment UI and submit handlers remain. Shared DialogContent accepts optional showCloseButton (default true); these two dialogs retain their own named Close controls. Dialog height/width are bounded by native viewport and scroll internally.

The full-person header exposes Manage person only to existing management capabilities, after authorized non-null record resolution. It navigates to the existing selected-person parent; that selected panel appears first on narrow layouts and returns to the side atxl. Existing full-record cards and server scope/authorization remain. No new write API, policy, grant, schema or migration.

## Local verification and retained failures

Four positive keyboard regressions fail on original source, then pass with the repair. Final related21 tests PASS; TypeScript, touched lint, pure Vite build, bundle budget and diff check PASS. Fresh real PG17.10 suite **2,344 tests/319 files/zero skipped or todo**, 275.8401149902344 seconds. [Gate evidence](evidence/admin-keyboard-source-gates-2026-10-01.json).

An initial full run omitted DATABASE_TEST_URL and skipped321 integration tests; the unchanged zero-skip guard rejected it. The correct fresh DB run above replaces it. Two initial empty-result inventory helper errors created no DB. Typecheck also caught a test callback type and a header prop/branch insertion; both corrected before publication. Private logs retained. The local full run precedes the two navigation-only entry changes; final related/static gates cover those, and exact committed-source full CI is still required.

## Hosted acceptance pending

Verify exact-source own Admin/SA Role and Lifecycle at390/768/1440 and real native200, visible errors, both Tab directions, Escape/exact-trigger return; own reader narrow entry/control omission; preserve original profile/Task/audit snapshots with zero mutation POSTs. Keep U10 fixed-source proof and original fixture IDs. No full U15/screen-reader/mixed-receipt release claim until its own gates execute.

Production remains held/publicbed941b unchanged. Legacy/provider/anomaly provenance/operator/PITR gates remain; release NO-GO.
