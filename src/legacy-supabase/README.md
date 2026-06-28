This directory quarantines Supabase runtime code that still supports broader legacy CRM modules.

Mini CRM runtime paths migrated in Tasks 1-11 must stay free of Supabase imports and env references:

- `src/routes/__root.tsx`
- `src/routes/login.tsx`
- `src/routes/index.tsx`
- `src/server-functions/auth.ts`
- `src/server-functions/pipeline.ts`
- `src/server-functions/leads.ts`
- `src/server-functions/tasks.ts`
- `src/server-functions/quotes.ts`
- `src/server-functions/approvals.ts`
- `src/server-functions/agent-runs.ts`
- `src/server/repositories/**`
- `src/lib/auth/**`
- `src/lib/workflows/**`

What remains here is intentionally out of scope for Task 12:

- Legacy server-functions for accounts, clients, contacts, campaigns, projects, deals,
  customer success, automation playbooks, and engagement events.

Why the packages are still installed:

- Those older modules are still reachable from the current app navigation.
- Removing `@supabase/ssr` and `@supabase/supabase-js` in this phase would break TypeScript/build
  for screens not yet migrated to Neon.

Exit criteria for deleting this folder:

1. Port the remaining legacy server-functions to Neon repositories.
2. Remove any route-level imports that depend on these helpers.
3. Remove the Supabase packages from `package.json`.
