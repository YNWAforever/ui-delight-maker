# T19 Runtime measurement and bundle evidence

Branch: `codex/clientops-runtime-measurement`, stacked on T18 evidence commit `2c87787`. Code commits: `d71737e` and `32fc89b`; [draft PR #97](https://github.com/YNWAforever/ui-delight-maker/pull/97). No deployment, production data change, or customer message was performed.

## Actual bundle transfer

The same Vite client manifest method traverses the client bootstrap and login route's **static** imports, deduplicates emitted JavaScript files, then gzips each actual asset. Lazy imports, including the Neon Auth form, are excluded from initial transfer and remain separately visible in the manifest.

| Build | Login initial JS gzip | Raw JS | Result |
|---|---:|---:|---|
| T18 base `2c87787`, measured before T19 edits | 222,420 bytes | — | Baseline |
| T19 `32fc89b`, pure `bunx vite build` | 165,482 bytes | 520,745 bytes | 25.60% lower; below 300 KiB |

The authenticated sidebar, search, notifications and toast shell moved to a lazy component. Public `/login` SSR returned HTTP 200 with invitation copy and without workspace sidebar. The actual manifest based `bun run performance:bundles` passed; route-owned chunks and shared/bootstrap transfer are reported separately.

## Real isolated database component timing

[Machine-readable artifact](t19-isolated-sql-runtime.json) was produced by the guarded `scripts/clientops/measure-isolated-queues.ts` against a **fresh** local disposable PostgreSQL database at code SHA `32fc89b`. It migrated that database, inserted 10,000 tasks and 100,000 approvals, ran `ANALYZE`, then recorded 30 actual list+count SQL samples per table with 50-row pages.

| Component | p50 | p95 | 50-row JSON payload |
|---|---:|---:|---:|
| Tasks SQL list+count | 18.1 ms | 33.5 ms | 8,626 bytes |
| Approvals SQL list+count | 49.1 ms | 522.6 ms | 10,077 bytes |

These are direct SQL component timings. They omit request authentication, authorization, rendering, network, cache and browser work; they are **not** route p95 or a before/after runtime result. An earlier fresh-database run at `d71737e` measured materially lower p95 (3.9/19.5 ms), which shows local timing variability. The retained artifact uses the final code SHA and is not selected for a more flattering value.

## Instrumentation and gate

- Central PostgreSQL queries now report count, failed count and accumulated duration by request using a request-keyed weak map. A local diagnostic token gates response headers; SQL text, values, rows, identity and connection strings are not retained. Explicit asynchronous scopes also isolate concurrent direct measurements.
- The old deterministic fixture model is labelled `synthetic` and cannot pass `performance:routes:verify`. That command now runs the HTTP runtime runner, which records SHA, response bytes, warm/no-cache samples, DB metric coverage and actual initial JS gzip.
- Red test initially failed because the metrics module did not exist. Final affected tests: 6 files / 26 tests passed; request-token SQL metric tests 4/4; TypeScript, changed-file lint, pure Vite client/SSR build, and measured bundle gate passed.
- `bun scripts/clientops/measure-runtime.ts --mode=verify` returned `blocked_external` because there is no local authenticated URL/session cookie. Ten cold **browser** navigations and full request timing are not present. The runner labels its no-cache HTTP samples separately, and cannot certify browser or field Core Web Vitals.

## Remaining gates

Authenticated multi-role route timing, 30 warm plus 10 cold browser navigations, full request DB count/duration, route payload, and same-environment before/after runtime p95 remain **blocked** until isolated login sessions and a local app runtime are supplied. The 800 ms list p95 and 150 KiB page payload targets therefore have no pass claim. Production performance, LCP and INP were not measured.
