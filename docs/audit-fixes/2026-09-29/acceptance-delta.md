# 2026-09-29 acceptance delta

This is a source and evidence checkpoint against the user-supplied `04_Functional_Test_Matrix.csv` at audit baseline `46dd6107e7c08582ae6b626f1af4afc1e451cdac`. It does not rewrite that historical matrix. Current merged source is main `8b6241376a5ca3f9af5c6a6157a351c83c6b64e4`. All 30 CO IDs remain in [status](../2026-09-27/status.md).

| Audit matrix state | Cases | Current interpretation |
| --- | ---: | --- |
| BLOCKED | 718 | Most need authenticated candidate roles and isolated journey data; 689 rows explicitly cite that blocker. Source/CI success cannot promote them to PASS. |
| FAIL | 4 | These were audit-baseline defect probes. Positive source regressions now pass, but real browser acceptance remains blocked below. |
| NOT_TESTED | 25 | Fourteen dynamic/reusable bindings need a semantic census, seven public input semantics were unobserved, and four viewport cases lack a working browser resize surface. |
| PASS | 4 | Public navigation only: forgot, back, signup and signin. These do not prove a business journey. |

| Audit-baseline failing case | Source correction | Current acceptance |
| --- | --- | --- |
| T-PUBLIC-SKIP | PR #111 added a focusable main target on public/auth/root fallback pages; positive component regression passed. | BLOCKED: actual keyboard/browser focus and responsive evidence. |
| T-AUD-INVITE-ESC | PR #111 moved invitation to Radix Dialog with Escape and focus-return behavior; positive component regression passed. | BLOCKED: independent browser keyboard and role session. |
| T-AUD-INVITE-FOCUS | PR #111 moved initial focus into the invitation dialog; positive component regression passed. | BLOCKED: independent browser focus trap and screen-reader evidence. |
| T-AUD-BULK-RECEIPT | PR #111 retains the same pending receipt/key on transient result-read failure and exposes Retry; positive component regression passed. | BLOCKED: real actor browser retry/offline/reconnect with independent result read. |

PR #115 and PR #116 added two further R04 People-directory fixes: a query refresh failure now has an error/retry state without a false zero count, and narrow cards open the existing full record instead of setting a hidden selection panel. Their respective exact-head real isolated PostgreSQL gates passed 2,187 and 2,188 tests, both with zero skipped. PR #116's protected preview `/api/build` matched head `a1741b3`; post-merge main Checks and Database contract passed 2,188 tests with zero skipped and two-run isolated migration/seed replay. This proves source and isolated database contracts, not seven-role UAT. The browser control surface failed to initialize with a Windows sandbox ACL error again, so no new viewport, keyboard screenshot or role assertion is claimed.

## Remaining required acceptance

| Package | Blocked proof |
| --- | --- |
| R00 / R04 / R08 | Seven distinct isolated role sessions and same-record fixtures; current [role UAT](../2026-09-27/uat-results.md) remains blocked, with 0/18 new-audit cross-role journeys verified. |
| R01 | Disposable compatibility rehearsal and record-level provenance/owner disposition for the four [historical anomalies](../2026-09-27/production-reconciliation-disposition.md). No historical value was inferred or repaired. |
| R02 / R03 | Real actor/browser recovery, focus, 390/768/1280/1440 viewports, 200% zoom and screen reader. |
| R05 | Authenticated upload→preview→commit→independent read→resume→download; real-source identity inventory and target-specific retention dry run. |
| R06 | Same-data/machine authenticated 10 cold and 30 warm browser navigations, request-scoped metrics, and full-route before/after. Existing [performance evidence](../2026-09-27/t19-evidence.md) is bundle plus isolated SQL components. |
| R07 | Isolated legacy and Neon snapshots for five-domain parity, provider sandbox receipts, callback recovery and scoped actor UI. |

The user-provided `C:\Users\laich\Documents\FIMMICK ClientOps` folder was inspected by names only: it contains two repository directories and no identifiable role-session, legacy/Neon snapshot, provider sandbox or anomaly-disposition package. No credential contents were read or printed. The production alias still resolves to audited READY deployment `dpl_BubNGhS2HFmmvjcUYfiKiasDwcLU`; the production build hold remains in force. No new production deployment, data mutation, customer message or paid provider call occurred. The [release checklist](../2026-09-27/release-checklist.md) remains NO-GO.

## Later anonymous candidate-browser delta — PR #118

At protected preview `/api/build` SHA `d38badd68f4e3fea2df58738e89a02d5c2175024`, anonymous real Chromium verified `T-PUBLIC-SKIP` on `/login/sign-in`: `Tab` focused the skip link; `Enter` moved focus to `MAIN#main-content`. The public page had no horizontal overflow at 390/768/1280/1440px. A separate source defect was reproduced: `/login/forgot-password` still rendered the sign-in form. Commit `9e96fa28f6584ae8499b9f9de53c6ba780419000` fixed the `AuthView` path; its exact-head protected preview displayed Email and **Send reset link** at all four widths, with no horizontal overflow. See [browser evidence and screenshots](public-auth-browser-evidence.md).

These observations add **candidate anonymous** proof to `T-PUBLIC-SKIP` and `T-PUBLIC-RESETEMAIL`; they do not rewrite production-public audit rows or the original 718/4/25/4 baseline counts. `T-SHELL-W390/W768/W1280/W1440` still need the authenticated sales/accounting/admin shared shell and dialogs. The provider send, token-bearing reset, 200% browser zoom, screen reader, invitation dialog, seven-role journeys and full business acceptance remain blocked or untested. No production release or data operation occurred.

## Dynamic/reusable binding source census

All 14 `NOT_TESTED` dynamic/reusable action IDs now have a [component-level semantic census](dynamic-action-census.md) at main `d4530f7`: one renewal card is not mounted by a production route; the other controls are caller-owned navigation, filter, selection, sheet or disclosure surfaces. This resolves the source classification and exposes a false “Internal mutation” label on the orphan renewal card. It does not verify route-expanded accessible names, destinations, row scope, persisted outcomes or seven-role browser journeys. The 14 historical audit rows remain `NOT_TESTED` until those actor fixtures are available.

## Public input semantics and recovery back link

At exact-head candidate preview `df315f1`, real keyboard input and accessible names were checked for public sign-in Email/Password and forgot-password Email without submission. The old production-public signup controls are absent from the current anonymous candidate route because signup is invitation-only; their invitation flow remains blocked. The fixed forgot-password view lacks a visible link back to sign-in, so the old audit's `T-PUBLIC-BACK` PASS does not carry forward to the candidate. See [browser evidence](public-auth-browser-evidence.md). No historical row was rewritten or promoted to full PASS.

## Candidate recovery return restored — PR #120

The `T-PUBLIC-BACK` candidate gap above was repaired at source commit `376d05e`. Its exact-head preview proved a keyboard-focusable Back to sign in link at 390px, with Tab reaching it after the email/send controls and Enter returning to `/login/sign-in`. [Visual and browser evidence](public-auth-browser-evidence.md). This is candidate anonymous evidence, not a new production release or token-bearing provider recovery test. Historical audit counts remain unchanged.
