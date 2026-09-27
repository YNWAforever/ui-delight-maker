# T10 renewal risk decision evidence

Scope: CO-11. Branch: `codex/clientops-risk-review`, stacked on T09. Code commit: `4ac211b`; [draft PR #88](https://github.com/YNWAforever/ui-delight-maker/pull/88). Audit baseline: `2904faa502f7494173f48f412875c1d0a3aba674`.

## Baseline and red tests

T05 had already moved the generic approval decision, run release, risk apply, activity log, and idempotency receipt into one PostgreSQL transaction in `decideApprovalCommand`. T10 does not create a second transaction. The pre-fix real PostgreSQL test showed that an approval whose saved risk payload named a different engagement **resolved successfully and updated that other engagement**. A rejected review also left the completed run's `output_data` without a review outcome. A further real PostgreSQL red test proved a pending approval could apply its score even after its linked run had already left `waiting_approval`. The same suite's SQL engagement-write failure and same-key replay cases already passed at baseline, confirming those T05 protections rather than claiming they were newly fixed here.

## Change and positive evidence

- The decision now parses the persisted held proposal, checks its linked score-renewal-risk run is still waiting and names the same engagement, locks the run and engagement before the approval transition, and evaluates `engagements.update` on the actual owner before applying. The request does not supply a risk value to apply.
- Approval, engagement update, run outcome, activity log, and receipt remain inside the existing command transaction. An approved run records `review_outcome=approved`; a rejected run records `review_outcome=rejected` and leaves the engagement score unchanged. The unused separately callable transaction wrapper was removed to keep the approval command as the sole entrypoint.
- `risk-review-atomic.integration.test.ts` uses a real isolated PostgreSQL pool. A PostgreSQL trigger deliberately raises on the engagement update; after rollback, approval is still pending, run still waiting, score unchanged, no audit row, and no receipt. The same key then succeeds after removing the trigger. Other cases prove one approval and one engagement audit event after same-key retry, a wrong engagement target and a run already out of review are rejected, explicit denial of engagement update rolls everything back, and reject does not apply the score.
- Focused risk/writeback and approval command run after the final guard: 4 files, 47 tests passed on the disposable database. TypeScript and changed-file lint passed. Pure `bunx vite build` passed client and SSR. The final full suite passed 284/284 files and 2,035/2,035 tests on the disposable PostgreSQL database with four workers and a 15-second test allowance. Final TypeScript, touched-file lint, pure `bunx vite build`, and `git diff --check` passed. No T10 schema migration was needed.

## Remaining gates

Authenticated client-success/manager role UI sessions are unavailable. Existing policy grants `approvals.decide` to manager/admin but not client_success; T10 preserves this policy. Multi-role UI acceptance and live reconciliation are unverified. No production migration, data, customer message, deployment, or migration/seed build wrapper was used.
