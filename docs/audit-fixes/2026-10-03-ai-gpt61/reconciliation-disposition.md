# R04 / AI-08 — read-only reconciliation and owner disposition

## Source and limits

The reviewed SELECT ran in `REPEATABLE READ READ ONLY` against the previously approved independent UAT project `polished-forest-15724329`, branch `br-solitary-butterfly-b3883kwo`, database `clientops_uat`. The database confirmed `transaction_read_only=on`. Zero mutations; no production connection, worker/provider call or Supabase operation. Current UAT application source remains `3d851c23dc0d1b5aa52cae8f8e51fc68e8ae9c63`; these observations are not candidate UI acceptance or production reconciliation.

[Timestamped metadata, query receipt, source hash and explicit row IDs](evidence/r04-uat-reconciliation-result.json) are the disposition inventory. 354 rows: 336 without a detected relationship/state anomaly, 7 confirmed demo rows (one also escalated), 11 terminal/approval mismatches. Categories overlap. No missing subject/approval found on this target. Origin is unknown for 347 rows; a profile or historical name containing `demo` is not origin evidence. `valid` means the selected checks found no anomaly, not validated commercial output or provider quality.

The previously restored local Neon snapshot passed the local-target guard, but lacks `agent_runs` (`42P01`). It cannot prove AI inventory coverage. The CLI refuses arbitrary network/production targets; it accepts only an explicitly attested loopback `clientops_snapshot_*` target config and writes metadata into the ignored `.clientops-perf/ai-reconciliation` directory. Example command: `bun scripts/clientops/audit-agent-reconciliation.ts --config <local-approved-config-path>`. Do not put credentials in command arguments or commit the config/report.

## Decisions pending

| Row group | Evidence / owner routing | Decision | Next action |
| --- | --- | --- | --- |
| 7 explicit demo runs | `input_data.demo` is JSON boolean true; run IDs in receipt; recorded creator `demo-sales-user` | blocked / no change | Business data owner maps the recorded creator to the accountable human, then signs retain/mark/isolate per row. |
| Renewal run `e6a9d9a2-02cc-46a6-9036-f1a4018d4245` | Explicit demo, linked approval **escalated**, subject exists | blocked / no change | Approval owner reviews its real linked escalation. Pending queue absence alone is not an orphan. |
| 11 qualification terminal mismatches | Completed run with pending linked approval; explicit IDs in receipt; recorded creator `demo-manager-user`; origin unknown | blocked / no change | Data/approval owners review original purpose and approved disposition per row. Do not infer demo from creator, delete approval, invent business snapshot or relink automatically. |
| Audit production rows | No refreshed approved production inventory in this task | not-tested | Operator supplies approved read-only inventory and provenance; owner compares it to the audit scope. UAT observations do not close production AI-08. |

The recorded creator is a factual routing hint, not an assigned business owner. No owner signature, source-business evidence or restore mapping has been supplied, so AI-08 data acceptance stays **blocked**. Any approved future change requires a separate reviewed per-row mapping, before/after hashes, exact authority and rollback record. This tool has no mutation mode and cannot apply a disposition.

## Code verification and rollback

Classification distinguishes escalated/missing links, retains workflow identity and historical labels, keeps demo/link categories independent, and never emits prompts or summaries. Real Postgres checks compare row hashes before/after and prove write attempts fail with SQLSTATE `25006`, with rollback releasing the transaction. Synthetic tests are classification evidence, not external acceptance.

AI Ops, agent history and AI Review expose independent confirmed-demo/non-demo/unknown origin filters and labels. Statistics visibly include demo data; loaded-list filters do not change all-run statistics or daily business KPI acceptance. Existing capability and row redaction remain. Server-wide cursor/filter work belongs to R07; current filters explicitly narrow loaded lists.

Rollback the read-only script/read-model/UI commit if needed. No migration or historical data change to undo; retain captured metadata, hashes and pending owner decisions. Production release remains **NO-GO**.
