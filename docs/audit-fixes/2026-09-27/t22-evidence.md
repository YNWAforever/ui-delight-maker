# T22 — release candidate, CI and role acceptance evidence

**Candidate branch:** `codex/clientops-release-candidate`, cumulative against unchanged main/audit SHA `2904faa502f7494173f48f412875c1d0a3aba674`. [Cumulative draft PR #100](https://github.com/YNWAforever/ui-delight-maker/pull/100) is based on main; resolve its current head SHA from the PR when comparing preview runtime metadata. This is a source candidate, not a deployment or production release.

## Baseline and repair

- Baseline T21 draft PR #99 remote `Types and lint` passed; `Database contract` failed 11 assertions and Vercel preview failed. The initial T22 disposable PostgreSQL full run reproduced 12 failures of 2,159 tests, zero skipped: 021 migration expectation; Admin people raw query key; sign-out source contract after T19 lazy-shell move; five policy fixture truncations after 021 FK; two T18 public auth handlers unaccounted; T20 rehearsal fixture bound to a non-T20 test DB name; two login loaders omitted from the read-path ledger; and one bulk test timeout under parallel load.
- The contract repair (commit `ccb2199`) updates the expected 021 migration list, canonical people key, sign-out assertion against the real lazy component, FK-aware policy fixture cleanup, explicit public self-scoped auth explanations, login-loader ledger, and a T20 test-only local database allowance requiring `NODE_ENV=test` plus exact `DATABASE_TEST_URL=DATABASE_URL`. Production Neon task cutover remains denied.
- Focused after repair: six non-DB files/80 tests passed; three real PostgreSQL files/18 tests passed, including the 100-item bulk retry case. The policy fixture reset includes its actual FK dependents and the CI suite now runs files serially against its disposable service. No assertion was deleted or changed to skip.
- Public build metadata regression was RED (missing module), then 2/2 passed. The endpoint returns only a validated 40-character commit SHA or null, with no-store caching. A local Vite preview with a synthetic environment commit SHA returned exactly one `commitSha` field matching that value; no external preview SHA was verified.
- The next fresh serial database run passed 2,157/2,159 with zero skipped; the only failures were existing 5-second Vitest timeouts in visibility scope and competing bulk workers, each with duration just over 5 seconds. A later fresh focused 100-item bulk test completed in 18.36 seconds with every assertion intact. CI now uses a 30-second general ceiling; the real 100-item case has a scoped 60-second ceiling. Neither ceiling is an application performance result. Final fresh full suite on `clientops_t22_release_final` passed at code SHA `a4abea78ecd511cf2151b3e0c5308cb26d5bb62f`: 304 files, 2,161/2,161 tests, zero failed and zero skipped. The JSON gate accepted that report.
- A final review found that replaying a previously failed same-key direct AI run reported `duplicate` and the UI called it still running. The `195f8b0` fix reads persisted failure status/outcome and returns failed/ambiguous without a new provider call. RED unit and real-PostgreSQL tests both failed before the fix; 2 files/13 tests passed after it.
- The CI JSON summary gate accepted a valid 2/2 report and rejected a report with one skipped or failed test. Both workflows parse with PR and main-push triggers. The DB workflow checks the test database variable and rejects any failed or skipped full-suite result.
- First PR #100 remote head `2d0e886`: Database contract passed in 4m12s; Types/lint failed after the pure Vite build because the bundle gate picked `dist/server/.vite/manifest.json` on Linux. Two focused regression tests failed before the fix: client manifest must win when both exist, and server-only output must be rejected. Commit `665b32a` makes the gate select only known browser manifest paths; the five focused tests, TypeScript, lint, pure client/SSR Vite build and emitted bundle gate pass locally. The Vercel deployment also failed; no matching preview runtime SHA is available. Recheck both remote gates on the revised PR head.

- Revised PR #100 head `9b5c73b`: remote Types/lint passed; Vercel failed again at automatic seed with `Quote version is immutable`. The repository's `vercel.json` had `bun run build`, which applies migration and seed before compiling. The preview target's isolation is unverified. The safety test failed RED against that command. Commit `876ddef` changes the build command to pure Vite and static output packaging; the safety regression and manifest tests pass 6/6. Local output packaging succeeds, TypeScript and lint pass; migration/seed remain a separate gated operation. Preview deployment and matching SHA still require fresh remote evidence.

## Local verification

- Fresh serial isolated PostgreSQL full-suite outcome at code SHA `a4abea78ecd511cf2151b3e0c5308cb26d5bb62f`: **304 files, 2,161 passed, 0 failed, 0 skipped**. The disposable database was `clientops_t22_release_final`; no production connection or data.
- `bunx tsc --noEmit`: pass after generated route tree update.
- `bun run lint`: pass, 0 errors and one pre-existing Fast Refresh warning in `data-table-shell.tsx`.
- Pure `bunx vite build`: client and SSR pass. Local `node scripts/vercel-build.mjs` packaged that output successfully at `876ddef` without any database command. `bun run performance:bundles`: pass; login initial emitted static JS is 165,496 gzip bytes at this build. This is transfer size, not route latency.
- `bun run build` was not used because it applies migration and seed. The full suite itself migrates/validates the disposable PostgreSQL fixture through `pg`. The production migration CLI uses Neon's WebSocket driver and has not been proven against this plain local PostgreSQL container; a wrapper rehearsal needs a separate disposable Neon-compatible target.
- `git diff --check`: pass for code commits; final document diff checked before publication; remote PR head and checks must be read live.

## External gates

| Gate | State | Reason / closure |
|---|---|---|
| Remote final PR CI | pending | First head: contract passed; Types/lint failed on server-manifest selection, repaired locally. Require both green on revised head |
| Vercel preview and runtime SHA | blocked | PR #100 first two previews failed at seed; source-only build awaits remote verification and matching SHA |
| Seven-role UI/network UAT | blocked | no authenticated disposable sessions; [15-case matrix](uat-results.md) records no invented passes |
| Full route p95 before/after | blocked | no authenticated route runtime; [T19](t19-evidence.md) only has emitted bundle and actual isolated SQL component measurements |
| Legacy data parity | blocked | user will provide isolated snapshots later; [T20](t20-evidence.md) has no cross-database result |
| Provider/n8n sandbox | blocked | no sandbox workflow/credential; no real token/cost or callback claim |
| Production backup, rehearsal, release | blocked | operator evidence and explicit release scope absent; no successful deployment, provider call or customer message. Database effects of the failed preview builds are unverified |
