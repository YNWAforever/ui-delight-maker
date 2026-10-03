# ClientOps AI GPT-6.1 execution ledger

Execution authority: the user's 2026-10-03 GPT-6.1 request and verified plan (SHA-256 `37e03bf6cff9564ce68c35c7cd838ae5c6348c37575158d1743cad48bef6ce38`). Old GPT-6 plans and evidence remain historical sources. No merge or production release is authorized by this request.

## Status

| Task | Findings                          | Code       | External acceptance | Owner / next action                                                                           |
| ---- | --------------------------------- | ---------- | ------------------- | --------------------------------------------------------------------------------------------- |
| R00  | AI-01                             | 已驗證完成 | 待驗收              | Release operator: current production migration / deployed worker evidence                     |
| R01  | AI-02, AI-03                      | 已驗證完成 | 待驗收              | Engineer / QA: workflow identity and 60-minute contract                                       |
| R02  | AI-04                             | 已驗證完成 | 待驗收              | Worker operator / QA: real provider receipts on an exact candidate                            |
| R03  | AI-05, AI-06                      | 待開始     | 待驗收              | Engineer / commercial QA: strict outputs and quote atomicity                                  |
| R04  | AI-08, AI-02                      | 待開始     | 受阻                | Data owner: approved read-only target and anomaly dispositions                                |
| R05  | AI-07                             | 待開始     | 待驗收              | Engineer / admin QA: append-only status policy                                                |
| R06  | AI-09                             | 待開始     | 待驗收              | Engineer: actor-scoped Note Tidy operations                                                   |
| R07  | AI-10                             | 待開始     | 待驗收              | Engineer: scoped cursor queues                                                                |
| R08  | AI-10, AI-08                      | 待開始     | 待驗收              | Engineer / QA: local recovery bulk receipts                                                   |
| R09  | AI-10                             | 待開始     | 待驗收              | Engineer / ops: durable sweep and measured performance                                        |
| R10  | AI-01, AI-04, AI-05, AI-06, AI-09 | 待開始     | 受阻                | Provider / worker operator and business owner: sandbox authority, receipts and quality rubric |
| R11  | AI-01–AI-10                       | 待開始     | 受阻                | Release / data owner: final exact-SHA gates, acceptance and release decision                  |

Release decision: **NO-GO**. Production hold remains enabled. No production database mutation, customer message, paid provider call or cloud n8n activation was performed.

## Rulings

- Ruling: reuse the clean, already isolated `clientops-merge-record` application worktree and create `codex/clientops-ai-gpt61-remediation` from freshly fetched main — preserves private test fixtures and unrelated planning edits; a new checkout would add no isolation benefit.
- Ruling: execute byte-identical copies of the original VM harness in separate evidence directories — the original writes a result file beside itself despite its read-only comment; running it in the input root would overwrite immutable evidence.
- Ruling: each task gets a separate commit and stacked review PR, with no merge or release — the current user request overrides prior merge authority; all stacks must retain their dependency source.
- Ruling: execute and review inline without spawning a final reviewer or changing models — the user forbids default parallel agents; record author review separately from independent review.
- Ruling: preserve this execution workspace and private evidence after completion — the user's evidence requirements take precedence over skill cleanup suggestions.
- Ruling: R00 is an evidence task, so no artificial failing test is introduced. Existing behavior is measured against real source and an independently created disposable PostgreSQL database.

## R00 — verified baseline

- Base / tested HEAD: `953ec0a36806d4362fad9e2b2d8cd17a49adbb26`, freshly fetched main, equal to audit SHA. Application tracked tree was clean before branch creation. Unrelated dirty planning checkout was left untouched.
- Inputs: 26 pack files and 18 original evidence files passed their checksum manifests. Original audit ZIP SHA-256 is exactly `c068b0cf4bc5de3238847d173beeaf205eec78f4f9d9fb10815580c9bb44a6c7`. The standalone and packaged GPT-6.1 plan bytes match.
- Original harness copies: `bun reproduce-n8n-contracts.cjs <real-checkout>`; exit 0, 32 checks, 20 pass / 12 fail, both audit and current HEAD. These are defect probes, not passing release gates. Original evidence was not rewritten.
- Fresh complete baseline: `bunx vitest run --no-file-parallelism --testTimeout=30000 --reporter=default --reporter=json --outputFile=.clientops-perf/ai-gpt61-20261003/r00-full-vitest.private.json`; exit 0, **2,578 pass / 0 fail / 0 skips, 333 files**, 472,148 ms. A new `clientops_ai_gpt61_bbbb7f890a` DB was created in inspected `pgvector/pgvector:pg17`, bound only to `127.0.0.1:64409`. Provider, production auth, seed and bootstrap configuration were removed from the test process.
- Fresh production metadata and public `/api/build` at 2026-10-03T05:42:52Z agree on `bed941b37d18d214d0e7658ebce2116a2fc33eb9`. The main-953 deployment attempt is CANCELED. Production hold was read and left unchanged. Production migration ledger and deployed cloud worker versions are **not-tested / blocked** pending operator evidence.
- Independent UAT was verified using a read-only transaction at 2026-10-03T05:47:08Z: Neon project `polished-forest-15724329`, branch `br-solitary-butterfly-b3883kwo`, database label `clientops_uat`, migrations 001–022. Seven active persisted roles have seven distinct profile IDs and seven distinct saved cookie sets. Live session validity is **not-tested**, not seven-role acceptance. Current UAT `/api/build` reports `3d851c23dc0d1b5aa52cae8f8e51fc68e8ae9c63`.
- Read actual CLAUDE.md, README.md, current release checklist and operations runbook. No applicable application AGENTS.md was present along the verified checkout path; supplied workspace AGENTS graph-first discovery and Neon-only user constraints apply.
- Evidence: public [environment manifest](evidence/environment-manifest.json), [baseline delta](baseline-delta.md), [fresh baseline result](evidence/r00-full-result.json); immutable inputs in `C:\tmp\clientops-ai-gpt61-input-20261003`; private execution receipts under `.clientops-perf/ai-gpt61-20261003/` (not committed).
- Rollback: this task changes documentation only; retain immutable originals and private receipts. No schema or historical data rollback is required.
- Commit: this R00 commit (resolve with `git log --format='%H' -- docs/audit-fixes/2026-10-03-ai-gpt61/evidence/environment-manifest.json`). Commit: `23261dcf9cb71f7f5fd575013842f525be1c4b67`; draft PR [#163](https://github.com/YNWAforever/ui-delight-maker/pull/163).

## Required delivery contract

Every subsequent task records its base and tested source SHA, finding map, changed behavior, regression RED/GREEN result, command / exit / counts / skips, evidence paths, author review, rollback, and external owner / next action. Code verification, external acceptance and release decisions are separate. D03 rejects a supplied quote total that differs from the computed currency-minor-unit total, with zero quote / approval writes.

## R01 — stable workflow identity and attention

- Base: `23261dcf9cb71f7f5fd575013842f525be1c4b67`. AI-02 / AI-03. Branch: `codex/clientops-ai-r01-identity`, stacked on R00.
- Aggregates, hourly series, history requests / SQL and query keys now use `workflow_type`. Current and legacy quote labels retain their original text and share one detail route. Explicit known legacy BFF aliases are supported; unknown inputs fail before querying. Unknown workflows are listed separately and run details expose recorded run / workflow identifiers, without guessing another agent.
- Server stuck predicates use `created_at <= now()-60min`, including the exact threshold and ignoring later updated_at. Card / fleet attention failures use the same inclusive seven-day window as queue rows; the 24h failure KPI remains a distinct measure. Existing subject redaction, recovery checks and batched ownership resolution are preserved.
- RED: four required / SQL regression files, exit 1, 66 pass / **9 intended behavior failures**, zero skips. Real PostgreSQL reproduced quote card count 1 instead of 2, stuck count 0 instead of 2, attention count 1 instead of 4.
- GREEN: `bunx vitest run` with the eleven file paths in [result](evidence/r01-targeted-result.json), `--no-file-parallelism --testTimeout=30000`; exit 0, **122 pass / 0 fail / 0 skips**, eleven files, fresh disposable PG. Three SQL regressions executed real migrations and SQL inside rollback-only synthetic transactions. These tests substitute only the database transport / content projection authorizer and do not claim genuine seven-role UAT.
- Gates: `bun run typecheck`, focused twelve-file ESLint, `git diff --check`, `bunx vite build`, `bun run performance:bundles`: all exit 0. Pure build used no database / seed / production auth. Generated route formatting was restored to the verified unchanged baseline. Evidence receipts are in `evidence/r01-*-result.json`; raw diagnostics remain ignored. All pre-commit receipts identify base HEAD plus the R01 working changes; an exact commit replay is recorded in the PR before publication.
- UI evidence: jsdom detail loader sends workflow identity after a display-name change; catalogue status, subject restriction and AI Review decision tests pass. Genuine role / browser candidate acceptance: **not-tested**, consolidate in R11; existing saved sessions have not been revalidated here.
- Author review: confirmed no historical name edits, schema changes, provider calls, authorization bypass or payload widening. Original key guards / source evidence unchanged.
- Rollback: revert compatible read/UI changes only; retain historical run names and receipts. Do not reinstate name-based joins as an accepted release behavior.
- External next action: QA uses an exact candidate with seven independent identities for route / permitted / denied UI checks. Code verification is complete; external acceptance remains pending. Commit: this `fix: align agent identity and stuck state` commit; PR pending creation.

Ruling: stock task-start recognizes only headings named Task N; the immutable binding plan uses R00–R11. Exact task sections were extracted into this plan’s private workspace and the public ledger records equivalent BASE / brief / verification / completion evidence.

### R01 — full CI follow-up

- Commit `d8dd15a10effe5bba030413e8f77151d506b0570`, draft PR [#164](https://github.com/YNWAforever/ui-delight-maker/pull/164), initially passed the 122 focused tests and static/build gates. Fresh complete database CI run `37102314880` exposed two fixture/gate defects (2 failures / 2,587 passes); code verification was reopened for this repair.
- The identity SQL regression now creates and drops its own guarded disposable loopback database. Existing suite fixtures cannot change its exact counts. A real 51-row ownership fixture checks both 25- and 50-row history pages: each issues exactly four queries, including one batched ownership resolution. The route contract uses workflow identity and counts the catalogue read separately (five total); no authorization query is removed or N+1 budget accepted.
- Reproduction on unchanged R01 HEAD: two SQL files, exit 1, 37 pass / 1 fail / 0 skips. The contamination depended on full-suite file order and was proven by the CI report. Repair: the same two files plus database-isolation and 25/50-row regressions, exit 0, **40 pass / 0 fail / 0 skips**. Evidence: `evidence/r01-ci-red-result.json`, `evidence/r01-ci-fixed-result.json`; receipts identify base HEAD plus these working changes. Exact new-head full CI remains the next gate.
- Rollback: revert these fixture/contract changes only. External seven-role acceptance remains pending; no production, provider or worker change was made.

- Exact R01 follow-up HEAD `abd506066c3b819e49e8011f0cb9bef93276b8e9`: fresh GitHub Actions database contract and isolated migration/seed replay `37104986294`, types/lint and browser collector `37104986317` all passed. The preview passed pure build. This is source/CI evidence, not role UAT or deployed worker acceptance.

## R02 — truthful execution provenance and usage

- Base: `abd506066c3b819e49e8011f0cb9bef93276b8e9`; branch `codex/clientops-ai-r02-provenance`, stacked on R01. AI-04. All five native-JS resolvers preserve allowlisted provider transport facts (actual model, request ID, tokens, reported cost) and worker execution / template version. Missing values stay unknown; known zero remains zero. Model content cannot supply an actual model or override transport metadata. Provider failure is marked deterministic fallback.
- Additive migration 023 adds nullable, allowlist-constrained `execution_metadata`; old records remain NULL / unknown. Callback types, schemas, repository, history read and detail UI carry metadata and nullable usage. Five writebacks check run / subject / workflow / supplied attempt before writes; completed / waiting receipts remain idempotent. R02 does not claim commercial output validity (R03).
- RED on unchanged base: provenance / worker / schema / repository regressions: 60 pass / **27 intended failures**; binding: 30 pass / **10 intended failures**; actual request byte-cap: **1 intended failure**. All zero skips. The actual reader had no byte limit despite the plan's assumption: it now counts stream bytes up to 128 KiB even if Content-Length is absent or misleading. Token authorization still precedes reading / validation.
- GREEN: command / source / hashes in `evidence/r02-green-result.json`, exit 0, **212 pass / 0 fail / 0 skips**, 16 files, fresh disposable loopback PostgreSQL. Thirteen physical DB checks include nullable legacy migration / ledger replay, DB allowlist rejection, five concurrent duplicate callbacks, five cross-attempt rejections, and rollback under an injected activity-log failure. Unit substitution is not external provider or seven-role acceptance.
- Historical byte-identical VM copy on these working changes: **25 pass / 7 remaining defect probes**, all original 20 key guards plus five telemetry probes pass. Its embedded `source` remains the historical SHA, so the independent receipt supplies the actual tested base plus working changes; original harness / report / ZIP are unchanged. Remaining probes belong to R03, not passing release gates.
- Gates: typecheck, focused changed-file ESLint and diff check exit 0; pure Vite build and bundle gate are recorded separately in `evidence/r02-build-result.json`. Pre-commit receipts refer to the base plus R02 working changes; exact commit replay belongs in the PR evidence.
- Author review: no production credentials copied, old migration modified, prompt / response body stored, provider called or cloud worker imported / activated. Real worker/provider acceptance is **blocked** on operator authority / receipts / business cases. UI role/browser acceptance is **not-tested**, consolidated in R11.
- Rollback / compatibility order: additive DB → old/new-compatible app → worker. Stop new dispatch and revert compatible app / template changes; retain migration 023, nullable metadata, durable receipts and historical facts. Do not rewind schema or restore Supabase.
- External owner / next action: worker operator provides exact deployed workflow hashes and provider receipts; QA verifies the exact candidate using seven independent sessions. The user explicitly approved only review-branch / draft-PR / CI publication after automatic review rejected the initial push. Commit `7c9700ee0512b48c68c50db5cc3a4648bf72663a`; draft PR [#165](https://github.com/YNWAforever/ui-delight-maker/pull/165). Exact commit targeted replay: 212 pass / 0 fail / 0 skips.

### R02 — full CI compatibility follow-up

- Fresh database CI `37104986664`: 2 failures / 2,642 passes. Reproduced both on unchanged `7c9700e`: 28 pass / 2 fail / 0 skips, two files. Early terminal callback rejection now retains the existing typed `CONFLICT` error, before any business write. The redaction/permission test now checks the new semantic Cost definition displays `Unknown` and still forbids an invented $0.00 or recovery controls; its old `Cost: unrecorded` inline string belonged to the previous layout.
- Evidence: `evidence/r02-ci-red-result.json` and `evidence/r02-ci-fixed-result.json`; actual Postgres recovery/rollback regression, same UI permission assertions, and workflow tests. No data gate, authorization test or outcome constraint was weakened. A new-head complete CI run remains required.
