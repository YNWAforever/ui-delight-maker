# R11 exact-candidate UAT acceptance

**Local candidate browser acceptance verified for the cases below; external acceptance remains blocked.** The continuation runs the actual built SSR and Neon driver against an owned disposable loopback PostgreSQL17 database (migrations001–025), with synthetic CRM rows and seven independent, live Neon Auth sessions. Each session identity, persisted role and distinct cookie set is verified. Only read-only requests to the independently verified UAT Auth service are allowed outbound; provider/customer transports are blocked. This is local candidate acceptance, not a deployed cloud/provider or production acceptance claim.

The existing independent cloud UAT site last observed at `3d851c23dc0d1b5aa52cae8f8e51fc68e8ae9c63`, migrations001–022, does not qualify as this candidate. Production DB is not accessed or changed; read-only project/public-build metadata is observed separately. Auth session cookies stay private; no super_admin session was copied to another role.

| Case | Verified locally | Remaining gate |
|---|---|---|
| UC-01 | actual legacy/new quote workflow names share one28-row queue (manager26); next page and reload; foreign direct run excluded for manager | unknown-subject native detail journey not-tested |
| UC-02 | real PostgreSQL59:59/60:00 contracts retained; young rows excluded by native bulk | exact native boundary UI journey not-tested |
| UC-03 | unchanged manual notes saved by own client_success session with provider unavailable | real provider budget/follow-up acceptance blocked |
| UC-04 | physical whole-output D03 rejection/rollback and correct200 contracts retained | real pricing/provider/commercial-owner approval blocked |
| UC-05 | physical attempt/callback binding and original20 key guards retained | true worker/provider/model/usage receipts blocked |
| UC-06 | physical scoped approvals/immutable-state contracts;14 native Review controls/reload/mobile/cancel checks; existing accounting dual-capability denial retained | manual approve/issue/send/handoff and true provider outcome not-tested/blocked |
| UC-07 | native local expire receipts, original operation replay has zero additional writes | true external outcome/late callback acceptance blocked |
| UC-08 | own admin/super_admin actual status append and append-only rollback; native keyboard cancel/focus return; five other roles direct same-origin policy POST403; authorized stale-CAS control409; humanApproval retained | deployed candidate/worker policy acceptance blocked |
| UC-09 | own Note Tidy invocation count1 for accessible roles; provider unavailable manual390px Save retains original and joined product label | actual suggestions/cancel/late-edit provider journeys blocked |
| UC-10 | actual mixed100 preview95eligible/5blocked; response dropped, original key retained through reload/resume;100 durable results/95 receipts; original-key native replay adds0; non-run roles genuine403 | cloud candidate acceptance not-tested; provider outcomes excluded from batch |
| UC-11 | physical500/deadline/checkpoint/crash/ambiguity/no-resend contracts retained | deployment maxDuration/native n8n continuation blocked |
| UC-12 | seven actual roles/59 browser checks plus14 Review checks; scoped129 counts (manager125), accounting route denied; desktop1440/mobile390 screenshots and zero horizontal overflow; true403/409 | native200% browser zoom/manual assistive technology not-tested; real callbacks blocked |

## Evidence and superseded checks

- `evidence/r11-native-browser-post-role-result.json`: seven distinct Auth users, sessions and cookie sets; seven passing journeys/59 checks. Native `page.evaluate(fetch)` supplies the real same-origin browser headers and the actor's own cookies. The authorized stale-CAS control reaches the writer409 with zero writes; denied roles403 with zero policy versions.
- `evidence/r11-native-http-status-red-result.json`: seven failing actual browser journeys before the fix. Domain authorization/CAS errors were serialized with HTTP200. The new global function middleware maps only trusted domain error instances to401/400/403/404/409 before serialization, preserving errors, success responses, redirects and CSRF.
- Earlier APIRequestContext.POST403 rows in private probes were CSRF rejections because Origin was missing. They **do not prove role authorization** and are superseded. Earlier count/layout/session evidence remains separate. HTTP200 alone never establishes provider success.
- `evidence/r11-native-mobile-red-result.json`: six accessible roles overflowed390px (404px scrollWidth). The Note Tidy controls now wrap; all six native mobile journeys pass.
- `evidence/r11-native-policy-result.json`, `r11-native-manual-save-result.json`, `r11-native-bulk-final-result.json`: actual native writes to fake data only. Bulk's loss/resume phase predates the status adapter; the final receipt explicitly binds both phases and preserves the original operation/key. No fresh operation is substituted to claim replay success.
- `evidence/r11-native-source-artifact-result.json` binds base SHA, tracked diff plus explicit changed/untracked source hashes and actual server/client artifact inventories. Final committed source/CI binding is recorded separately. Private screenshots carry individual SHA256 hashes; cookies/request bodies remain uncommitted.

Native browser tests use installed Playwright Chromium. Bun's Chromium launch timed out without running journeys; the identical TypeScript runner succeeded with `node --experimental-strip-types scripts/clientops/verify-ai-local-ui.ts`. These are genuine browser/real DB/live Auth results, not auth or database-result mocks. They do not replace the full regression, fresh exact-head CI, provider, accessibility or release gates.

## Owner / next action

QA/accessibility owner completes native200% browser zoom, assistive technology and the remaining detail/action/provider journeys. UAT/deployment operator provisions the reviewed cloud candidate with isolated schema/worker/outbound controls before cloud acceptance. Business/provider operator approves and executes the120 R10 cases; data owner signs R04 dispositions. Performance owner reviews all retained p95 regressions. Production remains **NO-GO**, unmerged and undeployed.

## Final committed source / evidence binding

Application behavior622c5df5 is unchanged in final code `d2328ae0c4548ba8c2e9cf56a4b9f11f71f7e938`; native executions preserve4c523591, while [delivery binding](evidence/r11-native-delivery-binding-result.json) verifies source/artifact equivalence. The only later executable delta is private CLI diagnostic masking, covered by8 genuine failure-diagnostic regressions. [Review receipt](evidence/r11-native-review-result.json) adds14 passing checks: super/admin/manager approvals.decide controls; sales/client_success/read_only disabled controls; admin confirm/cancel leaves pending data unchanged; accounting retains its existing approvals.view + agents.view denial without context leakage. No manual approval/issue/send is claimed.

Final local application suite27040f1 passes2841/0skip; separate CLI target8/0skip. Exact combined code Actions passes2849/0skip and isolated migration/seed replay. Final documentation HEAD Actions are linked on draft#176. Native keyboard policy confirmation/cancel/focus is verified; native200% browser zoom/manual AT remain not-tested. Source CI/actual browser/live Auth are separate from R10 true AI acceptance; production remains NO-GO.
