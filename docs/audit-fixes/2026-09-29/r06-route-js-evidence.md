# R06 route-specific JS measurement correction

Candidate base: main `ce8a3a7c128bc85924e2007f44d723665d8484d3`. Source fix: `009c37dd46ee2b9d8d1a30dbe29b50159ee97b7a`.

`measureRuntimeHttp({ route: "/tasks" })` previously read `src/routes/login.tsx?tsr-split=component` from the Vite client manifest and reported its gzip bytes as the requested route's `initialJsGzipBytes`. The focused manifest regression failed before the fix: the collector returned 78 bytes for its login fixture where the tasks fixture was 89 bytes. After the fix, the same test passed and the output includes `initialJsRouteSource` for traceability. Static routes resolve from the requested URL path; a missing route entry makes the measurement fail rather than substitute login bytes.

The pure `bunx vite build` client manifest at this source commit measured **165,735 gzip bytes** for the login bootstrap/static graph and **253,421 gzip bytes** for the tasks bootstrap/static graph. Those are emitted asset calculations, not actual browser transfer, interactive lazy imports, p95 latency, or a before/after performance improvement. No authenticated HTTP or browser route measurement was run.

Verification: focused runtime and bundle tests 11/11; app TypeScript and strict runtime-script TypeScript passed; changed-file ESLint passed; pure Vite client/SSR build passed; `performance:bundles` passed; `git diff --check` passed. No migration, seed, production data access, provider call, or customer message. Exact-head remote isolated PostgreSQL contract and preview are pending at this local checkpoint.

Remaining R06 acceptance: isolated actor session, same-data 10 cold browser navigations and 30 warm navigations, complete request-scoped DB metrics, dynamic/interactive transfer, and authenticated route before/after. Dynamic route paths need an explicit future mapping before this static-path collector can measure them; a missing manifest key currently fails closed. Release remains NO-GO.