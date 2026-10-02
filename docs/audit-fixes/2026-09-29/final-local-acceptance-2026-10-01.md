# Final local acceptance and external gates — 2026-10-02 HKT

## Current scope override — 2026-10-03 HKT

[Scope instruction](../2026-09-27/scope-no-supabase-2026-10-03.md) removes Supabase recovery/acquisition from active work and withdraws the backup-page/file-path request. Five existing guarded legacy domains and eight absent Neon tables remain unverified. All30 CO19fixed/11external remain tracked; historical/provider/operator/screen-reader gates still apply. Prior paired-snapshot requests below are historical and superseded for active delivery.


## Current source and test environment — 2026-10-02 HKT

[PR #155](https://github.com/YNWAforever/ui-delight-maker/pull/155) merged at `100153e6a4b72cc7775890e3778a634135e53b9d` after exact final head `97891b9411686381634ea2d3c07ef660e062c94d` passed required checks. Final head and fresh merged main each executed **2,475 tests / 326 files / zero skipped**, plus isolated migration/seed replay, Types/lint and browser collector. Actual main log explicitly asserts2,475/zero skipped. [Immutable merge/binding proof](evidence/pr155-merge-2026-10-02.json); [final-head Checks](https://github.com/YNWAforever/ui-delight-maker/actions/runs/36908451351), [final-head Database](https://github.com/YNWAforever/ui-delight-maker/actions/runs/36908451145), [main Checks](https://github.com/YNWAforever/ui-delight-maker/actions/runs/36910357909), [main Database/replay](https://github.com/YNWAforever/ui-delight-maker/actions/runs/36910357896). This documentation-only follow-up requires its own final-head/main checks; these source-specific results do not certify an unknown future commit.

[Independent test sign-in](https://clientops-uat-20260930.vercel.app/login/sign-in) actually serves `97891b9411686381634ea2d3c07ef660e062c94d`, freshly read via GET/api/build. Its application/config/schema/lock equal measured security-patched `eb53700165e13098190fcf0079aaf1d99e3a8510` and merged main100153e; it is **not an exact merged-main deployment**. Dedicated Vercel project `prj_jlIsv7mLYGpZR4XEV4njX05jAZYJ`, Neon project `polished-forest-15724329`, independent branch `br-solitary-butterfly-b3883kwo`, database `clientops_uat` and separate Auth remain bound. Data is synthetic; no production copy/provider credentials were added. Seven distinct actual upstream users, persisted active profiles and actual sidebar roles pass final GET-only control smoke with0POST and exact buildSHA before/after. The proof records the actual smoke time/hash rather than pretending the fresh metadata read reran every workflow.

Private account reference: `C:\tmp\ui-delight-maker-git\.worktrees\clientops-merge-record\.clientops-perf\uat\TEST-ACCOUNTS.zh-HK.md`. Own storage files: `C:\tmp\ui-delight-maker-git\.worktrees\clientops-merge-record\.clientops-perf\uat\sessions\<role>.json` for `super_admin`, `admin`, `manager`, `sales`, `client_success`, `accounting`, `read_only`. Do not publish/commit these files or copy one super_admin state into other roles. Expiry requires that corresponding account's own real login.

[Approval Review P1–P7 matrix and original/patched runtime/UAT/runbook](approval-review-module-2026-10-01.md) records shared decision ownership, realversion projection,14 own-role cases,60 fresh patched decisions,24 boundaries and three retained neighbors. Four real35s native polling windows pass on sandboxed installed Chrome154: pending1/0/1/0, periodic history0, zeroPOST and unchanged10k/100k fixture hashes. Original failed observers remain retained. Actual UI p95 before→patched: Approvals4093→4229ms, AI3779→4144ms; **slower**, no causal performance improvement claim. Authorized ApprovalsGET2→3 is explicit.

The upstream security prerequisite pins existing Start1.168.60/Router1.170.41/plugin1.168.42/core1.169.39 after the unchanged24h release-age gate; no bypass. Current rollback must rebuild the UI revert on this patched chain, retaining P1/server authorization/transactions/receipts/schema/data. Pre-patch historical deployments are not current eligible rollback targets. No new migration/reconciliation for this refactor.

Production hold freshly read back unchanged. Main100153e's production attempt `dpl_BQJSf9qyz164dqzvUwGpnQ9ipYmn` isCANCELED; latestREADY `dpl_2XjJ6dX9xPT4uT2LCtQt2GujiDEY` remains prior `bed941b37d18d214d0e7658ebce2116a2fc33eb9`. This continuation reads platform metadata only, not production database data. **Production release: NO-GO / 未部署 production.** Supabase Preview remains legacy-disabled/SKIPPED, not integration acceptance. All30 findings19fixed/11external and16UAT rows stay tracked.

Earlier PR152 source/2,424-test/UAT upgrade observations remain preserved in [PR152 merge proof](evidence/pr152-merge-2026-10-01.json) and [historical upgrade proof](evidence/stable-uat-upgrade-7dc40fd-2026-10-01.json). The sections below retain their original source-specific observation scope; current acceptance does not turn751 audit inventory cases into751 executed browser scenarios.

## CO22 — complete real request counts

At the PR152 observation checkpoint (source22817d4), the compiled application ran with the independent live Auth and the disposable PostgreSQL `clientops_perf_r06_20260930` fixture (10,000 Tasks / 100,000 approvals), over loopback WebSocket/TCP. The existing local adapter enforces GET/HEAD only and blocks provider/worker routes. A private AsyncLocalStorage counter observes real upstream fetch calls; existing application diagnostics count all executed SQL, including session/profile reads and failures. No mocked session or response.

Seven own identities issued concurrent shell requests, followed by another separate request each: **14 actual requests**, each with exactly **one** upstream `/get-session` fetch and **four** authorization-context SQL queries. Complete SQL counts include profile resolution and preferences:

| Role | Upstream Auth calls/request | Complete SQL/request |
| --- | ---: | ---: |
| super_admin | 1 | 6 |
| admin | 1 | 6 |
| manager | 1 | 7 |
| sales | 1 | 7 |
| client_success | 1 | 7 |
| accounting | 1 | 6 |
| read_only | 1 | 6 |

The seventh query is the existing demo-profile email fallback after the Auth-ID profile lookup. Each response carries its own upstream identity/profile/role, every subsequent request performs its own fetch, and all failed-SQL counts are zero. Profiles, Tasks, approvals, audit and receipt hashes remain identical. Observed requests range72.463–681.752ms; fourteen concurrent observations are **not** a percentile/SLA or production performance result. [All actual observations](evidence/shell-real-auth-counts-main22817d4-2026-10-01.json). T02's original6→1 session-resolution and24→4 context-query comparison remains a controlled regression test, not a new runtime before/after claim. Request-local separation/revocation contracts also ran in main's zero-skip suite. CO22's defined defect is verified_fixed.

Initial diagnostic requests lacked browser Fetch metadata and correctly received403; a later observer wrongly expected six SQL calls for every demo profile. Both failures are retained privately. Correct same-origin headers and explicit existing email-fallback expectations repaired the observer; no application, middleware or authorization gate changed.

## CO15 — bounded queues and native polling accepted

Existing actual before/after R06 captures provide10 cold /30 warm navigations for both queue scopes, including real10k/100k SQL, request and transfer evidence. Existing PostgreSQL regressions cover priority/scope/count, stable nonduplicating cursors, default50/max100 and minimal DTOs. [Runtime](r06-runtime-before-after-2026-09-30.md), [T12](../2026-09-27/t12-evidence.md).

The earlier Windows runner blocker was Playwright's default focus emulation. An actual headed Chromium with a fresh own profile and supported noDefaults attachment now records native visible→hidden→visible→hidden→visible. Own Manager / real10k/100k Postgres passes four35-second cases: pending-only foreground polling, zero server-function requests in a background tab, resumed pending-only foreground polling, and zero requests in an actually minimized window. Each periodic response is50 rows without context_data; five complete synthetic table hashes match and zero POSTs occur. One-off stale focus refreshes are separately recorded. Both earlier observer classification failures remain retained; no application change was needed. [Complete native evidence/reproduction](native-queue-polling-uat-2026-10-01.md).

CO15's defined queue/polling criterion is verified_fixed. All30 finding IDs remain tracked:19 verified_fixed /11 blocked_external. This closes the native-background gate; human screen-reader and all historical/provider/snapshot/operator release gates remain open.

## CO26 — defined timezone finding closed

[T09's real PostgreSQL/format contracts](../2026-09-27/t09-evidence.md) cover HK23:59/00:00, New Year, date-only and SSR/CSR explicit `Asia/Hong_Kong`. [Actual U14](hk-report-uat-2026-10-01.md) uses own Accounting contexts in America/Los_Angeles and Pacific/Auckland: both display the same HK00:30 timestamp, identical date-filtered report/CSV values, midnight inclusion and pre-midnight exclusion. Existing actual [invoice dates](billing-role-uat-2026-09-30.md) and [Duplicate calendar values](quote-role-uat-2026-09-30.md) supply the date-only UI proof. Main's full suite executes these contracts. This meets the original CO26 timestamp/date-only criterion; an undefined broader date-entry requirement is removed. Historical accepted-date provenance remains a separate unresolved CO10 gate.

## Current feature → implementation → evidence map

Registered migrations remain001–021; this continuation changes no schema or app source. The original dependency register remains historical, with this current map authoritative for audit acceptance.

| Feature/CO scope | Route/entrypoint → server owner | Migration | Current test/live evidence and gate |
| --- | --- | --- | --- |
| Input/auth22,30 | Shell/writes → request context/strict schemas/safe errors | Existing |14 real own-role requests; native field-error/correction/denial workflow; [CO30](validation-feedback-uat-2026-10-01.md) PASS |
| Visibility/import01–04 | Search/home/queues/imports → scoped reads/row authorizer | Existing |Seven actual role homes and same-record scope/deny/revocation; [import](import-role-uat-2026-10-01.md) PASS |
| Commercial05–08 | Quotes/Approvals/AI Review → shared review controller + immutable lifecycle/decision commands |010–012 |U03–U06 original owned workflow/replay and real PG PASS; P1–P7 frozen version/key/outcome/redaction acceptance linked above; historical snapshot/disposition compatibility still blocked |
| Finance/risk09–11,26 | Billing/reports/risk → Xero transitions/HK accepted-period/risk commands |013–014 |Recorded billing/U14/risk local behavior PASS; historical source evidence blocked |
| Recovery/manual12–13 | AI Review/Approvals → scoped recovery/claim/manual handoff |015 |[Original recovery and escalated review](agent-recovery-uat-2026-10-01.md) PASS locally; real provider retry/delivery contract blocked |
| Queues/people14–15,20 | Tasks/Approvals/Admin → keyset pages/purpose-scoped people |016 |Real PG, runtime, native foreground/background/minimize polling and Admin250 PASS; human screen reader blocked |
| Bulk16,20 | Lead/Task/Approval/Team/Job Sheet → original item receipts |017–018 |[Original operation recovery/replay](bulk-receipt-recovery-2026-10-01.md) and scoped Team/Admin mixed outcomes PASS |
| Import/CSV17–18,29 | Lead/Client/Event/export → durable sessions/source keys/parser |019 |All-kind5000 UI/source parity, real spreadsheet apps, isolated retention PASS; legacy inventory/production retention owner blocked |
| Job Sheet19 | Billing/Job Sheets → handoff/locked commercial fields |020 |Own role/manual/mixed100 original receipts PASS; historical/schema compatibility blocked |
| Workspace access21 | Login/Admin invite → identity/profile state |Existing |Seven distinct logins and no-send states/keyboard PASS; actual provider send/signup/acceptance blocked |
| Runtime23–24 | Login/shell/queues → bundle graph/real request producer |016 indexes |Defined same-data browser queues/bootstrap PASS; both recovery timing regression and cache follow-up retained, no field CWV claim |
| Legacy25 | Five guarded domains → source seam/read-only comparer |No cutover |Complete de-identified legacy+Neon snapshots/ID-owner-task-override parity blocked |
| AI28 | Note tidy/n8n → governed run/telemetry |021 |Local policy/deadline/ambiguous-outcome contracts PASS; real sandbox callback/usage blocked |
| Docs/CI27 | README/CLAUDE/status/api-build/workflows → exact-source/no-skip gates |None |PR155 exact final/main2475/326/0 plus replay/static/browser and source-bound seven-own-role UAT PASS; this evidence-only follow-up requires its own checks |

CO27's original drift finding is verified_fixed at this current source/evidence checkpoint. Closing it does not grant release authority or waive any external gate. All30 CO and16 UAT rows remain canonical; the751-case audit inventory is not represented as751 executed browser scenarios.

## Remaining external acceptance and how to resolve

| Gate | Owner role required | Concrete evidence needed |
| --- | --- | --- |
| Historical anomalies / old preview impact | Data owner and DB operator |Four signed source/disposition records; #102 deployment/database binding and impact evidence; disposable compatibility rehearsal |
| Legacy reconciliation | Recovery excluded by user on2026-10-03 |Supabase acquisition/resume/restore no longer active; full five-domain schema/data/policy acceptance remains unverified. See current scope override above. |
| Provider/invitation/worker telemetry | Provider/n8n operator |Independent sandbox/version/recipient configuration, real callback/receipt/token-cost contract, invitation signup/acceptance evidence; no real customer sends |
| Production retention/PITR/release rehearsal | DB/release operator |Approved target/retention owner and schedule, backup/PITR marker, compatibility/rollback rehearsal and release window |
| Human screen reader | Accessibility QA operator |Actual assistive-technology acceptance for recorded role/dialog/receipt/invitation scopes |

The user-supplied workspace path was rechecked on2026-10-02: repositories/plans are present, but no supplied paired-snapshot/sandbox/disposition files were identified. Seven-role sessions are already available; the missing-input request now concerns only the remaining external materials. The directory path does not substitute for files/provider evidence. No fabricated history, copied super_admin session, mock callback or fixture timing is used to close these gates. Production remains held and undeployed by this task. For operations and rollback use the [runbook](../2026-09-27/operations-runbook.md), [release checklist](../2026-09-27/release-checklist.md) and [reconciliation disposition](../2026-09-27/production-reconciliation-disposition.md).
