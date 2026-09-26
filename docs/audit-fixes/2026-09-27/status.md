# ClientOps audit remediation status

Baseline: fetched `origin/main` = audit SHA `2904faa502f7494173f48f412875c1d0a3aba674` on 2026-09-27 (HKT). Work branch: `codex/clientops-audit-fixes`. See [baseline](baseline.md) and the preserved [source plan](source/ClientOps_Codex_GPT6_Sol_Implementation_Plan_2026-09-27_zhHK.md).

Allowed finding states: `open`, `in_progress`, `verified_fixed`, `already_fixed_with_evidence`, `blocked_external`. A code change alone does not qualify for `verified_fixed`; use positive behavior, real PostgreSQL when applicable, and role UI evidence when applicable.

## Task ledger

| Task | State | Commit / PR | Tests and evidence | Remaining blocker |
|---|---|---|---|---|
| T00 Baseline | complete | commit to be recorded below | Hashes and SHA equality; pure Vite build; TypeScript; lint; real Postgres full suite 1,920/1,920 with 4 workers, 0 skip | Role sessions unavailable; local migration CLI WebSocket incompatible |
| T01 Runtime input contracts | open | — | — | — |
| T02 Request authorization context | open | — | — | — |
| T03 Read surface visibility | open | — | — | — |
| T04 Import row authorization | open | — | — | — |
| T05 Approval terminal state and receipts | open | — | — | — |
| T06 Quote immutability | open | — | — | — |
| T07 Atomic quote lifecycle | open | — | — | — |
| T08 Xero state | open | — | — | — |
| T09 Currency, accepted period, HK date | open | — | — | — |
| T10 Atomic risk review | open | — | — | — |
| T11 Approval and agent recovery | open | — | — | — |
| T12 Queue pagination and people search | open | — | — | — |
| T14 CSV parser and safe export | open | — | — | — |
| T13 Resumable bulk operations | open | — | — | — |
| T15 Resumable imports | open | — | — | — |
| T16 Job Sheet handoff | open | — | — | — |
| T17 Admin directory and teams | open | — | — | — |
| T18 Invitation and workspace access | open | — | — | — |
| T19 Runtime measurement and bundles | open | — | — | — |
| T20 Legacy data source reconciliation | open | — | — | — |
| T21 Governed AI invocation | open | — | — | — |
| T22 Release candidate and UAT | open | — | — | — |

## Finding matrix

The latest main is identical to the audited commit. The audit's code findings therefore remain the starting state; no item is marked fixed on the strength of a mock characterization probe. Evidence links below identify the owning task, not a passing release gate.

| Finding | Severity | Owner | State | Unit / real DB / role UI evidence | Blocker |
|---|---|---|---|---|---|
| CO-01 Search bypass | P1 | T03 | open | audit probe 1; positive test pending | role UI pending |
| CO-02 Dashboard visibility | P1 | T03 | open | audit code path; positive test pending | role UI pending |
| CO-03 Approval and sheet lists | P1 | T03, T12 | open | audit code path; positive test pending | role UI pending |
| CO-04 Import write authorization | P1 | T04 | open | audit code path; positive test pending | role UI pending |
| CO-05 Quote commercial immutability | P1 | T06 | open | audit probe 4; real DB pending | role UI pending |
| CO-06 Approval terminal state | P1 | T05 | open | audit probe 3; real DB pending | role UI pending |
| CO-07 Quote lifecycle atomicity | P1 | T07 | open | audit code path; real DB pending | role UI pending |
| CO-08 Manager approve versus issue | P1 | T07 | open | audit probe 2; real DB pending | two-role UI pending |
| CO-09 Xero note and state | P1 | T08 | open | audit probe 5; real DB pending | accounting UI pending |
| CO-10 Currency and period | P1 | T09 | open | audit code path; real DB pending | role UI pending |
| CO-11 Risk review atomicity | P1 | T10 | open | audit code path; real DB pending | client-success UI pending |
| CO-12 Recovery of approvals and runs | P2 | T11 | open | audit code path; real DB pending | role UI pending |
| CO-13 Message handoff wording | P2 | T11 | open | audit code path; UI pending | role UI pending |
| CO-14 Task owner identity | P2 | T12 | open | audit code path; UI pending | role UI pending |
| CO-15 Queue pagination and polling | P2 | T12, T19 | open | audit code path; runtime pending | representative data pending |
| CO-16 Bulk partial results | P2 | T13, T17 | open | audit code path; real DB pending | role UI pending |
| CO-17 Multiline CSV | P2 | T14 | open | audit probe 6; positive test pending | — |
| CO-18 Import scale and resume | P2 | T15 | open | audit code path; real DB pending | role UI pending |
| CO-19 Job Sheet maintenance | P2 | T16 | open | audit code path; real DB pending | accounting UI pending |
| CO-20 Large Admin directory | P2 | T12, T17 | open | audit code path; UI pending | 250-profile fixture pending |
| CO-21 Invitation access state | P2 | T18 | open | audit public UI and code; positive test pending | isolated role UI pending |
| CO-22 Repeated shell auth | P2 | T02 | open | audit code path; query count pending | runtime pending |
| CO-23 Shared bundle size | P2 | T19 | open | historical Vite build; current measurements pending | runtime pending |
| CO-24 Synthetic performance evidence | P2 | T19 | open | audit code path; real timings pending | runtime pending |
| CO-25 Neon and legacy data split | P2 | T20 | open | audit code path; reconciliation pending | isolated legacy snapshot pending |
| CO-26 Hong Kong date display | P2 | T09 | open | audit probe 8; positive test pending | — |
| CO-27 Docs and CI drift | P2 | T22 | open | audit code path; current gate pending | release candidate pending |
| CO-28 AI governance and telemetry | P2 | T21 | open | audit code path; positive test pending | sandbox provider/n8n pending |
| CO-29 Spreadsheet formula text | P2 | T14 | open | audit probe 7; positive test pending | spreadsheet UI pending |
| CO-30 Runtime write validation | P2 | T01 | open | audit code path; positive test pending | — |

## Shared gates

- Real PostgreSQL: dedicated disposable local container available. Existing integration tests use `pg`; the production migration CLI cannot speak directly to plain local PostgreSQL through Neon's WebSocket driver. Record exact per-task DB execution and skipped count.
- Role UI: no authenticated seven-role sessions supplied. All UAT cases requiring a session remain unverified; no super_admin proxy acceptance.
- Performance: fixture-derived formulas remain synthetic. No p95 or before/after runtime claim until a real same-environment measurement is captured.
- Release: no deployment or production mutation. Review branch and PR status are recorded after creation.
