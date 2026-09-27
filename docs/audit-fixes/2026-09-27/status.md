# ClientOps audit remediation status

Baseline: fetched `origin/main` = audit SHA `2904faa502f7494173f48f412875c1d0a3aba674` on 2026-09-27 (HKT), reconfirmed before PR creation. Work branches: `codex/clientops-audit-fixes` (Wave 1), `codex/clientops-approval-state` (T05), and `codex/clientops-quote-integrity` (T06); [draft Wave 1 PR #82](https://github.com/YNWAforever/ui-delight-maker/pull/82), [draft T05 PR #83](https://github.com/YNWAforever/ui-delight-maker/pull/83), and [draft T06 PR #84](https://github.com/YNWAforever/ui-delight-maker/pull/84). See [baseline](baseline.md) and the preserved [source plan](source/ClientOps_Codex_GPT6_Sol_Implementation_Plan_2026-09-27_zhHK.md).

Allowed finding states: `open`, `in_progress`, `verified_fixed`, `already_fixed_with_evidence`, `blocked_external`. A code change alone does not qualify for `verified_fixed`; use positive behavior, real PostgreSQL when applicable, and role UI evidence when applicable.

## Task ledger

| Task | State | Commit / PR | Tests and evidence | Remaining blocker |
|---|---|---|---|---|
| T00 Baseline | complete | `aa16d943e3365ac6aa430663c12597984556b204`, `bce702a` | Hashes and SHA equality; pure Vite build; TypeScript; lint; real Postgres full suite 1,920/1,920 with 4 workers, 0 skip | Role sessions unavailable; local migration CLI WebSocket incompatible |
| T01 Runtime input contracts | complete | `56bee37` | 25 positive boundary tests; 44 existing related tests; full suite 270 files/1,945 tests, 0 skip on disposable PostgreSQL; `tsc` exit 0, pure Vite build exit 0, lint exit 0 (one existing warning); before-fix tests failed as expected. [T01 evidence](t01-evidence.md) | Seven-role UI smoke unavailable; production migration CLI is incompatible with plain local PG WebSocket |
| T02 Request authorization context | complete | `93047f8` | 82/82 affected tests on disposable PostgreSQL, including 7-role SQL/evaluator parity and 14 migrated resource predicates; TypeScript, lint, pure Vite build exit 0; [T02 evidence](t02-evidence.md) | Authenticated role UI and true runtime auth-query timing unavailable |
| T03 Read surface visibility | in_progress | `8f9d672`, `1db2945`, `e0c92b2`, `8b8d65e`, `e70ca82` | Real PostgreSQL cross-surface 7/7; full suite 276 files/1,970 tests, 0 skip; TypeScript, lint, pure Vite build exit 0; [T03 evidence](t03-evidence.md) | Seven-role authenticated UI/network smoke unavailable; CO-03 pagination remains T12 |
| T04 Import row authorization | complete | `47d20af` | Red before-fix Lead update leak; 9/9 migrated PostgreSQL row authorization cases; focused imports 35/35; full suite 277 files/1,980 tests, 0 skip at 2 workers; TypeScript, touched-file lint and pure Vite build exit 0; [T04 evidence](t04-evidence.md) | Authenticated multi-role UI smoke unavailable; build wrapper migration/seed blocked on isolated Neon WebSocket compatibility |
| T05 Approval terminal state and receipts | complete | `fe181bf`; [draft PR #83](https://github.com/YNWAforever/ui-delight-maker/pull/83) | Red two-connection overwrite reproduced; 9/9 new real PostgreSQL cases; full suite 278 files/1,989 tests, 0 skip; TypeScript, lint, pure Vite build exit 0; [T05 evidence](t05-evidence.md) | Seven-role browser UAT unavailable; T07 quote lifecycle remains separate |
| T06 Quote immutability | complete | `e8a8cb3`; [draft PR #84](https://github.com/YNWAforever/ui-delight-maker/pull/84) | Red same-statement issue loophole reproduced; 10 real PostgreSQL quote cases, 23/23 final focused, full suite 279 files/2,000 tests before final focused changes; TypeScript, lint, pure Vite build exit 0; [T06 evidence](t06-evidence.md) | Role-session A/B browser UAT and live legacy reconciliation unavailable |
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
| CO-01 Search bypass | P1 | T03 | in_progress | `8f9d672`; real PostgreSQL tests reject lead-only and denied-task matches while preserving visible quote/task; [evidence](t03-evidence.md) | Authenticated role UI/network smoke pending |
| CO-02 Dashboard visibility | P1 | T03 | in_progress | `8b8d65e`; real PostgreSQL accounting, quote linked lead redaction, denied task and scoped totals pass; [evidence](t03-evidence.md) | Authenticated role UI/network smoke pending |
| CO-03 Approval and sheet lists | P1 | T03, T12 | in_progress | `1db2945`, `e0c92b2`; real PostgreSQL list/count/approval context redaction pass; route loader 35/35; [evidence](t03-evidence.md) | Authenticated role UI and T12 pagination pending |
| CO-04 Import write authorization | P1 | T04 | in_progress | `47d20af`; real PostgreSQL Lead/Client/Event side-effect denial, stale owner/status, rollback, repeat import and preview revocation cases pass; [evidence](t04-evidence.md) | Authenticated role UI/network smoke pending |
| CO-05 Quote commercial immutability | P1 | T06 | in_progress | `e8a8cb3`; real PostgreSQL protected writes, immutable A/revision B, read-only legacy drift detection; [evidence](t06-evidence.md) | Authenticated role UI/A-B preview and live legacy reconciliation pending |
| CO-06 Approval terminal state | P1 | T05 | in_progress | `fe181bf`; real PostgreSQL two-connection decision, retry, rollback, terminal SQL guard and agent-run release pass; [evidence](t05-evidence.md) | Authenticated role UI pending |
| CO-07 Quote lifecycle atomicity | P1 | T05, T07 | in_progress | `fe181bf` provides versioned approval command/receipt; quote lifecycle transaction remains T07 | Real quote issue/accept rollback and role UI pending |
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
| CO-22 Repeated shell auth | P2 | T02 | in_progress | Navigation context 1 session resolution + 4 authorization queries (baseline 6 + 24); shell shares one context; `93047f8`; [evidence](t02-evidence.md) | Authenticated runtime request/query timing and role UI pending |
| CO-23 Shared bundle size | P2 | T19 | open | historical Vite build; current measurements pending | runtime pending |
| CO-24 Synthetic performance evidence | P2 | T19 | open | audit code path; real timings pending | runtime pending |
| CO-25 Neon and legacy data split | P2 | T20 | open | audit code path; reconciliation pending | isolated legacy snapshot pending |
| CO-26 Hong Kong date display | P2 | T09 | open | audit probe 8; positive test pending | — |
| CO-27 Docs and CI drift | P2 | T22 | open | audit code path; current gate pending | release candidate pending |
| CO-28 AI governance and telemetry | P2 | T21 | open | audit code path; positive test pending | sandbox provider/n8n pending |
| CO-29 Spreadsheet formula text | P2 | T14 | open | audit probe 7; positive test pending | spreadsheet UI pending |
| CO-30 Runtime write validation | P2 | T01 | in_progress | 25 new positive tests; 44 existing related tests; full suite 1,945/1,945 on disposable PG; commit `56bee37`; [evidence](t01-evidence.md) | Authenticated role UI field-error smoke pending |

## Shared gates

- Real PostgreSQL: dedicated disposable local container available. Existing integration tests use `pg`; the production migration CLI cannot speak directly to plain local PostgreSQL through Neon's WebSocket driver. Record exact per-task DB execution and skipped count.
- Role UI: no authenticated seven-role sessions supplied. All UAT cases requiring a session remain unverified; no super_admin proxy acceptance.
- Performance: fixture-derived formulas remain synthetic. No p95 or before/after runtime claim until a real same-environment measurement is captured.
- Release: no deployment or production mutation. Wave 1 is pushed as draft PR #82; T05 is a stacked draft PR #83; T06 is pushed as stacked draft PR #84. Later waves and release gates remain open.
