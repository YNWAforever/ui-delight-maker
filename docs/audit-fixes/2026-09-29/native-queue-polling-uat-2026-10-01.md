# CO15 native queue polling acceptance — 2026-10-01 HKT

**Defined queue acceptance: PASS. Production release: NO-GO.** The native-background blocker is resolved with an actual headed browser, own Manager login and real isolated PostgreSQL. This continuation changes no application, auth, schema, migration, role or business row.

## Source and bindings

- Observed main: `ed3cccfe71189da061646c55f51ae64a23a08fa3`, after merged PR153. Its application/config/schema match tested `7dc40fde8aba4c7033efaa67494fe31f70726926`; the canonical [independent test site](https://clientops-uat-20260930.vercel.app/login/sign-in) remains at that application source.
- Node24 / Chromium153.0.8010.12, a fresh dedicated browser profile. Own Manager's real upstream user ID is checked before the native route loads. The UI shows UAT manager and33,333 pending /66,667 decided. The existing seven distinct canonical user/session/role bindings remain in [their proof](evidence/stable-uat-upgrade-7dc40fd-2026-10-01.json); no super_admin state is copied.
- Disposable PostgreSQL17.10, container `clientops-quote-uat-pg-20260930`, loopback56489, database `clientops_perf_r06_20260930`:10,000 Tasks /100,000 approvals. Existing compiled SSR connects over real loopback WebSocket/TCP. Independent UAT Auth is unchanged. The established local adapter enforces GET/HEAD only, rejects provider/worker routes, and strips production/provider configuration.
- Source/disposable bindings were verified before starting the adapter. Existing app build artifacts were source-equivalent; no normal build wrapper, migration, seed, fixture repair/reset, provider send or production query was run for this observation.

## Root cause of the earlier runner blocker

Installed Playwright's main-frame initialization enables focus emulation. Its default attached session keeps a page visible when a native tab/window is backgrounded. Disabling emulation through another CDP session changes focus but still does not remove the original session's visibility effect. These diagnostic failures are retained.

A directly launched headed Chromium with its own fresh profile, attached using supported `connectOverCDP(..., { noDefaults: true })`, has no Playwright focus/media/download overrides. Native same-window tab activation and native minimization then report hidden; restoring the window/tab reports visible. This restores native browser state. No document visibility getter is replaced, no lifecycle state is forced/frozen, and no clock is accelerated. [Official Playwright option](https://playwright.dev/docs/api/class-browsertype#browser-type-connect-over-cdp-option-no-defaults), [release notes](https://playwright.dev/docs/release-notes), [CDP focus-emulation definition](https://raw.githubusercontent.com/ChromeDevTools/devtools-protocol/master/pdl/domains/Emulation.pdl).

## Actual current application observations

| Native observation | Visibility | Actual elapsed ms | Pending polls | History polls | All server-function requests | Result |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| visible-pending-refresh | visible | 35013 | 1 | 0 | 1 | PASS |
| native-background-tab-stops-polling | hidden | 35016 | 0 | 0 | 0 | PASS |
| native-foreground-resumes-pending-only | visible | 35013 | 1 | 0 | 1 | PASS |
| native-minimized-window-stops-polling | hidden | 35007 | 0 | 0 | 0 | PASS |

Every periodic list response is HTTP200 with50 rows and no `context_data`. Both hidden observations issue zero server-function requests. The four actual visibilitychange events are retained with real timestamps. Native minimize metadata is actually minimized. Profiles, Tasks, approvals, command receipts and audit hashes match before/after; zero mutation POSTs.

Returning from a background tab performs one ordinary stale focus refresh for each of pending and history, then resumes pending-only periodic polling. This one-off focus catch-up is recorded separately, not erased or called a periodic poll. Two earlier observer failures are retained: the first treated that refresh as an interval; the second attributed a slow response to its arrival phase. The corrected runner binds each response to the request's phase and awaits real focus response completion. Pending had already resumed in the original timeline; the preliminary no-resume interpretation was corrected. No app fix was warranted.

[Full actual result and hashes](evidence/native-queue-polling-mained3cccf-2026-10-01.json), [native UI](evidence/native-queue-polling-mained3cccf-2026-10-01.png), [runner/default and failed-observer timelines](evidence/native-queue-runner-diagnosis-2026-10-01.json). Older [partial foreground proof](evidence/queue-visible-polling-main22817d4-2026-10-01.json) remains historical and success=false for its uncompleted background scope.

## Reproduce safely

Use the existing confirmed disposable fixture and private independent UAT configuration/own Manager session. Do not substitute production or a borrowed super_admin login. From a clean checkout with the matching pure Vite artifact, start the existing checked-in GET-only adapter, then run the new native observer against the exact full SHA it serves:

```powershell
node scripts/clientops/serve-audit-browser-runtime.mjs <full-checked-out-source-SHA>
# Separate terminal, same checkout:
node scripts/clientops/verify-native-queue-polling.cjs <same-full-source-SHA>
```

The observer fixes the target to localhost5199, verifies its build SHA, fixture counts and own real upstream identity, launches only its own fresh headed profile, and waits real35-second observation windows. Private output is under ignored `.clientops-perf/uat/native-queue-polling/<run-time>/`; credentials, cookies, response payloads and browser profile are never committed. It closes only its own browser. Stop the adapter when finished, retaining the fixture and original receipts. Missing native desktop/session/DB fails the acceptance; this optional headed workflow is not represented as a CI mock pass.

## Completion and limits

Existing [R06 real before/after runtime](r06-runtime-before-after-2026-09-30.md) and [T12 real PostgreSQL contracts](../2026-09-27/t12-evidence.md) retain stable/nonduplicating cursors, default50/max100, scoped counts/priority, minimal DTOs and the defined10k/100k performance budgets. This real native observation closes their remaining visibility/polling criterion. CO15 is verified_fixed; all30 finding IDs remain tracked (**19 verified_fixed /11 blocked_external**), and all16 canonical UAT rows remain.

No entire-product/CWV/751-browser-scenario pass or production performance improvement is inferred. Human screen-reader acceptance, paired legacy/Neon snapshots, historical anomaly/old-preview impact, real sandbox callback/invitation/telemetry, and retention/PITR/release-rollback operator evidence remain blocked. No production release. The production-only hold was read back before publishing; exact final-head CI, real isolated PostgreSQL/no-skip and seed replay plus source-only preview verification are required before merge.

Review: self-review performed against captured request phases, native transitions, source equivalence and unchanged hashes; no parallel agents or model switches.
