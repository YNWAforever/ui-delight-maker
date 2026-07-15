# Task 4 Report: Invitation-Only Activation

## Delivered

- Added SHA-256-only invitation token persistence with normalized emails, seven-day expiry, duplicate-pending protection, one-time acceptance, role/profile activation, initial team memberships, and atomic audit logging.
- Added secure token rotation for resend plus target-aware lookup for resend and revoke authorization.
- Added n8n invitation delivery with an explicit missing-webhook fallback that preserves the copy-link workflow.
- Added database-backed `requireCapability` and `requireAnyCapability` orchestration early from Task 5 because Task 4 depends on the real authorization boundary.
- Added invitation server functions for batch invite, safe preview, acceptance, resend, and revoke.
- Added hierarchy rules: only Super Admin can invite Super Admin; managers can invite operational roles within database-derived scope.
- Added public `/invite/$token` and `/invite/$token/complete` routes, redirect-aware Neon Auth UI, clear non-sensitive error states, and post-activation redirect to `/account?welcome=1`.
- Generated and committed the TanStack route tree.

## TDD Evidence

- Repository RED: missing `admin-invitations` module.
- Resend RED: `repo.resendInvitation is not a function`.
- Target lookup RED: `repo.getInvitationById is not a function`.
- Policy RED: manager `users.invite` evaluated false.
- Server-function RED: missing `server-functions/admin-invitations`.
- UI RED: invite paths were private, login redirect stayed `/`, and invite route modules were missing.

## Verification

- Focused Task 4 before review: 8 files, 49 tests passed.
- Focused review regressions: 3 files, 35 tests passed.
- Final full suite: 97 files passed, 1 skipped; 517 tests passed, 1 skipped.
- Full ESLint: 0 errors, 24 pre-existing Fast Refresh warnings.
- Direct Vite development build: client and SSR builds passed; invite route chunks generated.
- TypeScript: Task 4 and generated routes are clean. The only remaining errors are the two known baseline errors in `src/lib/__tests__/eslint-config.test.ts` (missing declaration for `eslint.config.js` and implicit `any` for `entry`).

## Commits

- `3f1d71b` feat: add invitation email adapter
- `d12da09` feat: add invitation repository
- `8d649de` feat: add admin authorization orchestration
- `2276629` feat: add invitation administration APIs
- `1e334e4` feat: add invitation-only account activation
- `9705e44` test: stabilize invitation route coverage
- `9e041dc` fix: enforce complete manager invitation scope

## Independent Review

- Initial focused review found two Important manager-scope gaps: only the first assigned team was authorized, and an omitted manager could be authorized as actor-owned while persisting null.
- Fixes authorize every assigned and stored team, persist the actor as manager when a manager invite omits one, and deny legacy unscoped stored invitations to managers.
- Re-review verdict: APPROVED with no Critical, Important, or Minor findings.