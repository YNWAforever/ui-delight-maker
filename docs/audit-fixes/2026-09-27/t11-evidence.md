# T11 approval, run recovery, and manual message handoff

Scope: CO-12 and CO-13. Branch: codex/clientops-agent-recovery, stacked on T10. Code commit: 6dd4b81. Draft PR: https://github.com/YNWAforever/ui-delight-maker/pull/89. Audit baseline: 2904faa502f7494173f48f412875c1d0a3aba674.

## Baseline and red evidence

The new PostgreSQL integration file first failed collection because claimApprovalCommand and recoverAgentRunCommand did not exist. The initial approval route tests also found the old confirmation copy claimed the agent would proceed after a message approval. A retry linkage test then failed with CONFLICT before the two-stage retry marker and new-attempt link were implemented. The eight audit probes remain old-defect evidence, not release gates.

## Change

- Migration 015 adds run outcome and attempt metadata, retry ancestry, recovery reasons, and a separate manual message handoff record. Its activity log constraint retains every previously accepted object type while adding agent_run.
- An unassigned approval may be claimed only after a manager's scope is proven from its linked waiting run's subject owner. Missing owner, stale run, explicit denial, and concurrent claim attempts fail closed. The inbox shows only scoped claimable rows and strips raw context data.
- A reasoned recovery closes a local running or waiting run and its linked open approval in one PostgreSQL transaction, including receipt and audit. Expire and retry require the one-hour threshold; cancel is immediate. A run with an open approval cannot request retry until that review is resolved. Recovery does not cancel an external provider job and never sends a customer message.
- A retry request leaves a terminal marker. Existing authorized dispatch later creates a new attempt with a fresh attempt ID and retry_of link; the old run becomes superseded. A late callback cannot rewrite a terminal run. Callback writebacks use a transaction, so any proposed approval or notification rolls back with the refused terminal update.
- Approving a message draft creates awaiting_manual_send in the same decision transaction. The operator can copy the approved draft and record a manual reference, actor, and time; the status becomes manual_send_recorded. Both the Approvals workbench and AI Review state that this is an operator statement, not delivery confirmation.

## Verification

- Fresh dedicated PostgreSQL database inside the disposable audit container: T11 integration tests 9/9 passed. Cases cover manager scope and unknown ownership, two-reviewer race, same-key receipt replay, SQL-trigger rollback of run/approval/audit/receipt, expiry and late callback, full callback rollback, retry ancestry, and manual handoff replay.
- Focused approval, agent writeback, and UI suite: 6 files, 79/79 passed. Five compatibility files affected by new migration/projection/authorization contracts were updated and rerun: 54/54 passed. AI Review and Approvals route tests after final handoff wording: 27/27 passed.
- Full suite on disposable PostgreSQL: 285/285 files and 2,049/2,049 tests passed. The later cross-operator retry ancestry and AI Review copy changes passed a focused 4-file, 48-test PostgreSQL/UI/contract rerun. Final TypeScript, changed-file ESLint, and pure client/SSR Vite build passed. The build wrapper was not used because it also migrates and seeds.
- No authenticated role sessions were available for manager/sales/client-success browser UAT. No provider callback verification, external send, production migration, seed, or deployment was performed.

## Remaining gates

CO-12 and CO-13 remain in_progress until authenticated role UI smoke. Manual send recording is not a platform delivery receipt. A request to retry an open approval returns a conflict; the operator must first resolve that approval and verify the external outcome. No automatic external retry was added.
