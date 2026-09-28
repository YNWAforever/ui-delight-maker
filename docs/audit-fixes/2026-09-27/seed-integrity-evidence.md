# Seed integrity regression — 2026-09-28

## Scope and baseline

Baseline main: `6eb157a5553c0726140a6d93f75e050a64aa1f95`. This follow-up addresses the synthetic seed path for CO-05, CO-06, CO-07 and the T22 CI gate. It does not reconcile production history.

The old seed was executed against a fresh, unmounted `pgvector/pgvector:pg17` container named `clientops-seed-integrity-20260928`, bound only to 127.0.0.1:62454, database `clientops_test`. Script driver guard required matching DATABASE_URL and DATABASE_TEST_URL plus explicit local opt-in. Provider variables were cleared. No production connection, customer message or migration was used.

## Red / green evidence

The executable SQL integrity gate failed on the baseline seed with these actual counts:

| Defect                                           | Baseline fresh seed | Corrected fresh seed |
| ------------------------------------------------ | ------------------: | -------------------: |
| Issued/accepted Quote missing issued version     |                   1 |                    0 |
| Job Sheet missing/mismatched acceptance metadata |                   1 |                    0 |
| Quote-send approval without a resolvable Quote   |                   1 |                    0 |
| Approved/rejected approval missing decision time |                   1 |                    0 |

The corrected seed creates issued then accepted snapshots for a newly inserted synthetic Quote, copies Quote acceptance time onto the new Job Sheet, uses an explicit fixture Quote key for quote-send approval, and stamps a newly inserted synthetic terminal decision. Existing incomplete records throw and roll back; no historical timestamp or snapshot is invented.

Two corrected runs retained 5 Quotes, 2 immutable Quote versions, 1 Job Sheet and 4 approvals. Version, lifecycle and decision fingerprint was unchanged:
`ccb72ce828655c59c3f56db5444f5113140d67fc6344fd91965e65ea1e4c25ff`.

Four additional real PostgreSQL fault-injection cases passed: missing issued pointer, missing Job Sheet acceptance time, orphan approval context and missing terminal decision time. Each rejected seed with the expected integrity error, and a fingerprint of every public table proved all writes from the failed seed rolled back. Fixture injection uses transaction-local replication mode only on the explicitly guarded disposable database to model pre-guard legacy data. The seed under test runs on its own ordinary connection with triggers enabled.

## Continuous gate

The dedicated CI seed-rehearsal PostgreSQL service now runs the integrity verifier after each full build wrapper, compares history fingerprints as well as row counts, and runs all four rollback cases. These executable database assertions supplement the zero-skip Vitest suite.

Local TypeScript, lint (zero errors; one existing Fast Refresh warning), pure Vite client/SSR build, and touched-script lint passed. Full isolated suite and remote CI results are recorded in the accompanying status checkpoint.

## Release / rollback and remaining gates

The Vercel project control plane still reports the approved production-only build hold in `commandForIgnoringBuildStep`. Repository `vercel.json` overrides the project default with the source-only build. This source change adds no migration and requires no production database action.

Do not run seed against production or use it as a legacy repair. An incomplete existing demo database must be replaced with a fresh disposable database or handled through a separately reviewed reconciliation. Reverting this source change does not repair historical data and would remove the new seed gate.

Production's four observed anomalies remain unresolved under [the recorded disposition](production-reconciliation-disposition.md). Authenticated seven-role UI, T20 legacy/Neon snapshots, provider sandbox, full-route performance before/after, and operator release evidence remain blocked. This script-only change has no new role UI evidence and no performance claim. Production release remains NO-GO.

## Merge and local verification follow-up

PR [#107](https://github.com/YNWAforever/ui-delight-maker/pull/107) merged at `b84bfa73dc4515de3adf6dfa65b56423f84f7cf8`. Final PR head `65b16b3` passed Checks `36417953100` and Database contract `36417953022`; protected preview returned that exact SHA. Post-merge main Checks `36418475004` and Database contract `36418474876` passed, including **2,172 tests, zero skipped** and all four seed rollback cases.

Production deployment `dpl_8MZcYG4hxW3ppcr4WFjVQWx9vfTZ` was CANCELED. Latest READY production remains `dpl_BubNGhS2HFmmvjcUYfiKiasDwcLU`, audit SHA `2904faa502f7494173f48f412875c1d0a3aba674`. No release or production data mutation occurred.

The local Windows full run is **not green**: 2,159 passed, 13 pending/skipped after three incomplete suites. A targeted rerun executed 19 cases: 18 passed and the existing cross-surface dashboard task-deny test exceeded its explicit 15-second timeout. Rebuilding the disposable schema reproduced the same timeout. The JSON reporter omitted the original suite-hook error details, so the initial setup failure cause is not established. No timeout was increased and no test was skipped to pass the gate. Local full-suite reproducibility remains unresolved; successful GitHub runs are separately identified above. This does not invalidate the directly observed local seed red/green, replay and rollback evidence, and it does not satisfy the outstanding release gates.
