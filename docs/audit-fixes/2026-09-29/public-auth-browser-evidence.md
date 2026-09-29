# Public auth browser evidence — 2026-09-29

This is anonymous candidate-preview evidence. It does not change the historical 751-case audit matrix, prove production behavior, or replace authenticated seven-role UAT.

| Stage | Exact preview `/api/build` SHA | Browser result |
| --- | --- | --- |
| Before | `d38badd68f4e3fea2df58738e89a02d5c2175024` | Clicking **Forgot your password?** navigated to `/login/forgot-password` but still rendered Email, Password and Login. [390px screenshot](evidence/public-auth/forgot-before-390.png). |
| After source fix | `9e96fa28f6584ae8499b9f9de53c6ba780419000` | The same link rendered only Email and **Send reset link**, with **Forgot Password** heading. [390px screenshot](evidence/public-auth/forgot-after-390.png). No email was entered or sent. |

The initial candidate sign-in page showed a **Skip to main content** link. Real Chromium `Tab` focused that link; `Enter` changed the URL hash to `#main-content` and focused `MAIN#main-content`. Its `document.documentElement.scrollWidth` equalled `innerWidth` at 390, 768, 1280 and 1440px. [390px](evidence/public-auth/login-390.png) and [1440px](evidence/public-auth/login-1440.png) screenshots were visually reviewed and committed. This is positive **candidate** evidence for `T-PUBLIC-SKIP`; the audit's production-public FAIL remains a historical baseline and production was not redeployed.

On the fixed `forgot-password` candidate, the email control is `type=email` and the action is **Send reset link**; the page had no horizontal overflow at 390, 768, 1280 and 1440px. This supplies candidate read/UI evidence for `T-PUBLIC-RESETEMAIL`. Provider send, token delivery, callback and password update were not run because there is no disposable provider sandbox. Direct `/login/reset-password` access without a valid token returned to sign-in; the token-bearing flow remains unverified. No signup permission was widened: a source regression asserts ordinary sign-up stays on sign-in with `signUp=false`.

The route regression was red before the source fix (2 of 5 tests failed) and green after it (5 of 5). TypeScript, changed-file ESLint, pure `bunx vite build` client/SSR and `git diff --check` passed. `bun run build` was not used. Authenticated shared shell at 390/768/1280/1440px, 200% browser zoom, screen-reader behavior, invitation dialog focus, seven role journeys and full provider recovery remain blocked or untested. No production data, migration, seed or customer message was touched.

## Candidate public input check at source-equivalent PR #119 preview

Protected preview `/api/build` SHA `df315f150f348271e2c537affdc1af50a5face78` uses the same app source as merged PR #118. Real Chromium keyboard typing entered disposable text into sign-in Email (`type=email`, 22 characters) and Password (`type=password`, 13 characters), and into forgot-password Email (`type=email`, 22 characters). The accessible tree named the fields and actions. Nothing was submitted, so provider validation, authentication, delivery and password update remain unverified. This is partial candidate input evidence for `T-PUBLIC-LOGINEMAIL`, `T-PUBLIC-LOGINPASSWORD` and `T-PUBLIC-RESETEMAIL`, not a production PASS.

Direct `/login/sign-up` displayed the sign-in Email/Password/Login UI and no Name, Create account or unnamed disabled button. That matches the source's invitation-only signup rule; the four old production-public signup/unnamed rows have no current anonymous control to test. Their authorized invitation flow needs a disposable invitation/session fixture. The forgot-password screen had no visible “Go back” or “Sign in” link after PR #118; `T-PUBLIC-BACK`, a PASS in the old production audit, needs a candidate recovery-navigation fix and browser retest. The browser session was closed after these read/input checks.

## Recovery back navigation after PR #120

Source commit `376d05ec35a7713110bdf262d270f241da318dbc` added an explicit **Back to sign in** link on forgot-password and reset-password views while leaving normal sign-in without a self-link. The exact-head protected preview `/api/build` matched that SHA. At 390px, the real Chromium focus order was Skip to main content → Email → Send reset link → Back to sign in; pressing `Enter` on the focused link returned to `/login/sign-in`, with the Email/Password/Login controls present. The recovery page had no horizontal overflow. [390px screenshot](evidence/public-auth/forgot-back-after-390.png). No email was entered or sent for this navigation test. This restores candidate navigation equivalent to historical `T-PUBLIC-BACK`; token-bearing reset and provider delivery remain blocked.

## Anonymous native 200% browser zoom — 2026-09-30

Source-equivalent protected PR #124 preview `/api/build` returned `589bf396ae1ade7b3241371535cd843d857c659d`; current main `d2b85119c0c9a514ffb3cc75694587fe13c99ad2` adds only the merge commit. The desktop browser helper failed to initialize, so this check used Node 24, pinned Playwright 1.63.0 and bundled Chromium 153.0.8010.12 in a disposable persistent profile.

Eight real page scenarios covered `/login/sign-in` and `/login/forgot-password`, each at outer content viewports 390/768/1280/1440 by 900 pixels. A temporary extension called native `chrome.tabs.setZoom(..., 2)`; `getZoom` returned 2, devicePixelRatio changed 1→2, and CSS viewport widths halved to 195/384/640/720. No CSS transform, page-scale emulation or synthetic fixture was used.

| Check | Observed candidate result |
| --- | --- |
| Horizontal reflow | 8/8: document/body scroll widths equalled the CSS viewport width. |
| Keyboard controls | 8/8: sequential Tab focus stayed within the visible viewport; vertical scrolling exposed lower controls on the narrow cases. |
| Skip link | 8/8: Tab then Enter focused `MAIN#main-content`. A tall main landmark need not fit wholly inside the viewport. |
| Sign-in order | Skip → Email → Forgot your password? → Password → Login. No form submission. |
| Recovery order and return | Skip → Email → Send reset link → Back to sign in; Enter on the back link returned to `/login/sign-in` at all four widths. |
| Fonts | The declared Plus Jakarta Sans faces were explicitly awaited after zoom; all 24 faces reported loaded in each final sample. This verifies loaded-font layout, not font-download performance. |

[Raw eight-case observations](evidence/public-auth/zoom-200-report.json) retain layout, native zoom, font status, focus geometry, scroll positions, skip targets and destinations. [390px focused recovery](evidence/public-auth/forgot-390-zoom200-focused.png) and [1440px sign-in](evidence/public-auth/login-1440-zoom200.png) were visually inspected. Full-page Playwright screenshots initially clipped under native zoom; the committed captures use Chromium `Page.captureScreenshot` with no clip and `captureBeyondViewport: false`.

The profile had no user login/session. Only GET/HEAD to this exact preview and GET font resources from Google Fonts were allowed; other methods/origins were rejected. The final report records zero blocked requests. The temporary preview token was passed in process memory and added only to same-origin requests, never committed or printed. No credentials were typed, form submitted, account created, email sent or production data changed.

This closes the anonymous candidate 200% zoom/keyboard subcheck only. Accessible-name snapshots are not screen-reader testing. Authenticated shell/dialog zoom, assistive-technology output, seven-role journeys, invite/token-bearing recovery, provider delivery and release acceptance remain blocked. Historical audit rows and their counts are unchanged.

Method references: [Playwright extensions](https://playwright.dev/docs/chrome-extensions), [Chrome native tab zoom API](https://developer.chrome.com/docs/extensions/reference/api/tabs#method-setZoom).
