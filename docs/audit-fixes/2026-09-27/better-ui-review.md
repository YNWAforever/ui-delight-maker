# better-ui review — 2026-09-28

## Scope and source

User selected installation plus ClientOps UI review/fixes. Installed `jakubkrehel/skills/skills/better-ui` at upstream revision `267330e1adfc66a718fb65fa6918c1f06d0a689e` using the Codex skill installer. App baseline: main `868235bd64214df5101b77d28fc012659b8d5c82`; branch `codex/clientops-better-ui`.

Reviewed login shell/loading fallback, sidebar, sales table actions, filter toolbar, context panel, sticky action bar, loading/empty/error/freshness states, metric surfaces and shared motion tokens. This is bounded source review, not whole-app visual acceptance or role UAT.

## Motion restraint: persistent state feedback

| Severity | Location | Before | After | Why |
| --- | --- | --- | --- | --- |
| LOW | src/components/auth/login-auth-page.tsx:76 | Form loading uses pulsing placeholders and an accessible label, without visible loading copy. | Persistent Loading sign-in form text and status semantics accompany the existing placeholders. | Keeps loading intent explicit when motion is reduced or the form chunk loads slowly. |

Existing refresh states have persistent text or busy/disabled semantics; high-frequency table and filter actions have immediate feedback. Shared CSS already reduces animation and transition duration. Structural borders and current shadcn tokens are retained. No evidence justified radius, icon animation, theme or dependency changes in the inspected scope.

## Verification coverage

- Source: inspected loading/empty/error/refresh branches and hover/focus/active declarations in the scoped components. Native shadcn primitives were not edited.
- Browser rendering, responsive layout, actual hover/focus/active appearance, motion replay at 10% speed: **Not verified**. CUA failed twice during initialization; second attempt reported Windows sandbox apply-deny-read-ACL failure. No browser state or screenshot was returned. No agent-browser executable was available on PATH.
- Seven-role authenticated UI: **Not verified**; no sessions supplied. Component tests are not role UAT.
- Local full PostgreSQL suite: **blocked** by the previously recorded Docker engine failure; no restart authorization assumed from the better-ui selection.
- Test/build results and PR/commit are recorded in the follow-up below.

No HIGH finding was identified in inspected source. **Approve — scoped source polish only.** Browser and release acceptance remain unverified; production release is NO-GO.

## Local verification checkpoint

Code commit: `7bf3524`.

- Existing login and sales component suites: 12 files, 96 tests passed, zero skipped.
- `bun run typecheck`: passed.
- `bun run lint`: zero errors; one existing Fast Refresh warning in sales/data-table-shell.tsx:78.
- `bunx vite build`: client and SSR passed; existing large-chunk/dependency warnings remain. No migration or seed command was run.
- `git diff --check`: passed. Generated route-tree line-ending-only change restored after confirming no content diff.
- Vercel production build hold re-read from project metadata and confirmed active before PR publication.
- Exact-head remote PostgreSQL contract/replay and PR checks: pending at this checkpoint.
