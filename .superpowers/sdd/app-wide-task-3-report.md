# App-Wide Task 3 Report

## Status

Implemented the reusable authenticated application shell boundary.

## Changes

- Added `loadAuthenticatedShell()` and the `AppShellRead` contract.
- Added `getAppShellRead()` as the protected root navigation server boundary.
- Updated the root route to cache the shell read with `crmQueryKeys.shell()` and `routeQueryOptions()` through the router QueryClient.
- Preserved redirect-compatible missing-session behavior and local best-effort handling for workspace preferences and admin navigation.
- Kept `/admin` authorization navigation and its forbidden redirect behavior unchanged.

## TDD Evidence

- RED: `bunx vitest run src/server/app-shell/__tests__/loaders.test.ts src/routes/__tests__/-root-shell.test.ts` failed because `src/server/app-shell/loaders.ts` did not exist.
- GREEN: `bunx vitest run src/server/app-shell/__tests__/loaders.test.ts src/routes/__tests__/-root-shell.test.ts src/routes/__tests__/-admin-route-access.test.tsx` passed: 3 files, 16 tests.

## Additional Verification

- `bun run lint` passed with 0 errors and the recorded 24 existing fast-refresh warnings.
- `bunx tsc --noEmit` reported only the two recorded baseline diagnostics in `src/lib/__tests__/eslint-config.test.ts`.
- The full suite was not rerun after the user interrupted it and directed focused verification only.

## Review

No Task 3 issues found in self-review. The unrelated `.superpowers/sdd/progress.md` modification is intentionally excluded from the commit.

## Security Follow-Up

Removed the exact user-scoped shell query at authentication identity boundaries. Successful sign-out evicts the shell before router invalidation and login navigation. The Neon Auth session-change callback evicts the shell before the provider navigates into protected routes, then awaits any caller callback. Public login routes are now inside the existing per-router QueryClient provider so this callback can access the same client.

### Changed Files

- `src/components/auth/neon-auth-provider.tsx`
- `src/routes/__root.tsx`
- `src/components/auth/__tests__/neon-auth-provider.test.tsx`
- `src/routes/__tests__/-root-shell-cache-security.test.ts`
- `src/routes/__tests__/-workspace-foundation-source.test.ts`

### Evidence

- RED: `bunx vitest run src/components/auth/__tests__/neon-auth-provider.test.tsx src/routes/__tests__/-root-shell-cache-security.test.ts src/server/app-shell/__tests__/loaders.test.ts src/routes/__tests__/-root-shell.test.ts src/routes/__tests__/-admin-route-access.test.tsx src/components/auth/__tests__/login-auth-page.test.tsx` failed with missing sign-out eviction and no provider eviction callback: 2 failed, 19 passed.
- GREEN: `bunx vitest run src/components/auth/__tests__/neon-auth-provider.test.tsx src/components/auth/__tests__/login-auth-page.test.tsx src/routes/__tests__/-root-shell-cache-security.test.ts src/server/app-shell/__tests__/loaders.test.ts src/routes/__tests__/-root-shell.test.ts src/routes/__tests__/-admin-route-access.test.tsx src/routes/__tests__/-workspace-foundation-source.test.ts src/server-functions/__tests__/auth.test.ts src/server-functions/__tests__/admin-users.test.ts` passed: 9 files, 35 tests.
- Full suite: `bun run test` was run once. It reported 2 failures before the focused source-contract correction: the stale root source assertion and a 5-second `admin-users` timeout. The corrected source test and `admin-users` test both pass in the focused GREEN command above. No second full-suite run was started to honor the one-run instruction.
