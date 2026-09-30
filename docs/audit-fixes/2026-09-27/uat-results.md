# Role UAT — audit release candidate

**Execution state: in progress; release acceptance incomplete.** On 2026-09-30 the dedicated UAT database, independent Auth and seven distinct account sessions were provisioned and verified. The earlier absence-of-sessions blocker is superseded. [Environment](../2026-09-29/isolated-uat-environment.md). On source `6c7ecb0`, sales created a task assigned to a text profile ID; six permitted identities changed its status, while read_only's direct POST was rejected with unchanged database status/version. [Actual browser/DB observations](../2026-09-29/evidence/task-seven-role-before-ui-2026-09-30.json). This is partial U02/U06/U15 evidence, not completion of the full workflows below. The eight baseline probes remain defect evidence, not release gates.

| Case | Role and disposable data required | Expected browser and network result | Actual UAT | Supporting local proof |
|---|---|---|---|---|
| U01 onboarding | anonymous, invited, active, no_profile, suspended identities | Invite/workspace state clear; nonmember cannot read CRM | pending full workflow | [T18](t18-evidence.md) |
| U02 sales day | sales with scoped Lead, Task, draft Quote | owner name, follow-up, approval handoff and consistent state | pending full workflow | [T07](t07-evidence.md), [T12](t12-evidence.md) |
| U03 manager review | scoped manager plus issuer on same Quote | manager approves, issue denied to manager, issuer can complete | PASS: isolated manager claim/approve and admin issue; five issuer denials | [T07](t07-evidence.md) |
| U04 immutable version | issuer, accounting; synthetic issued A and revised B | acceptance uses A, fixed accepted_at, B cannot rewrite A | pending full workflow | [T06](t06-evidence.md), [T09](t09-evidence.md) |
| U05 competing decisions | two reviewers and one pending approval | one terminal decision; other conflict; refresh agrees | pending full workflow | [T05](t05-evidence.md) |
| U06 cross-entry deny | accounting plus explicit task/approval/sheet deny and expired override | search, home, list, detail, report, export and direct server request omit denied data | pending full workflow | [T02](t02-evidence.md), [T03](t03-evidence.md) |
| U07 accounting day | accounting, issued Quote, Job Sheet with missing PO, partial amounts | blockers visible; note does not enter Xero; accepted fields locked | PASS: isolated owner/PO blockers, mismatch, note-only, confirmed lock and manual invoice/replay | [Actual billing role evidence](../2026-09-29/billing-role-uat-2026-09-30.md), [T08](t08-evidence.md), [T16](t16-evidence.md) |
| U08 bulk 100 | actor with 70 allowed, 10 forbidden, 10 stale, 10 missing synthetic items | persistent per-item result; interrupted resume writes success once; failures remain selected | pending full workflow | [T13](t13-evidence.md) |
| U09 import 5,000 | Lead/Client/Event files with BOM, Chinese, multiline, duplicate, invalid owner | preview count equals rows; each status visible; resume and issues export; no name-only merge | pending full workflow | [T14](t14-evidence.md), [T15](t15-evidence.md) |
| U10 Admin 250 | admin, manager, read_only plus 250 active/inactive identities | 250th selectable when eligible, team partial result, reassignment audit, scope deny | pending full workflow | [T12](t12-evidence.md), [T17](t17-evidence.md) |
| U11 AI recovery | scoped operator, unassigned/escalated run, sandbox timeout and late callback | claim/review/retry controlled; old callback cannot alter new run; missing cost says unrecorded | pending role workflow; provider blocked | [T11](t11-evidence.md), [T21](t21-evidence.md) |
| U12 manual message | sales/client success, synthetic draft and reference | clearly manual; recorded handoff does not claim delivery receipt | pending full workflow | [T11](t11-evidence.md) |
| U13 risk application | client_success and manager, synthetic risk review with injected failure | all related writes commit or all roll back | pending full workflow | [T10](t10-evidence.md) |
| U14 Hong Kong date/report | accounting; HK midnight, HKD and USD, 100.25 amount | timezone stable; separate currency; accepted period fixed; decimal retained | pending full workflow | [T09](t09-evidence.md) |
| U15 responsive/keyboard | U02/U07/U08 at 390, 768, 1440 px and 200% zoom | visible focus, Enter/Escape/Tab, dialog return focus, readable errors, unobscured bulk bar | pending full workflow | none; browser evidence required |
| U16 spreadsheet-safe export | report/Admin exporter role with synthetic formula-shaped text and -12.50 numeric amount | downloaded CSV opens with text, no formula evaluation; amount stays numeric | blocked: authenticated export; local LibreOffice and Excel display passed | [T14](t14-evidence.md), [render](evidence/co29-libreoffice-render.png) |

## Role and override coverage to run

| Identity | Required positive path | Required negative path | Result |
|---|---|---|---|
| super_admin | Admin audit and invitation | no bypass used to claim other roles | pending full workflow |
| admin | directory/team support | scoped business decision outside grant | pending full workflow |
| manager | in-scope approval | issue without capability; out-of-scope item | pending full workflow |
| sales | Lead/task/quote | accounting-only Xero transition | pending full workflow |
| client_success | signal and review | unrelated scoped data | pending full workflow |
| accounting | Job Sheet and Xero | denied task/approval/quote data | pending full workflow |
| read_only | permitted read | every mutation; explicit deny | pending full workflow |
| each applicable role | explicit allow, explicit deny, expired override | expired grant cannot persist access | pending full workflow |

For each run, record candidate SHA from GET `/api/build`, isolated data IDs in a private fixture manifest, date/time, browser/viewport, screenshot path, sanitized network status/response shape, actual result and tester. Do not attach cookies, customer content or connection strings. A case moves to pass only after its own expected UI and direct network checks both succeed.


## 2026-09-30 executed Task/Admin entry slice

[Seven-role report](../2026-09-29/task-role-uat-2026-09-30.md) records actual same-task writes, denied direct requests, four effective override/scope scenarios, Admin entry boundaries and ten Task layout/keyboard cases. The full cases above remain pending because their other records, state transitions, import/bulk sizes and cross-entry paths have not all been exercised. Seven sessions are available; session absence is no longer a blocker.

## 2026-09-30 quote action slice

[Quote role report](../2026-09-29/quote-role-uat-2026-09-30.md): seven-role issue boundaries and two scoped overrides pass at `4b5f94a`. Sales synthetic draft creation passes; subsequent save/submission fails strict line-item validation and is being repaired. U03/U04/U07 remain open; the full matrices above retain their individual gates.


## R06 final hosted queue regression slice

Dedicated UAT source `f4f5c97` repeats the real seven-role Task mutation/denial, four overrides/scopes, seven Admin entry boundaries and ten layout/keyboard cases after selective queue rendering. [Report](../2026-09-29/r06-runtime-before-after-2026-09-30.md), [role results](../2026-09-29/evidence/r06-task-role-uat-2026-09-30.json), [layout results](../2026-09-29/evidence/r06-task-responsive-2026-09-30.json). Scope remains partial U02/U06/U10/U15; all sixteen full workflow rows retain their own unmet criteria.
