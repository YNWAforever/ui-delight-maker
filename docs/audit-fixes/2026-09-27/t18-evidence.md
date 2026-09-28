# T18 Invitation and workspace access evidence

Branch: `codex/clientops-workspace-access`, stacked on T17 evidence commit `714d0f3`. Implementation commit: `b74a92d`; [draft PR #96](https://github.com/YNWAforever/ui-delight-maker/pull/96). No deployment, production data change, or customer message was performed.

## Positive behavior

- `resolveWorkspaceAccess()` distinguishes anonymous, active, invited, suspended, deactivated, and no-profile states using only the current Neon Auth identity. `getNeonAuthSession()` and `requireNeonAuthSession()` still grant workspace access only to active profiles.
- Both login routes load that state server-side. A signed-in identity without a profile sees administrator-invitation guidance instead of a redirect back to the login form; suspended and deactivated identities see denial guidance with sign-out.
- Normal login routes present sign-in only. Sign-up is offered only when a valid invitation landing route supplies the completion redirect. The copy no longer promises workspace access based on an email domain.
- Invitation tokens are hashed before lookup. The landing route distinguishes ready, expired, used, and unavailable tokens. Only a ready token reveals its invitation preview; there is no arbitrary-email lookup or fake resend control.
- Creation rejects invitations to an existing profile. Acceptance checks again inside the transaction before inserting, so a legacy or concurrent invitation cannot reactivate a suspended or deactivated account or replace an active account's role.

## Verification

| Check | Result |
|---|---|
| Red behavior | New workspace state tests initially failed because the component and resolver did not exist. Existing tests remained green. |
| Focused behavior | 6 files / 41 tests passed for workspace states, login routes, invite routes, account status and invitation repository. |
| Real isolated PostgreSQL | 2/2 integration tests passed on a fresh disposable `t18_workspace2_20260928` DB: two concurrent accept attempts produce one activation and one audit receipt; an expired token is distinguished; creation rejects an existing suspended account; a legacy pending token fails acceptance and rolls back without changing role/status. |
| Static/build | `bunx tsc --noEmit --pretty false`, changed-file ESLint, `git diff --cached --check`, and pure `bunx vite build` client/SSR passed. `bun run build` was not run because it includes migration and seed. |
| Role UI | **Blocked**: isolated signup/invite/active/suspended browser UAT needs authenticated Neon sessions for distinct accounts. No super_admin-only proxy was used. |

## Remaining gates

- Full suite on a fresh isolated database is scheduled for T22; no T18 full-suite result is claimed.
- No migration is required for T18. Production invitation data and status were not read or mutated.
- Authenticated role UI, preview checks, and release review remain external gates.

## PR #96 contract repair — 2026-09-28

- The old PR #96 contract run had three failures. Its Admin people raw key failure was fixed in green parent PR #95. The remaining two were reproduced locally: `getInvitationLandingState` and `getCurrentWorkspaceAccess` were not accounted for in the handler authorization contract, and `login` / `login.$authPath` were missing from the loader inventory.
- Read-only inspection confirmed the invitation endpoint validates and hashes the bearer token, discloses preview fields only for a ready matching invitation, and returns state-only results otherwise. The workspace endpoint accepts no subject parameter and returns only the requesting identity access state. Login loaders redirect active identities and reuse these server-side reads; T18 behavior tests cover states and redirects.
- Commit `a1e9ab2` records those explicit reasons and inventories the two public login loaders without removing assertions. The two tests were RED before and passed after; 3 related files/8 tests, TypeScript and changed-file lint passed. The inherited source-only Vercel build safety test also passed. Remote contract and preview results remain a separate gate; authenticated multi-account UAT remains blocked.
