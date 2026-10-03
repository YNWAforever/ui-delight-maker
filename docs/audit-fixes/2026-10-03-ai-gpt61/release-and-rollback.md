# ClientOps AI candidate release / rollback

**Decision: NO-GO. Not merged or deployed to production.** Authority covers local reversible implementation/testing, branch push, draft PR and CI. It does not authorize production release/migration, historical data changes, real customer messages, paid provider calls or cloud n8n activation. Automatic PR build previews do not supply isolated authenticated UAT acceptance. Production build hold remains in place; fresh metadata/public build evidence is recorded separately.

## Required release gate

| Gate | Owner | Current disposition / next action |
|---|---|---|
| Exact app/CI SHA + reviewed stack | Engineer/reviewer | coded2328ae full CI2849/0skip; final document HEAD Actions on draft176; review each dependency PR; no independent reviewer claimed |
| Migration001–025 + populated replay | Engineer/operator | local physical tests + isolated CI replay; production schema/backup target still unverified |
| Data origin/anomaly disposition | Data/approval owners | blocked; sign per-row retain/mark/isolate/relink from R04 source evidence |
| Five native workers + Note Tidy direct path | Worker/provider operator | blocked; verify actual deployed hashes/ack timing/attempt binding/receipts/cost scope |
| Sweep maxDuration / deadline / native resume | Deployment/worker operator | blocked; verify platform duration before setting runtime flags or enabling schedule |
| Seven actual role journeys | QA/UAT operator | local seven independent live identities/59 browser checks plus14 Review checks verified; reviewed cloud candidate remains unprovisioned |
| Native mobile/keyboard/200% zoom/AT | QA/accessibility owner | local1440/390 and policy keyboard cancel/focus verified; native200% browser zoom/manual AT remain not-tested |
| Performance provisional +10% p95 | Performance/business owner | blocked for disclosed regressions; raw960 samples retained; absolute SLO pending |
| Isolated backup/restore / compatible rollback | Engineer/operator | local rehearsal receipt; production/PITR/window/capability remain blocked |
| Production authority / change window / hold removal | User/release operator | absent; NO-GO, retain hold |

Release manifest records local app source/code tree, worker/file hashes, migration hashes, test/evidence references and every unresolved gate. Resolve the actual final candidate SHA from the PR/CI when freezing a release; a self-referential manifest commit is not proof of its own test result. Require fresh exact-head CI. Do not treat an unchanged old CI check as final proof.

## Operator sequence after explicit release authority

1. Review the stack and freeze exact app SHA, worker export/hash/native versions, policy version, schema/backup marker and approved data dispositions. Confirm independent rehearsal before production operations.
2. Rehearse additive023–025 on a matching disposable copy and compare business/history hashes; retained policies/receipts/outcomes must survive replay. Confirm approved production backup/PITR recovery capability and finite change window.
3. Verify callback URLs, token gates, seven identities, humanApproval and trusted currency/pricing. Keep messages/provider schedule off until corresponding real acceptance is signed.
4. Verify actual platform maxDuration. Configure `CLIENTOPS_RETENTION_RUNTIME_VERIFIED=1` and `CLIENTOPS_RETENTION_MAX_DURATION_SECONDS=<verified seconds>` only with operator proof. Allowed bounds30–900s; effective batch budget=min55s,duration−5s;15s+5s pre-dispatch reserve. These flags are not configured by this change.
5. Promote only within explicit authority after all gates/exceptions signed. Record live `/api/build`, schema ledger and deployed worker hashes; observe scoped403/409, stuck/ambiguous runs, callback mismatch, pending/escalated approvals, receipt failures, duplicate notification/run signals, p95/payload/usage and approved cost window.

## Rollback / incident handling

- Stop affected new entrypoints/dispatch and disable sweep schedule; retain provider/callback/command/sweep/policy/notification history. Local cancel means local state only, not provider cancellation.
- Read the actor-owned receipt first. Same command retry retains original key/reason/version. Batch resume retains sweep/operation ID; stale cursor requires reviewing durable server state. Lease expiry never authorizes resending an ambiguous provider request.
- If HTTP succeeded but ack did not, item remains ambiguous for operator reconciliation. Match provider request/execution IDs and original run/subject/attempt before any follow-up. Do not bulk retry, approve/send/issue or invent a successful outcome.
- Deploy a compatible reviewed Neon-only revision. Keep migrations023–025 and durable rows; do not drop receipt tables, delete policy versions, rewind immutable commercial state or restore Supabase.
- A production restore is a separately approved incident action with backup/PITR and delta disposition proof. Local synthetic restore rehearsal is not production backup/PITR proof.
- Verify actual restored/source schema compatibility and exact build/worker revisions, then record impact and owner disposition. Never remove production hold merely because source CI is green.

## Migration/reconciliation delta

023 adds nullable allowlisted execution provenance;024 adds invalid_output while retaining all prior outcomes;025 adds sweep leases/items. Earlier registered migrations001–022 remain byte-unchanged. R04 tooling is read-only with no repair mode. Existing18 anomaly rows and unknown origin remain owner-pending; no historical backfill/source inference performed.

## Local native verification continuation

Use only the approved private local fixture/runtime receipt and seven separate sessions under `.clientops-perf`. Start the guarded actual SSR runtime after pure build and immediately run its Chromium gut check. The committed journey runner is `node --experimental-strip-types scripts/clientops/verify-ai-local-ui.ts`; supported optional arguments are `--runtime=`, `--config=`, `--policy-post=`, `--out=` (private file paths only). It rejects non-loopback app/DB, wrong owned fixture, mismatched source/artifact, actor identity/session mismatch and carrying Cookie/Authorization from the captured policy POST. Browser-native fetch uses the current actor’s cookies and genuine Origin. A privileged stale-CAS409 control must pass before denied403 is accepted as an authorization check; APIRequest403 without Origin may merely be CSRF.

The status adapter rollback is a compatible revert of `src/start.ts` integration and its helper. Preserve CSRF, domain authorization/row scope, policy history, operation intent and durable receipts. The390px fix is one `flex-wrap` class. Neither adds migrations or provider dispatch. The native bulk proof resumes/replays the existing original operation/key; do not create a replacement operation for an uncertain outcome. Only fake local data was written.

## Final diagnostic privacy / evidence preservation

The native CLI now masks credential-bearing failure lines (Cookie/Authorization/token/password/secret/API key) and full PostgreSQL DSNs before URL/email redaction and output bounding. Eight regressions use fake credentials, including an actual failed Playwright request; no real credential is published. Keep sessions/captured requests/raw logs/screenshots private. Sanitize receipts before commit, preserve original failures and execution SHAs, and bind later source equivalence separately. Do not rerun an uncertain operation with a fresh key.

Final application local2841/0skip and separate CLI8/0skip are not reported as a combined local run; fresh code CI2849/0skip and final documentation HEAD CI remain separately bound. New code/tasks are reviewable in draft175→176, not merged/released. R04/R10/native accessibility/cloud worker/duration/performance/PITR/window gates remain NO-GO.
