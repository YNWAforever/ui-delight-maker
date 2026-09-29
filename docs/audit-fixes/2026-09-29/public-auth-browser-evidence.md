# Public auth browser evidence — 2026-09-29

This is anonymous candidate-preview evidence. It does not change the historical 751-case audit matrix, prove production behavior, or replace authenticated seven-role UAT.

| Stage | Exact preview `/api/build` SHA | Browser result |
| --- | --- | --- |
| Before | `d38badd68f4e3fea2df58738e89a02d5c2175024` | Clicking **Forgot your password?** navigated to `/login/forgot-password` but still rendered Email, Password and Login. [390px screenshot](evidence/public-auth/forgot-before-390.png). |
| After source fix | `9e96fa28f6584ae8499b9f9de53c6ba780419000` | The same link rendered only Email and **Send reset link**, with **Forgot Password** heading. [390px screenshot](evidence/public-auth/forgot-after-390.png). No email was entered or sent. |

The initial candidate sign-in page showed a **Skip to main content** link. Real Chromium `Tab` focused that link; `Enter` changed the URL hash to `#main-content` and focused `MAIN#main-content`. Its `document.documentElement.scrollWidth` equalled `innerWidth` at 390, 768, 1280 and 1440px. [390px](evidence/public-auth/login-390.png) and [1440px](evidence/public-auth/login-1440.png) screenshots were visually reviewed and committed. This is positive **candidate** evidence for `T-PUBLIC-SKIP`; the audit's production-public FAIL remains a historical baseline and production was not redeployed.

On the fixed `forgot-password` candidate, the email control is `type=email` and the action is **Send reset link**; the page had no horizontal overflow at 390, 768, 1280 and 1440px. This supplies candidate read/UI evidence for `T-PUBLIC-RESETEMAIL`. Provider send, token delivery, callback and password update were not run because there is no disposable provider sandbox. Direct `/login/reset-password` access without a valid token returned to sign-in; the token-bearing flow remains unverified. No signup permission was widened: a source regression asserts ordinary sign-up stays on sign-in with `signUp=false`.

The route regression was red before the source fix (2 of 5 tests failed) and green after it (5 of 5). TypeScript, changed-file ESLint, pure `bunx vite build` client/SSR and `git diff --check` passed. `bun run build` was not used. Authenticated shared shell at 390/768/1280/1440px, 200% browser zoom, screen-reader behavior, invitation dialog focus, seven role journeys and full provider recovery remain blocked or untested. No production data, migration, seed or customer message was touched.
