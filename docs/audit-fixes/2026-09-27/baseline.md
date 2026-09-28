# ClientOps audit fix baseline — 2026-09-27

## Source and checkout

- Repository: `YNWAforever/ui-delight-maker`.
- Branch: `codex/clientops-audit-fixes`, created as an isolated worktree from fetched `origin/main`.
- Latest fetched main: `2904faa502f7494173f48f412875c1d0a3aba674`.
- Audit SHA: `2904faa502f7494173f48f412875c1d0a3aba674`. The two are identical, so no later main commit can be credited with resolving a finding. Each finding still needs positive regression evidence.
- The original checkout was clean on `codex/harden-clientops-verification`; the planning repository had unrelated local edits. Neither was modified for this branch.
- The supplied plan and audit artifacts are preserved byte for byte in `source/`. Their hashes match `source/SHA256SUMS.txt`; the ZIP report copies match the standalone report copies.

## Historical audit evidence

The eight ZIP probes use mocked database responses and deliberately pass when the old defect exists. They are characterization only. Convert them into positive tests in the owning task:

| Old probe | Finding | Positive gate |
|---|---|---|
| Accounting search returns a lead | CO-01, T03 | Unauthorized leads neither match nor appear in results or counts |
| Manager lacks issuance in combined approval | CO-08, T07 | Manager can approve; issuer performs a separate authorized action |
| Terminal approval can be rewritten | CO-06, T05 | A second decision conflicts; original decision and audit remain unchanged |
| Accepted quote commercial edit succeeds | CO-05, T06 | Edit is rejected; issued snapshot and Job Sheet stay fixed |
| Xero notes imply entered status | CO-09, T08 | Notes preserve planned status until explicit confirmed linkage |
| Quoted multiline CSV splits into two records | CO-17, T14 | Multiline cell remains one record with correct source lines |
| CSV formula text remains executable | CO-29, T14 | Text is neutralized; typed numeric data remains numeric |
| Hong Kong midnight displays prior UTC day | CO-26, T09 | Explicit HK display has the correct date on server and client |

Historical results at the audit SHA: 1,804 pass / 116 skip, TypeScript exit 0, lint 0 errors / 1 warning, pure Vite build exit 0. These are **not** this branch's results.

## Environment and release boundaries

- Bun 1.3.14; lockfile install completed with `bun install --frozen-lockfile`.
- No `DATABASE_URL`, `DATABASE_TEST_URL`, production credentials, or authenticated role sessions were present in the inherited shell environment.
- A dedicated empty `pgvector/pgvector:pg17` container, `clientops-audit-pg-20260927`, was created on `127.0.0.1:55477`, database `clientops_audit_test`. It had zero public tables before tests. It is disposable and unrelated to production.
- The production migration CLI uses Neon's WebSocket driver and cannot connect directly to this plain local Postgres container. Its initial attempt failed before applying schema. The existing integration harness uses `pg` and runs migrations inside tests against `DATABASE_TEST_URL`; database gates must use that harness or a compatible isolated adapter.
- No production migration, seed, deployment, customer message, provider call, or production data write is authorized by this task.
- Authenticated seven-role UAT and production runtime SHA comparison remain blocked until isolated role sessions or an authorized preview are available. A super_admin account alone is insufficient.

## Current branch baseline commands

| Command | Result | Scope |
|---|---|---|
| `bun install --frozen-lockfile` | pass, 726 packages | Local worktree |
| `bunx vite build` | pass, client and SSR | Pure bundle, no DB side effects |
| `bun run clientops:migrate-schema` | blocked by local Neon WebSocket connection | No schema applied by this CLI |
| `bun run test` with local `DATABASE_TEST_URL` | first run: 1,919 pass / 1 UI timeout; second run: 1,918 pass / 2 UI timeouts; `bunx vitest run --maxWorkers=4`: 1,920 pass / 0 skip | Real Postgres integration harness, all assertions and default timeout unchanged |
| `bun run lint` | exit 0, 0 errors / 1 pre-existing warning | Current branch |
| `bunx tsc --noEmit` | exit 0 | Current branch |

Do not run `bun run build` against an unknown database. It applies migrations, verifies schema, builds, and runs seed-on-deploy.

## Pre-flight interface checks

| Producer -> consumer | Interface checked | Ruling |
|---|---|---|
| T01 -> T02-T17 | Strict input schemas and error codes at every new write boundary | Keep runtime parse server-side; a TypeScript cast is not validation. |
| T02 -> T03, T04, T12 | Request context and SQL visibility scope | Apply scope before match, count, pagination or aggregation; unknown resource types fail closed. |
| T05 -> T07, T10, T11, T13, T15 | Receipt, version and transaction ownership | Check receipt before stale version, reauthorize replay, and commit business result with its receipt. |
| T06 -> T07, T09 | Immutable issued version and accepted snapshot | Acceptance uses the selected issued version; historical amounts and dates cannot be recomputed from mutable quote rows. |
| T14 -> T13, T15 | Typed safe CSV export and whole-file import parser | Complete T14 before bulk error export, as the plan's dependency table requires. |
| T13 -> T15, T17 | Persistent per-item result and resume | Preserve import-specific invalid/skipped/ambiguous statuses; do not coerce them into the bulk result enum. |

These interfaces are consistent in the supplied plan. The old audit probes remain characterization data until each producer and consumer has a positive test.

The two unconstrained full-suite runs timed out in access-request-queue.test.tsx and once in account-settings.test.tsx under worker contention. The former passed alone (5/5); the bounded-worker full suite passed 1,920/1,920 with no skips. This is an environment-sensitive baseline, not an audit fix.
