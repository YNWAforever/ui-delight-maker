I have everything verified.

# Build & Test Configuration — Fimmick ClientOps

All claims below come from files opened at `C:/Users/laich/Documents/FIMMICK ClientOps/ui-delight-maker`.

## Scripts

Source: `package.json` (`"name": "tanstack_start_ts"`, `"type": "module"`, `"private": true`, `"sideEffects": false`).

| Name | Command (verbatim) | What it actually runs | Needs DB / network? |
|---|---|---|---|
| `dev` | `vite dev` | Vite dev server via `vite.config.ts`. Lovable wrapper forces `server.host: "::"`, `server.port: 8080`. | No (pages hitting server functions will need `DATABASE_URL` at request time) |
| `build` | `bun run clientops:migrate-schema && bun run clientops:verify-schema && vite build && bun scripts/clientops/seed-on-deploy.ts` | 4 phases: apply migrations → verify schema contract → Vite build → conditional seed. | **Yes — DB.** `clientops:verify-schema` throws `"DATABASE_URL is required for schema verification"` if unset, so `build` cannot complete without a reachable Postgres. |
| `build:dev` | `vite build --mode development` | Production build in `mode=development`; the wrapper adds `environments.client.define["process.env.NODE_ENV"]="development"`, `esbuild.keepNames`, and the `@tanstack/devtools-vite` plugin. No migrate/verify/seed steps. | No |
| `clientops:backfill-accounts` | `bun scripts/clientops/backfill-accounts.ts` | Reads `clients` where `account_id is null` and reports, per client, whether it would create an account from that client's own fields or match a pre-existing account on `lower(name) = lower(company_name)` (uses `src/server/db/neon.server` `query`/`queryOne`/`transaction`). **Dry run — writes nothing as invoked here.** `--apply` performs the *creates only*, in one transaction; proposed matches are reported for human review and not performed, because matching is inference by company name. `--apply --confirm-matches` also performs the matches. Every performed link writes an `activity_logs` row recording the client, the account, and whether it was `created` or `matched`. | **Yes — DB (read-only without `--apply`)** |
| `clientops:migrate-schema` | `bun scripts/clientops/apply-client-relationship-schema.ts` | `getClientOpsSchemaMigrationDecision(process.env)`; **skips with `reason: "DATABASE_URL is not set"`** when unset, otherwise reads SQL files and applies via `@neondatabase/serverless` `Pool`. | **Yes — DB (DDL), conditional** |
| `clientops:migrate-relationship-schema` | `bun scripts/clientops/apply-client-relationship-schema.ts` | Duplicate alias of `clientops:migrate-schema` — identical target file. | Same as above |
| `clientops:verify-schema` | `bun scripts/clientops/verify-clientops-schema.ts` | Hard-requires `DATABASE_URL` (throws otherwise); opens a `Pool`, runs `verifyClientOpsDatabase`, prints JSON, `exitCode = 1` if not ready. | **Yes — DB (required, read)** |
| `clientops:relationship-signals` | `bun scripts/clientops/generate-relationship-signals.ts` | Loads accounts/products/contacts/engagements/quotes/campaign members, builds signals, `upsertRelationshipSignals`. Writes. | **Yes — DB (writes)** |
| `performance:bundles` | `bun scripts/clientops/check-route-bundles.ts` | Pure filesystem: reads the Vite `manifest`, measures per-route chunk bytes vs `ROUTE_PERFORMANCE_BUDGET`. No `Pool`, no `fetch`. **Requires a prior `vite build`** (manifest must exist). | No |
| `performance:routes` | `bun scripts/clientops/measure-route-performance.ts --mode=baseline` | Pure computation over `ROUTE_FIXTURES` × `ROUTE_BROWSER_SCENARIOS`; no `Pool`/`fetch`/`process.env` reads found. | No |
| `performance:routes:verify` | `bun scripts/clientops/measure-route-performance.ts --mode=verify` | Same script, `verify` mode. | No |
| `performance:verify` | `bun run performance:routes:verify && bun run performance:bundles` | Chains the two above. | No (but needs build output for the bundle half) |
| `test:database-contract` | `bunx vitest run src/server/db/__tests__/clientops-schema.integration.test.ts` | Single file. Its only `it` is `it.runIf(Boolean(process.env.DATABASE_TEST_URL))` — **self-skips** without `DATABASE_TEST_URL`; otherwise connects with `pg` `Pool`, runs migrations, asserts `readiness.ready`. | **Yes — DB when `DATABASE_TEST_URL` is set; otherwise skips** |
| `preview` | `vite preview` | Serves the built output. | No |
| `lint` | `eslint .` | Flat config `eslint.config.js`. | No |
| `typecheck` | `tsc --noEmit` | Uses `tsconfig.json`. | No |
| `test` | `vitest run` | Full suite per `vitest.config.ts`. | No by default (DB-touching tests self-skip on missing `DATABASE_TEST_URL`) |
| `format` | `prettier --write .` | Honors `.prettierignore`. | No |

Not a package script but part of deploy: `vercel.json` = `{"buildCommand": "bun run build && node scripts/vercel-build.mjs"}`. `scripts/vercel-build.mjs` copies `dist/client → .vercel/output/static`, patches `dist/server/server.js` (adds a `.validator()` alias for `.inputValidator()`, and **throws** `"[vercel-build] Could not find a known createServerFn validator shape"` if neither the legacy nor the current shape is present), bundles the SSR entry to `server.cjs` with local `esbuild` (`--bundle --platform=node --format=cjs`), writes a `(req,res)` handler + `.vc-config.json` (`runtime: "nodejs22.x"`, `launcherType: "Nodejs"`), and a v3 `config.json` with immutable caching on `/assets/(.+)` and catch-all `/(.*) → /index`.

`bunfig.toml` (affects installs): `[install] minimumReleaseAge = 86400`, `minimumReleaseAgeExcludes = ["@lovable.dev/vite-tanstack-config"]`.

## Router plugin configuration

`vite.config.ts` does **not** import `@tanstack/router-plugin` directly. It imports `defineConfig` from `@lovable.dev/vite-tanstack-config` (v2.7.1), which composes every plugin internally.

Repository `vite.config.ts` contents:
- `vite.build.manifest: true`
- `vite.build.rollupOptions.output.manualChunks: clientopsVendorChunk` — a local function returning `"vendor-charts"` for `/src/components/reports/report-charts.tsx`, `/node_modules/recharts/`, `/node_modules/d3-`, `/node_modules/victory-vendor/`; `undefined` otherwise. It normalizes `\` → `/` first (Windows-safe).
- `vite.build.rollupOptions.output.onlyExplicitManualChunks: true`
- `nitro: false`
- `tanstackStart: { server: { preset: "vercel" } }`

Plugins the wrapper injects, in order (from `node_modules/@lovable.dev/vite-tanstack-config/dist/index.js`):
1. `tailwindcss()` — `@tailwindcss/vite`, no options
2. `tsConfigPaths({ projects: ["./tsconfig.json"] })`
3. `devServerFnErrorLogger()` (unless `serverFnErrorLogger: false`)
4. `devSsrErrorLogger()` (unless `ssrErrorLogger: false`)
5. `lovableBuildErrorDiagnostics()` — only when `command === "build"` **and** in a Lovable sandbox
6. `tanstackStart(tanstackStartOptions)` — see below
7. nitro — **skipped**, because `nitro: false` short-circuits `shouldRunNitro`
8. `viteReact(undefined)` — `@vitejs/plugin-react`, no options passed
9. `hmrGatePlugin` — serve only, and only in sandbox (or if `hmrGate` truthy); not active here
10. `devServerBridgePlugin()` — serve + sandbox only
11. `lovableAssetsProxyPlugin()` — `command === "serve"` only; no-op unless `LOVABLE_PREVIEW_HOST` is set
12. `devtools({ logging:false, eventBusConfig:{enabled:false}, enhancedLogs:{enabled:false}, consolePiping:{enabled:false}, removeDevtoolsOnBuild:false, injectSource:{enabled:true} })` — `mode === "development"` only
13. `componentTagger({ jsxSource: true })` — `serve` + `mode === "development"` only

Non-plugin config the wrapper also forces: `css.transformer: "lightningcss"`; `resolve.alias["@"] = ${process.cwd()}/src`; `resolve.dedupe: ["react","react-dom","react/jsx-runtime","react/jsx-dev-runtime","@tanstack/react-query","@tanstack/query-core"]`; `optimizeDeps.include: ["react","react-dom","react-dom/client","react/jsx-runtime","react/jsx-dev-runtime"]` with `ignoreOutdatedRequests: true`; `define` populated from `loadEnv(mode, cwd, "VITE_")` as `import.meta.env.<KEY>`; `server: { host: "::", port: 8080 }`.

**Options actually reaching `tanstackStart()`** = `mergeConfig(defaults, { server: { preset: "vercel" } })`, where the wrapper's defaults are:
```
importProtection: {
  behavior: "error",
  client: { files: ["**/server/**"], specifiers: ["server-only"] }
}
```
So client-side imports of anything under `**/server/**` or the `server-only` specifier are a hard build error.

**Resolved route-generation options (all defaults — nothing overrides them):**

| Option | Value | Where it comes from |
|---|---|---|
| `routeFileIgnorePrefix` | `"-"` | `@tanstack/router-generator/dist/esm/config.js:23` default; not overridden anywhere |
| `routeFileIgnorePattern` | **absent** (`undefined`) | `config.js:24`, `z.string().optional()` with no default |
| `routesDirectory` | `<root>/src/routes` | `@tanstack/start-plugin-core/dist/esm/schema.js:48` — `path.resolve(root, srcDirectory, rawRouterOptions.routesDirectory ?? "routes")`, `srcDirectory` default `"src"` |
| `generatedRouteTree` | `<root>/src/routeTree.gen.ts` | `schema.js:49` — `?? "routeTree.gen.ts"` |
| `autoCodeSplitting` | `true` (forced) | `schema.js:6` — omitted from the user-configurable `tsrConfig` |
| `indexToken` / `routeToken` | `"index"` / `"route"` | `config.js:34-35` defaults |
| `quoteStyle` / `semicolons` | `"single"` / `false` | `config.js:26-27` defaults |
| `enableRouteTreeFormatting` | `true` | `config.js:51` default |
| `target` | set to the core plugin's `framework` | `schema.js` `parseStartConfig` |
| `verboseFileRoutes` | not set in this repo | no `router` key is passed at all |

There is **no `tsr.config.json`** in the repo.

Two consequences that constrain new code:
- Files/dirs in `src/routes/` starting with `-` are excluded from route generation (`getRouteNodes.js:24`). This is exactly why every colocated test in `src/routes/__tests__/` is named `-account-workspace-loading.test.tsx`, `-tasks.test.tsx`, etc. The one exception, `src/routes/__tests__/route-query-keys.test.ts`, is *not* `-`-prefixed; it is excluded only because it exports no `Route`, which makes the generator log a `"does not export a Route"` warning (`generator.js:518-534`) rather than silently ignore it. Any new non-route file placed under `src/routes/` must carry the `-` prefix.
- `tanstackStart.server.preset` in `vite.config.ts` is **not a recognized option**. The Start `server` schema (`schema.js:151-161`) accepts only `entry` and `build`; the object is a plain `z.object` (no `.strict()`/`.passthrough()`/`.catchall()`), so zod strips `preset`, and grepping `@tanstack/start-plugin-core` + `@tanstack/react-start` finds no vite-path `preset` handling. Vercel targeting is achieved by `nitro: false` plus `scripts/vercel-build.mjs`, not by this key.

## Vitest configuration

`vitest.config.ts` — a **standalone** `defineConfig` from `vitest/config`. It does **not** import `vite.config.ts`, so none of the plugins above (React plugin, Tailwind, tsconfig-paths, TanStack Start, import protection) apply during tests.

- `test.environment`: `"node"`
- `test.include`: `["src/**/*.test.ts", "src/**/*.test.tsx", "scripts/**/*.test.ts"]` — note `scripts/**/*.test.tsx` is **not** included (currently moot: 0 such files; the only scripts test is `scripts/clientops/__tests__/check-route-bundles.test.ts`)
- `test.exclude`: **absent** — Vitest defaults apply
- `test.setupFiles`: **absent** — no global setup, no `@testing-library/jest-dom` (not a dependency), no automatic RTL `cleanup`; tests import `cleanup` themselves
- `test.globals`: **absent** — `describe`/`it`/`expect` must be imported from `"vitest"`
- `test.coverage`, `test.pool`, `test.reporters`, workspace/projects config: **absent**. No `vitest.workspace.*` and no `vitest.setup.*` file exists at the repo root.
- `resolve.alias`: `{ "@": resolve(__dirname, "src") }` — the `@` alias is re-declared here manually because `vite-tsconfig-paths` is not loaded
- `plugins`: **absent**

Because the global environment is `node`, DOM tests opt in per file with the docblock `// @vitest-environment jsdom` (26 files under `src/` carry it, e.g. `src/routes/__tests__/-tasks.test.tsx:1`). `jsdom` `^29.1.1` is a devDependency. Total test files matched by the include globs: 169.

## TypeScript paths

`tsconfig.json`:
- `include`: `["src/**/*.ts", "src/**/*.tsx", "vite.config.ts", "eslint.config.js"]` — **`scripts/**` and `vitest.config.ts` are not included**, so `bun run typecheck` does not check them
- `paths`: `{ "@/*": ["./src/*"] }` — the only alias. No `baseUrl` is set (works because `paths` are relative in TS 5.x)
- `target`: `ES2022`; `module`: `ESNext`; `moduleResolution`: `"Bundler"`; `lib`: `["ES2022","DOM","DOM.Iterable"]`; `types`: `["vite/client"]`; `jsx`: `"react-jsx"`

Strictness:
- `strict: true`
- `noUncheckedSideEffectImports: true`
- `noFallthroughCasesInSwitch: true`
- `noUnusedLocals: false`, `noUnusedParameters: false` (deliberately off)
- `skipLibCheck: true`, `allowJs: true`, `allowImportingTsExtensions: true`, `verbatimModuleSyntax: false`, `noEmit: true`
- `noUncheckedIndexedAccess`: **absent**; `exactOptionalPropertyTypes`: **absent**

## Lint rules that constrain new code

`eslint.config.js` — flat config via `tseslint.config(...)`.

Ignores: `["dist/**", ".output/**", ".vinxi/**", ".tmp/**", ".worktrees/**"]`. Note `src/routeTree.gen.ts` is **not** in the ignore list; it protects itself with a leading `/* eslint-disable */` and `// @ts-nocheck`.

Main block applies to `files: ["**/*.{ts,tsx}"]`, `languageOptions: { ecmaVersion: 2020, globals: globals.browser }`, extending `js.configs.recommended` + `...tseslint.configs.recommended`.

Explicit rules in the repo config:
- `no-restricted-imports: ["error", { paths: [{ name: "server-only", message: "TanStack Start does not use the Next.js `server-only` package. Rename the module to `*.server.ts` or mark it with `@tanstack/react-start/server-only`." }] }]` — **importing `server-only` is a lint error**; the convention is `*.server.ts`
- `react-refresh/only-export-components: ["warn", { allowConstantExport: true }]` — mixing non-component exports into a component module warns (constants are allowed)
- `@typescript-eslint/no-unused-vars: "off"` — **explicitly disabled**, overriding the recommended `"error"`
- spread of `reactHooks.configs.recommended.rules` (eslint-plugin-react-hooks 5.2.0) → `react-hooks/rules-of-hooks: "error"`, **`react-hooks/exhaustive-deps: "warn"`**

Inherited from `tseslint.configs.recommended` (all `"error"`, verified in `@typescript-eslint/eslint-plugin/dist/configs/eslintrc/recommended.js`):
`@typescript-eslint/no-explicit-any` (**any is banned**), `ban-ts-comment`, `no-array-constructor`, `no-duplicate-enum-values`, `no-empty-object-type`, `no-extra-non-null-assertion`, `no-misused-new`, `no-namespace`, `no-non-null-asserted-optional-chain`, `no-require-imports`, `no-this-alias`, `no-unnecessary-type-constraint`, `no-unsafe-declaration-merging`, `no-unsafe-function-type`, `no-unused-expressions`, `no-wrapper-object-types`, `prefer-as-const`, `prefer-namespace-keyword`, `triple-slash-reference`. No type-checked (`recommended-type-checked`) config is enabled, so type-aware rules are off.

Prettier integration: `eslintPluginPrettier` (`eslint-plugin-prettier/recommended`) is the **last** entry and carries **no `files` restriction**, so it applies to every linted file. It sets `prettier/prettier: "error"` and merges in all of `eslint-config-prettier` + `eslint-config-prettier/prettier` disables. **Formatting violations fail `bun run lint`.**

`.prettierrc`: `{ "printWidth": 100, "semi": true, "singleQuote": false, "endOfLine": "auto", "trailingComma": "all" }`.
`.prettierignore`: `node_modules`, `dist`, `.output`, `.vinxi`, `.tmp`, `.worktrees`, `pnpm-lock.yaml`, `package-lock.json`, `bun.lock`, `routeTree.gen.ts`.

## shadcn config

`components.json`:
- `$schema`: `https://ui.shadcn.com/schema.json`
- `style`: `"new-york"`
- `rsc`: `false`, `tsx`: `true`, `rtl`: `false`
- `tailwind`: `{ css: "src/styles.css", baseColor: "slate", cssVariables: true, prefix: "" }`
- `iconLibrary`: `"lucide"` (`lucide-react ^0.575.0`)
- `aliases`: `components → @/components`, `utils → @/lib/utils`, `ui → @/components/ui`, `lib → @/lib`, `hooks → @/hooks`
- `registries`: `{}` (empty)

Tailwind is v4 (`tailwindcss ^4.2.1` + `@tailwindcss/vite ^4.2.1`); there is **no `tailwind.config.*`** — theme lives in `src/styles.css`.

## CI workflows

Two workflows, both `on: pull_request` only (no `push`, no `workflow_dispatch`), both with `permissions: contents: read`.

**`.github/workflows/checks.yml`** — name `Checks`, job `static` ("Types and lint"), `ubuntu-latest`:
`actions/checkout@v4` → `oven-sh/setup-bun@v2` → `bun install --frozen-lockfile` → `bun run typecheck` → `bun run lint`. No database.

**`.github/workflows/database-contract.yml`** — name `Database contract`, job `contract`, `ubuntu-latest`:
- Service container `postgres`: image `pgvector/pgvector:pg17`, env `POSTGRES_USER=clientops`, `POSTGRES_PASSWORD=clientops`, `POSTGRES_DB=clientops_test`, port `5432:5432`, healthcheck `pg_isready -U clientops` (interval 10s, timeout 5s, 5 retries)
- Job env: `DATABASE_TEST_URL: postgres://clientops:clientops@localhost:5432/clientops_test`
- Steps: `actions/checkout@v4` → `oven-sh/setup-bun@v2` → `bun install --frozen-lockfile` → **`bun run test`** (the whole suite, not just the contract file — with `DATABASE_TEST_URL` set, the `it.runIf` integration tests execute here instead of self-skipping)

Notably **absent from CI**: `bun run build`, `bun run format --check`, and the `performance:*` scripts.

## Environment variable names

Names only, no values.

`.env.example` (28 names, in file order):
`APP_BASE_URL`, `DATABASE_URL`, `NEON_AUTH_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `N8N_QUALIFY_LEAD_WEBHOOK_URL`, `N8N_DRAFT_REPLY_WEBHOOK_URL`, `N8N_DRAFT_QUOTE_WEBHOOK_URL`, `N8N_SCORE_RENEWAL_RISK_WEBHOOK_URL`, `N8N_RELATIONSHIP_INTELLIGENCE_WEBHOOK_URL`, `N8N_USER_INVITATION_WEBHOOK_URL`, `N8N_WORKFLOW_TOKEN`, `N8N_API_BASE_URL`, `N8N_API_KEY`, `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, `CLIENTOPS_ALLOW_STAGING_SEED`, `CLIENTOPS_SEED_ON_DEPLOY`, `CLIENTOPS_SEED_MODE`, `CLIENTOPS_SEED_TARGET`, `CLIENTOPS_DESTRUCTIVE_RESET`, `CLIENTOPS_SEED_TODAY`, `CLIENTOPS_SMOKE_PROFILE_ID`, `CLIENTOPS_SMOKE_PROFILE_EMAIL`, `CLIENTOPS_SMOKE_PROFILE_NAME`, `CLIENTOPS_BOOTSTRAP_SUPER_ADMIN_EMAIL`

`.env.local.example` — same set plus one commented-out entry:
`APP_BASE_URL`, `DATABASE_URL`, `NEON_AUTH_URL`, `VITE_NEON_AUTH_URL` *(commented out; the only `VITE_`-prefixed — i.e. client-exposed — name anywhere in either file)*, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `N8N_QUALIFY_LEAD_WEBHOOK_URL`, `N8N_DRAFT_REPLY_WEBHOOK_URL`, `N8N_DRAFT_QUOTE_WEBHOOK_URL`, `N8N_SCORE_RENEWAL_RISK_WEBHOOK_URL`, `N8N_RELATIONSHIP_INTELLIGENCE_WEBHOOK_URL`, `N8N_WORKFLOW_TOKEN`, `N8N_API_BASE_URL`, `N8N_API_KEY`, `OPENROUTER_API_KEY`, `OPENROUTER_MODEL`, `CLIENTOPS_ALLOW_STAGING_SEED`, `CLIENTOPS_SEED_ON_DEPLOY`, `CLIENTOPS_SEED_MODE`, `CLIENTOPS_SEED_TARGET`, `CLIENTOPS_DESTRUCTIVE_RESET`, `CLIENTOPS_SEED_TODAY`, `CLIENTOPS_SMOKE_PROFILE_ID`, `CLIENTOPS_SMOKE_PROFILE_EMAIL`, `CLIENTOPS_SMOKE_PROFILE_NAME`, `N8N_USER_INVITATION_WEBHOOK_URL`, `CLIENTOPS_BOOTSTRAP_SUPER_ADMIN_EMAIL`

Additional variable names referenced by code/CI but **not** present in either example file: `DATABASE_TEST_URL` (`.github/workflows/database-contract.yml`, `src/server/db/__tests__/clientops-schema.integration.test.ts`), `LOVABLE_PREVIEW_HOST` (`lovableAssetsProxyPlugin`), `NITRO_PRESET` (documented in the wrapper's types; inert here since `nitro: false`).

`.env`, `.env.*`, `.env.local`, and `.env*.local` are gitignored with explicit negations for `!.env.example` and `!.env.local.example`. The `.env` line is called out in `.gitignore` because `.env*.local` does not match it. Also present at root: `.neon` (tracked, contains a Neon `projectId`, `orgId`, and `branch: "production"` — no credentials).