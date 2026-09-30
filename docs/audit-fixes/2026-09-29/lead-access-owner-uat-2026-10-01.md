# Lead access controls and owner selection — 2026-10-01 HKT

## Reproduced defects

On isolated source `fc4a2fd311d38d05ca6295a43e4fc8571158fd6f`, own Sales and read_only sessions at 390px and 1440px can select Lead rows and see New lead, Assign owner and Mark qualified/lost. Reader controls misleadingly offer writes denied by the existing server. The list also displays raw owner IDs and the bulk dialog requires pasting an ID. [Actual characterization](evidence/lead-controls-before-fc4a2fd-2026-10-01.json). Zero mutation POSTs; the three original synthetic Lead rows are unchanged. These old-defect probes are not release gates.

The original observer filled the filter before hydration; a second observer counted hidden responsive checkboxes. Both failures are retained privately. The valid probe waits for hydration and exactly three visible Playwright row checkboxes, reusing the same original IDs without reseeding or changing application source.

## Source repair

The page resolves authorization once and returns server-evaluated create permission and per-Lead update permission using the current actor, owner, active overrides and request time. Missing legacy permission fields remain read-only. Select-all and new previews include only permitted rows. A selected row whose permission changes remains selected and disabled for review; an owned durable receipt remains readable and uses existing resume/server guards.

The existing paged read joins the current profile name with bounded data and unchanged count/pagination. Historical inactive owners retain their name; missing/blank owners display Owner unavailable while their persisted ID remains intact. Unassigned remains distinct. Phone cards and desktop tables use the same name.

The existing paged ProfileSearchCombobox gains `lead_assign`, protected by the existing `leads.update` decision for the selected Lead. Search and selected-person resolution recheck that scope, deny and expiry. Existing roster restrictions, mutation guards, durable receipts and per-item transaction logic are preserved. No role grant, schema, migration or production operation.

## Verification

Eight positive UI regressions fail on the original source while eight existing receipt/retry cases pass. Eight effective-policy cases and two real PostgreSQL list-name cases fail on original source; the existing read-denial and six detail-name cases pass. After repair, the first focused four files pass 36 tests and seven additional real SQL picker cases pass, including person250, pagination, inactive exclusion, manager scope, scoped allow/deny and expiry. TypeScript, pure Vite build and route bundle budgets pass.

Fresh isolated PG17.10 full suite passes **2,368 tests/321 files/zero skipped or todo**, 267.51021533203124 seconds. Final focused43, TypeScript and complete source lint pass (one existing warning). [Local gates](evidence/lead-source-gates-2026-10-01.json). Exact-source hosted seven-role/override/name/picker acceptance and final-head CI are pending. A touched test formatting error was caught and corrected without changing assertions. Locally, lint excludes only the untracked private evidence/deployment folder; clean GitHub runs the original complete lint command.

## Remaining acceptance

Reuse the three original Lead IDs for hosted widths and verify each independent role's own Auth session. Validate permission revocation/expiry, named selection beyond the first roster page, a real mixed bulk result, lost-response same-key recovery, terminal replay and reader receipt denial before accepting the Lead slice. Approval and Job Sheet bulk UI remain separate CO-16 work. U08's already accepted Task100 workflow is retained.

Legacy snapshot/reconciliation, historical anomaly dispositions, provider sandbox/callback and invitation signup, full screen reader/operator/PITR acceptance remain external gates. Production is held at public `bed941b37d18d214d0e7658ebce2116a2fc33eb9`; release NO-GO.

The first complete isolated run had2,364 passes/four failures/zero skips and was rejected. Two affected pagination mocks omitted the new request context; two SQL assertions omitted the Lead table qualifier. All four corrected interfaces preserve authenticated failure, fixed-ID pagination, count and unique tie-breaker assertions; related27 pass, then the fresh complete2,368/321/zero-skip run above passes. Original logs/JSON are retained privately.
