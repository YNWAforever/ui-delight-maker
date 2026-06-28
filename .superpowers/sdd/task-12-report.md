# Task 12 Report

## Files changed

- Deleted `src/hooks/use-supabase-subscription.ts`
- Deleted `src/lib/supabase.client.ts`
- Deleted `src/lib/supabase.server.ts`
- Added `src/legacy-supabase/README.md`
- Added `src/legacy-supabase/server.ts`
- Updated `src/routes/agents.tsx`
- Updated `src/routes/approvals.tsx`
- Updated `src/routes/leads.$id.tsx`
- Updated `src/server-functions/accounts.ts`
- Updated `src/server-functions/automation-playbooks.ts`
- Updated `src/server-functions/campaigns.ts`
- Updated `src/server-functions/clients.ts`
- Updated `src/server-functions/contacts.ts`
- Updated `src/server-functions/customer-success.ts`
- Updated `src/server-functions/deals.ts`
- Updated `src/server-functions/engagement-events.ts`
- Updated `src/server-functions/projects.ts`

## What changed

- Removed the mini CRM browser-side Supabase runtime entirely by deleting the old subscription hook and the Supabase browser helper.
- Replaced realtime subscription usage in reachable mini CRM routes (`agents`, `approvals`, `leads.$id`) with explicit refresh actions plus existing router invalidation after mutations.
- Moved the remaining server-side Supabase helper into `src/legacy-supabase/server.ts` and repointed broader legacy server-functions there.
- Added `src/legacy-supabase/README.md` to document the quarantine boundary, the migrated paths that must remain Supabase-free, and why package removal is deferred.

## Scan summary

- Initial broad scan:
  - `rg -n "createSupabase|@supabase|SUPABASE|VITE_SUPABASE" src package.json`
  - Found only package entries, the old subscription hook/browser helper, and broader legacy server-functions.
- Post-change broad scan:
  - Remaining matches are limited to:
    - `package.json` dependency entries for `@supabase/ssr` and `@supabase/supabase-js`
    - `src/legacy-supabase/**`
    - Legacy server-functions that now import from `@/legacy-supabase/server`
- Targeted migrated-path scan:
  - `rg -n "createSupabase|@supabase|SUPABASE|VITE_SUPABASE" <migrated runtime paths>`
  - Returned no matches.

## Tests and commands

- `rg -n "createSupabase|@supabase|SUPABASE|VITE_SUPABASE" src package.json`
- `rg -n "createSupabase|@supabase|SUPABASE|VITE_SUPABASE" <migrated runtime paths>`
- `rg -n "@/lib/supabase.server|@/lib/supabase.client|use-supabase-subscription" src`
- `bun test src/lib/workflows/__tests__/payloads.test.ts src/lib/__tests__/pipeline.test.ts`
  - Passed: 15 tests across 2 files
- `bunx tsc --noEmit`
  - Fails due to pre-existing route nullability issues and legacy server-function serialization typing in broader legacy modules.
  - No new Supabase-cleanup-specific errors were introduced by the touched files.

## Commit

- Commit SHA: `07001be`

## Concerns

- `@supabase/ssr` and `@supabase/supabase-js` are still required for reachable legacy screens backed by non-migrated server-functions. Removing them in this phase would break TypeScript/build.
- Repo-wide TypeScript is still red from inherited issues in legacy routes and server-functions outside the migrated mini CRM runtime.
