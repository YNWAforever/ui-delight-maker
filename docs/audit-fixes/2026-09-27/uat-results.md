# Role UAT — audit release candidate

**Execution state: blocked.** No authenticated, isolated seven-role browser sessions were supplied. No case below is marked pass from a super_admin account, unit test, database test, or mock probe. The 8 old probes show defects in the audit baseline; their positive replacements are in the task evidence and are not live release acceptance. A protected preview returned a matching build SHA at checkpoint `e4db5ca2824300b885da500b7a9f8692aa3ad69f`, and anonymous `/login` SSR rendered successfully; role screenshots and application network response capture remain absent.

| Case | Role and disposable data required | Expected browser and network result | Actual UAT | Supporting local proof |
|---|---|---|---|---|
| U01 onboarding | anonymous, invited, active, no_profile, suspended identities | Invite/workspace state clear; nonmember cannot read CRM | blocked: sessions | [T18](t18-evidence.md) |
| U02 sales day | sales with scoped Lead, Task, draft Quote | owner name, follow-up, approval handoff and consistent state | blocked: session | [T07](t07-evidence.md), [T12](t12-evidence.md) |
| U03 manager review | scoped manager plus issuer on same Quote | manager approves, issue denied to manager, issuer can complete | blocked: sessions | [T07](t07-evidence.md) |
| U04 immutable version | issuer, accounting; synthetic issued A and revised B | acceptance uses A, fixed accepted_at, B cannot rewrite A | blocked: sessions | [T06](t06-evidence.md), [T09](t09-evidence.md) |
| U05 competing decisions | two reviewers and one pending approval | one terminal decision; other conflict; refresh agrees | blocked: sessions | [T05](t05-evidence.md) |
| U06 cross-entry deny | accounting plus explicit task/approval/sheet deny and expired override | search, home, list, detail, report, export and direct server request omit denied data | blocked: sessions | [T02](t02-evidence.md), [T03](t03-evidence.md) |
| U07 accounting day | accounting, issued Quote, Job Sheet with missing PO, partial amounts | blockers visible; note does not enter Xero; accepted fields locked | blocked: session | [T08](t08-evidence.md), [T16](t16-evidence.md) |
| U08 bulk 100 | actor with 70 allowed, 10 forbidden, 10 stale, 10 missing synthetic items | persistent per-item result; interrupted resume writes success once; failures remain selected | blocked: session | [T13](t13-evidence.md) |
| U09 import 5,000 | Lead/Client/Event files with BOM, Chinese, multiline, duplicate, invalid owner | preview count equals rows; each status visible; resume and issues export; no name-only merge | blocked: session | [T14](t14-evidence.md), [T15](t15-evidence.md) |
| U10 Admin 250 | admin, manager, read_only plus 250 active/inactive identities | 250th selectable when eligible, team partial result, reassignment audit, scope deny | blocked: sessions | [T12](t12-evidence.md), [T17](t17-evidence.md) |
| U11 AI recovery | scoped operator, unassigned/escalated run, sandbox timeout and late callback | claim/review/retry controlled; old callback cannot alter new run; missing cost says unrecorded | blocked: sessions/provider | [T11](t11-evidence.md), [T21](t21-evidence.md) |
| U12 manual message | sales/client success, synthetic draft and reference | clearly manual; recorded handoff does not claim delivery receipt | blocked: sessions | [T11](t11-evidence.md) |
| U13 risk application | client_success and manager, synthetic risk review with injected failure | all related writes commit or all roll back | blocked: sessions | [T10](t10-evidence.md) |
| U14 Hong Kong date/report | accounting; HK midnight, HKD and USD, 100.25 amount | timezone stable; separate currency; accepted period fixed; decimal retained | blocked: session | [T09](t09-evidence.md) |
| U15 responsive/keyboard | U02/U07/U08 at 390, 768, 1440 px and 200% zoom | visible focus, Enter/Escape/Tab, dialog return focus, readable errors, unobscured bulk bar | blocked: sessions | none; browser evidence required |
| U16 spreadsheet-safe export | report/Admin exporter role with synthetic formula-shaped text and -12.50 numeric amount | downloaded CSV opens with text, no formula evaluation; amount stays numeric | blocked: authenticated export; local LibreOffice render passed | [T14](t14-evidence.md), [render](evidence/co29-libreoffice-render.png) |

## Role and override coverage to run

| Identity | Required positive path | Required negative path | Result |
|---|---|---|---|
| super_admin | Admin audit and invitation | no bypass used to claim other roles | blocked |
| admin | directory/team support | scoped business decision outside grant | blocked |
| manager | in-scope approval | issue without capability; out-of-scope item | blocked |
| sales | Lead/task/quote | accounting-only Xero transition | blocked |
| client_success | signal and review | unrelated scoped data | blocked |
| accounting | Job Sheet and Xero | denied task/approval/quote data | blocked |
| read_only | permitted read | every mutation; explicit deny | blocked |
| each applicable role | explicit allow, explicit deny, expired override | expired grant cannot persist access | blocked |

For each run, record candidate SHA from GET `/api/build`, isolated data IDs in a private fixture manifest, date/time, browser/viewport, screenshot path, sanitized network status/response shape, actual result and tester. Do not attach cookies, customer content or connection strings. A case moves to pass only after its own expected UI and direct network checks both succeed.
