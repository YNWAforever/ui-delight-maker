# Failed preview database investigation

Read-only follow-up on 2026-09-28. Status: blocked on historical target identity and database evidence. This report does not clear the production release gate.

## Verified source and deployment state

- Main is 9f37be20efbd764739592d3efed91fe51ad0f855 after PR #104. GitHub Checks and Database contract both passed; the recorded contract result is 2,172 tests with zero skipped, with separate isolated migration/seed replay passing.
- The production hold still reads back as `if [ "$VERCEL_ENV" = "production" ]; then exit 0; else exit 1; fi`.
- Production build dpl_sz1PVLKMHr38PkwDUBEFVJnRziVg at that main SHA is CANCELED. The latest READY production deployment remains dpl_BubNGhS2HFmmvjcUYfiKiasDwcLU at audited SHA 2904faa502f7494173f48f412875c1d0a3aba674.

## Vercel environment scope metadata

The project environment metadata has separate sensitive DATABASE_URL entries for preview and production. Neither entry has a branch-specific override. These separate configuration entries do not prove that their values refer to different database targets. No secret values were printed or used to connect to a database.

CLIENTOPS_SEED_ON_DEPLOY, CLIENTOPS_SEED_MODE, CLIENTOPS_SEED_TARGET and CLIENTOPS_SEED_TODAY each have preview and production entries. Their existence alone does not establish their values or the seed decision. The previous failed-preview log establishes that seed ran. Current metadata cannot independently establish the historical connection used by that deployment.

## Historical transaction boundaries

Source inspected at failed PR #102 preview commit 3476967923b6357bf2f9d51d96301c3cb8f6c2d9:

- package.json runs migration, schema verification, Vite, then seed-on-deploy as separate commands.
- scripts/clientops/seed-on-deploy.ts imports seed-smoke-data when the deployment seed decision permits it.
- scripts/clientops/seed-smoke-data.ts obtains one client, starts a transaction, calls seedAll, and commits on success. Its error handler attempts rollback and separately reports rollback failure.
- src/server/db/clientops-migrations.ts creates the migration ledger outside each migration transaction, then commits each migration and its ledger row independently.

Therefore a seed error is not proof that all earlier build database work was rolled back. The seed code contains a rollback path, but source inspection alone cannot attest to the database outcome. Earlier migration commits are outside that seed transaction. The scope and persistence of effects remain unverified.

## Evidence needed to close this blocker

1. Operator-confirmed Neon project, branch and database identity used by the failed preview, with the historical Vercel binding and its relationship to production. Supply non-secret IDs or a private local evidence path.
2. Retained database audit/transaction evidence or an isolated before/after copy covering the deployment window, including migration ledger and affected seed records.
3. Reconciliation of schema changes and seeded records on the isolated copy. Record unknowns explicitly if historical evidence is unavailable; do not infer a clean outcome from a failed build.

The available Neon connector is unscoped and requires a project ID. No confirmed target ID was supplied in this follow-up. No database query, migration, seed, provider call or customer message was executed during this investigation. T20 snapshots, seven-role UAT, provider sandbox, authenticated route timing and operator release gates remain blocked.
