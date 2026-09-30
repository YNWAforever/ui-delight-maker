# R06 authenticated runtime before/after — 2026-09-30

**Queue runtime acceptance: PASS in the isolated local environment. Production release: NO-GO.** This report replaces the earlier missing-runtime blocker for these two measured queue scopes. It does not certify every workflow, screen reader, provider or legacy-data gate.

## Sources and environment

- Task baseline: `bdb8d058d1936fb743d561d6ed97e4c8fef22cd6`; Approvals baseline: `3feef8ed8e366ee21307375bf587d349e74bfcef`.
- Final measured application: `a9d9e717f0f22e0e06970e6e1b744c700e6619aa`. The subsequent `f4f5c9721d70234f121fe77fe8276cce939d527a` changes only CI diagnostics/status; tracked application, collector and dependency sources are identical. Baselines are recent candidates, **not** original audit SHA `2904faa`.
- Same Windows/i5-12500 machine, Node 24, Chromium 153.0.8010.12, 1440×900, existing strict read-only proxy, same real PostgreSQL dataset: **10,000 tasks / 100,000 approvals / seven synthetic profiles**. [Fixture and binding attestation](evidence/r06-fixture-2026-09-30.json).
- Dedicated Docker `clientops-quote-uat-pg-20260930`, PostgreSQL 17.10, loopback port 56489, `clientops_perf_r06_20260930`. The actual built production SSR uses Neon Pool over local WebSocket/TCP to that PostgreSQL; query counts/durations come from executed SQL, without mocked responses.
- Auth is the independently provisioned UAT system in Neon project `polished-forest-15724329`, branch `br-solitary-butterfly-b3883kwo`. Sales and manager use their own real isolated sessions; cookies retain their secure attribute when retargeted to localhost. No production data or customer identity is copied.

## Actual observations

Each cell comes from **10 cold / 30 warm** retained observations, with a separately validated discarded warm-up. Values below are readiness milliseconds and bytes, not fixture formulas.

| Route / metric | Before | Final after |
| --- | ---: | ---: |
| Task warm readiness p50 | 343.714 | 338.971 |
| Task warm readiness p95 | 400.687 | 399.744 |
| Task cold readiness p95 | 3,049.190 | 1,320.373 |
| Task summed SQL duration p95 | 638.348 | 486.874 |
| Task max document/data bytes | 265,942 | 100,461 |
| Task max cold encoded JS bytes | 267,652 | 267,772 |
| Approvals warm readiness p50 | 520.705 | 562.043 |
| Approvals warm readiness p95 | 689.450 | 636.795 |
| Approvals cold readiness p95 | 1,258.109 | 3,430.385 |
| Approvals summed SQL duration p95 | 3,310.893 | 3,095.888 |
| Approvals max document/data bytes | 290,748 | 100,217 |
| Approvals max cold encoded JS bytes | 269,812 | 269,840 |

Task payload fell **62.23%**, Approvals **65.53%**. Both baseline captures completed but failed the unchanged **150 KiB** payload gate. Both final captures pass the existing **800 ms warm p95**, **150 KiB payload**, **300 KiB cold encoded JS** and completeness gates. Every measured document/fetch/XHR response has scoped metrics; zero blocked/failed requests or failed SQL queries. SQL counts remain **35 / 42 per navigation**; no session-resolution or query-count reduction is inferred.

**Approvals cold p95 worsened by 2,172.276 ms** and warm p50 also increased. These ten cold samples are retained; no cold-latency improvement or statistical significance is claimed. The accepted fix addresses duplicated rendered markup/data payload. Later detail/history/roster work still makes the complete capture longer than first-row readiness.

Raw reports:
- [Task before](evidence/r06-tasks-board-before-2026-09-30.json), [intermediate after](evidence/r06-tasks-board-after-2026-09-30.json), [final after](evidence/r06-tasks-board-final-after-2026-09-30.json).
- [Approvals before](evidence/r06-approvals-before-2026-09-30.json), [final after](evidence/r06-approvals-after-2026-09-30.json).

### Exact measured scope

| Route | Actor | Canonical URL | Visible readiness selector |
| --- | --- | --- | --- |
| Task board | sales | `/tasks?view=board&priority=all&assignee=all&search=` | `[role="button"][aria-label^="R06 PERF task 00001"]` |
| Approvals pending queue | manager | `/approvals?type=all` | `button[aria-current="true"]:has-text("R06 PERF approval 000003")` |

Readiness means that specific loaded queue row is visible, not that every action, history request or workflow is complete. Capture continues through network idle and includes all subsequent data metrics. SQL duration is summed across requests and may overlap; it is not end-to-end wall time. No LCP, INP or entire-product performance pass is claimed.

## Implementation and regression evidence

1. `bdb8d05`: self-host the existing Plus Jakarta Sans files with OFL/provenance; remove external Google stylesheet/preconnect. The strict proxy reproduced the external font request failure. No external allowance, dependency install or browser gate weakening was used.
2. `3feef8e`: Task route uses native data-only SSR and accessible loading state with no minimum spinner delay.
3. `a9d9e71`: same selective route rendering for Approvals. Server authorization/loader, 50/default/max100 page bounds, counts, scope/override decisions and transaction guards remain active.
4. `f4f5c97`: retain readable Vitest failure diagnostics alongside JSON and the zero-skip gate.

The final candidate passed 51 focused regressions including real PostgreSQL queue scope/count/cursors, typecheck, lint, source-only Vite client/SSR build and bundle budgets. Fresh local full Task-source gate passed **2,258 tests / zero skipped**. Exact `f4f5c97` GitHub Checks `36671087109` and Database contract `36671087155` passed **2,258 / zero skipped**, browser collector and isolated migration/seed replay. Final documentation/adapter head must be checked again before merge.

### Unresolved failed attempts

- First source CI `36670341117` failed with only ephemeral JSON reporting and no retained result artifact. Its failing test/cause cannot be established from the log. The full dual-reporter rerun passed; classify the initial failure as **unreproduced, cause unknown**, not diagnosed or fixed.
- A chained final Task capture exited 2 with a generic incomplete-capture result. The failed result is retained privately and excluded from all passing statistics. A diagnostic navigation and a complete 40-navigation recapture then passed. Recapture used a copy of the existing collector with only import/entrypoint and error-reporting changes; sampling, timing, scope and validation are unchanged. The successful path did not enter its catch. Cause of the aborted capture remains unknown.

## Independent hosted UAT

Dedicated test URL: [ClientOps UAT sign-in](https://clientops-uat-20260930.vercel.app/login/sign-in).

Deployment `dpl_AcaaXxJW9n4qzVbfVemXV1hEH2bw`, dedicated project `prj_jlIsv7mLYGpZR4XEV4njX05jAZYJ`; `/api/build` matched **f4f5c9721d70234f121fe77fe8276cce939d527a**.

- [Seven-role / four scope cases / seven Admin entry checks](evidence/r06-task-role-uat-2026-09-30.json): each allowed same-record Task write incremented the real DB version, reader/explicit-deny/expired/unowned direct requests were forbidden and unchanged; scoped reader allow worked. Overrides/owner restored.
- [Ten responsive keyboard cases](evidence/r06-task-responsive-2026-09-30.json): sales and read_only at 390/768/1024/1280/1440, no horizontal overflow; sales Tab stays in dialog, Escape and row-menu Enter/Escape return focus; reader write controls absent.
- Inspected [390px sales](evidence/r06-task-sales-390.png), [768px sales](evidence/r06-task-sales-768.png), [390px reader](evidence/r06-task-reader-390.png). These are Task list slices; 200% native zoom, screen reader and complete U15/bulk workflows remain open.

## Reproduction / release / rollback

The [collector runbook](r06-browser-collector.md) records the public local runtime adapter, actual bindings and required inputs. Full SHA, built output, same dataset/session/route/selector and strict existing collector are required. A fixture HTTP test cannot replace these application samples.

No schema change was introduced. Roll back the two queue SSR changes selectively while retaining authorization, transaction and font fixes; returning to baseline SSR restores the measured payload failure. The preceding dedicated UAT deployment was `dpl_3NrC8jUshfpnFLpgTngPyY3p5ADf`; any UAT rollback needs an exact build-SHA and role smoke. Production has not been promoted or mutated; its approved hold stays active and public source remains `bed941b37d18d214d0e7658ebce2116a2fc33eb9`.

R00 isolation/session setup is available; broader R02–R05/R07 UAT continues. Legacy snapshots, provider sandbox, four historical anomaly dispositions and operator/PITR/compatibility rehearsal remain blocked. All 16 UAT cases and 30 CO IDs remain tracked; scoped runtime evidence alone cannot close release acceptance.
