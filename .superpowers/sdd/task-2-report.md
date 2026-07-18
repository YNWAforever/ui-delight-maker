# Task 2 Report: Roles, Capabilities, Scope, and Typed Errors

## Status

DONE.

## Commands and Results

- RED: `bunx vitest run src/lib/admin/__tests__/policy.test.ts` failed because the admin domain modules did not exist.
- GREEN: the focused suite passed: 1 file, 16 tests.
- Focused formatting and lint passed for `src/lib/admin`.
- Full suite passed: 90 files passed, 1 skipped; 473 tests passed, 1 skipped.
- TypeScript still exits non-zero on the two documented baseline errors in `src/lib/__tests__/eslint-config.test.ts`; the earlier combined verification reported no Task 2 TypeScript errors.
- `git diff --check` passed.

## Files

- `src/lib/admin/types.ts`
- `src/lib/admin/schemas.ts`
- `src/lib/admin/policy.ts`
- `src/lib/admin/errors.ts`
- `src/lib/admin/__tests__/policy.test.ts`

## Self-Review

- Roles and capabilities are centralized immutable contracts.
- Authorization is deny-by-default with inactive, protected-role, explicit-deny, explicit-allow, role-grant, and Manager-scope handling.
- Expired, revoked, and scope-mismatched overrides do not grant access.
- Zod schemas validate all Task 2 administrative boundaries and require meaningful reasons.
- No live database or external service was accessed.

## Concerns

- Role grants are intentionally conservative where the design describes broad authority rather than an explicit capability-by-capability matrix. Later server-action tasks should rely on these centralized grants rather than duplicate role checks.
## Review Fixes

The first completed review found a Critical cross-actor override flaw and requested stronger adversarial and full-matrix tests.

- Added `profileId` to the permission-override domain contract and required exact actor matching during evaluation.
- Invalid expiry timestamps now deny the override rather than becoming active through `NaN`.
- Added tests for cross-actor overrides, revoked overrides, malformed expiry, and explicit Manager allows before scope evaluation.
- Added an inline snapshot that locks the complete role-by-capability grant matrix.
- Focused suite: 1 file, 19 tests passed.
- Full suite: 90 files passed, 1 skipped; 476 tests passed, 1 skipped.
- Full lint: 0 errors and the same 24 existing Fast Refresh warnings.
### Final Review Fix

The re-review found that a Manager could omit `AuthorizationTarget.role` and bypass protected-role detection. Manager `users.manage` decisions now fail closed with `invalid_target` whenever a profile target lacks resolved role context, before permission overrides are evaluated.

- Adversarial RED reproduced the explicit-allow bypass.
- Focused GREEN: 1 file, 20 tests.
- Full suite: 90 files passed, 1 skipped; 477 tests passed, 1 skipped.