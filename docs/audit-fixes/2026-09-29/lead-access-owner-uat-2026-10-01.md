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

## Exact-source hosted controls — PASS

Source `988e66beee8130f253c349973268abf844b83543` on dedicated protected [candidate](https://clientops-uat-20260930-lm33wprac-ynwaforevers-projects.vercel.app) passes20 actual cases: each of seven own Auth identities at390/1440, direct forbidden candidate-search requests for reader/CS/accounting, exact reader scoped allow with two denied neighbours/create denial, expired allow denial and Sales scoped deny. Established Accounting Lead-read denial remains. Current owner names render on both surfaces; actual Sales named selection resolves the correct ID without raw-ID entry. Original three Lead rows unchanged; zero mutation POSTs; temporary overrides revoked. [Actual proof](evidence/lead-controls-fixed-988e66b-2026-10-01.json), [environment](evidence/lead-detached-deployment-988e66b-2026-10-01.json). Reader390 screenshot visually inspected.

Exact-source GitHub static/browser/full2,368/321/zero skipped and isolated migration/seed replay PASS. [CI proof](evidence/pr149-source-gates-2026-10-01.json). Dedicated `--skip-domain` was requested; CLI still updated its default team alias. The canonical stable UAT alias remainsfc4a2fd and actual production remainsbed941b, verified separately. Original same-role Auth cookies were rebased only to this candidate and distinct across seven identities; private credentials/cookies excluded.

Real Lead100 mixed/lost-response/same-key/replay acceptance is executing; no completed bulk claim yet. Other bulk domains/external gates remain; release NO-GO.

## Actual Lead bulk functional acceptance — PASS / responsive follow-up pending

Original Lead100 UI preview includes100 fixed IDs/100 eligible without writes, measured15,184ms actual runtime. After preview,10 scoped denies,10 concurrent stale edits and10 deletions yield70 successes/10 forbidden/10 stale/10 not_found. Real first commit response forwarded then aborted; offline reload keeps the original key and receipt, recovery/resume reaches completed (10 commit/resume POSTs). All70 successes have exactly version1; denied rows unchanged, stale versions preserved and missing rows not recreated. Terminal replay unchanged; own reader receipt denied without IDs; actual30 failed selections retained. Temporary denies revoked. [Actual100 proof](evidence/lead-bulk100-988e66b-2026-10-01.json). This single preview sample is not a p95 or performance before/after claim. Existing R06 measured before/after remains separate.

Own Admin selects the actual named active person at roster position255 and bulk assigns three synthetic Leads, then marks those same three Lost. Each original commit key terminal replay is unchanged; versions1 then2, three successful durable items per action. [Actual named owner/lost](evidence/lead-owner-lost-988e66b-2026-10-01.json). Initial action observer waited for a Resume button after the server already completed assignment; original failure/requests retained, original completed assignment/key verified without reseed/reassignment, then Mark lost executed once with actual response observation.

The original Lead100 receipt passes390px/keyboard30-row CSV, but768px document overflow fails the wider gate: viewport/client768, scroll994; table714px in464px content beside the visible navigation. [Actual geometry](evidence/lead-medium-overflow-before-988e66b-2026-10-01.json), [screenshot](evidence/lead-medium-overflow-before768-988e66b-2026-10-01.png). Repair uses the existing container breakpoint/card surface. Seventy related tests, TypeScript, pure Vite and bundles pass; exact updated-source hosted full widths/native200/same receipt and exact finalCI are pending. No data, permission, backend, transaction, migration or policy change in this follow-up. Release NO-GO.
