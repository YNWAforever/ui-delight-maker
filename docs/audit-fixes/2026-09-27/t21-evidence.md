# T21 — governed AI invocation and telemetry

Code commit: `e80b9d4`. Draft review PR: pending at evidence capture. No provider call, production message, migration or deployment was executed.

## Implemented

- `invokeGovernedAI` authorizes before policy/provider, limits input to 20,000 characters, records the effective policy version and SHA-256 input fingerprint instead of the customer prompt, and deduplicates by caller key. The direct deadline is at most 60 seconds; n8n acknowledgement is at most 15 seconds. Acknowledged n8n runs remain running for their callback.
- Direct note tidy has a separate auxiliary workflow contract and uses the governed service. The UI reuses one idempotency key for a retry of the same note. Its run stores provider-reported usage; missing tokens/cost remain null. Provider failures are sanitized for the UI.
- Existing n8n dispatches send an AbortSignal and reject payloads over 20,000 characters. Unknown network/timeout delivery is recorded as `dispatch_ambiguous`; a known HTTP rejection uses `provider_error`. Neither path adds an automatic retry.
- Migration `021_ai_invocation_telemetry.sql` adds note-tidy workflow/subject types, a unique actor/workflow/key index, policy version reference and nullable usage JSON. Existing callbacks accept optional provider usage while preserving their old payloads. The local n8n templates were not changed because the deployed workflow contract has not been confirmed.

Ruling: note tidy runs before a touchpoint exists, so its `subject_type='note'` and UUID identify the invocation, not a persisted touchpoint. It has no agent catalogue card or n8n callback. Existing n8n agents retain their policy and writeback flow. The cost is that a future note-to-touchpoint association would require an explicit link migration; no association is claimed now.

## Verification

- RED → GREEN: missing governed invocation module (6 tests), n8n missing AbortSignal/uncertain outcome/input cap (3 failures), persistence failure mislabelled as provider error (one failure), note UI missing retry key (one failure).
- Final affected local run: 10 files, 88 tests passed at two workers. The quotes unit file timed out once under broader contention and passed alone 19/19 before the controlled run.
- Fresh disposable PostgreSQL `clientops_t21_final`: migration/schema, real concurrent same-key run, null versus reported usage, old failed callback rollback and prior duration contracts: 3 files, 8 tests passed. Existing writeback transaction prevents the old failed callback from changing the Lead or newer run.
- `bunx tsc --noEmit`, changed-file ESLint and pure `bunx vite build` passed. `bun run build` was not run because it includes migration and seed.
- Blocked: no sandbox OpenRouter credential or authenticated note-tidy role session was supplied; real provider timeout/usage, live n8n callback payload and five deployed workflow templates remain unverified. No fake token or cost sample is reported.
