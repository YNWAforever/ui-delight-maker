# ClientOps design direction — 2026-10-04

Phase 2 of the UI/UX polish pass. Finding IDs (UX-nn) refer to [audit.md](audit.md).

## Design intent

ClientOps is the working surface for Fimmick's Hong Kong sales, client success, accounting and
management staff, who keep it open for most of an eight-to-ten-hour day and move through it in
short bursts: check the queue, open a record, make one decision, move on. For them, delight is
not decoration. It is the click that answers at once, the number that is right and fits on one
line, the status that can be read at a glance in either theme, the button that only appears when
it will work, and the error that says what to do next. The interface should feel quiet and dense
the way a good ledger does: one clear reading order per page, the work itself above the fold, and
nothing on screen the person did not need — no apologies for missing features, no identifiers
instead of names, no numbers that contradict the rows below them. Confidence comes from
truthfulness first and polish second.

## Token decisions (Tailwind 4 `@theme` variables in `src/styles.css`)

Tokens are added beside the existing shadcn variables; nothing under `src/components/ui/` is
hand-edited. Every colour value below was checked with the audit's contrast script; the ratios
are the computed results.

### Type scale

Work pages use four sizes. 12 px is the floor; the nine 10–11 px usages go (UX-35).

| Token | Size / line height / weight | Use |
|---|---|---|
| `--text-page-title` | 24 / 32 / 600, `letter-spacing: -0.01em` | the one `h1` per page (today 30 px) |
| `--text-section-title` | 15 / 22 / 600 | section and panel titles |
| `text-sm` (Tailwind default) | 14 / 20 / 400 | table cells, form fields, body |
| `text-xs` (Tailwind default) | 12 / 16 / 500 | labels, metadata, badges |

Headings get `text-wrap: balance`; descriptions and list items `text-wrap: pretty`. Money,
counters and table numbers keep `tabular-nums` (already global on `table`; extended to the
summary strip and money cells).

Font family: the audit found that Plus Jakarta Sans has never actually rendered — the Neon Auth
bundle's `--font-sans` wins and every page uses the OS system font (UX-39). Recommended: apply it
as intended, defined after the Neon Auth import as `"Plus Jakarta Sans", "PingFang HK",
"Noto Sans HK", "Microsoft JhengHei", ui-sans-serif, system-ui, sans-serif`, so Latin text gets
the product's own face and Han characters in company and contact names render with Traditional
Chinese glyph forms on macOS, Windows and Android (UX-25). Because this changes the look of every
screen and Plus Jakarta Sans sets wider than Segoe UI, it is decision D-6; the alternative is to
adopt the system stack deliberately (keeping the same CJK fallbacks) and stop shipping the font
files.

### Spacing rhythm

4 px base (Tailwind default `--spacing: 0.25rem`), with fixed rhythm for page chrome:

| Token | Value | Use |
|---|---|---|
| `--spacing-gutter` | 16 px below `md`, 24 px from `md` | page side padding |
| `--spacing-section` | 24 px | gap between page sections |
| `--spacing-panel` | 16 px | padding inside panels (today `p-6` = 24 px) |
| table row | 44 px target (unchanged `py-2.5`) | dense but tappable |

### Radius

`--radius` goes from 10 px to 8 px. Panels `rounded-lg` (8 px), controls `rounded-md` (6 px),
badges `rounded-full`. Nested surfaces follow outer = inner + padding, and there is no card
inside a card: a section inside a panel is separated by a border or spacing, not another rounded
box.

### Elevation

| Token | Value | Use |
|---|---|---|
| `--shadow-flat` | none (1 px `--border` only) | panels and cards in page content (today `shadow` + `rounded-xl`) |
| `--shadow-raised` | `0 1px 2px oklch(0.2 0.03 260 / 0.06), 0 1px 1px oklch(0.2 0.03 260 / 0.04)` | sticky action bars, the open record panel |
| `--shadow-overlay` | `0 8px 24px oklch(0.2 0.03 260 / 0.12), 0 2px 6px oklch(0.2 0.03 260 / 0.08)` | popovers, menus, dialogs |

### Status colours for the lead, quote, client and renewal lifecycles

The five existing tones keep their hues and their mapping in `src/lib/status-labels.ts` (no new
status values). What changes is the text colour on the tint, which today fails contrast (UX-02,
UX-04). New per-theme tokens, verified on the 12 % tint and as plain text on the page:

| Token | Light | Dark |
|---|---|---|
| `--tone-info-fg` | `oklch(0.45 0.12 245)` — 6.24:1 / 7.03:1 | `oklch(0.84 0.09 230)` — 9.46:1 / 12.27:1 |
| `--tone-success-fg` | `oklch(0.43 0.11 155)` — 6.51:1 / 7.33:1 | `oklch(0.84 0.12 155)` — 9.67:1 / 12.61:1 |
| `--tone-warning-fg` | `oklch(0.44 0.10 60)` — 7.32:1 / 7.68:1 | `oklch(0.87 0.12 80)` — 9.79:1 / 13.15:1 |
| `--tone-danger-fg` | `oklch(0.48 0.19 27)` — 5.98:1 / 6.92:1 | `oklch(0.82 0.12 25)` — 8.53:1 / 10.40:1 |
| `--tone-neutral-fg` | `oklch(0.45 0.03 257)` — 6.43:1 / 7.12:1 | `oklch(0.78 0.02 258)` — 7.54:1 / 9.84:1 |

Today: dark warning 1.33:1; light info 4.16:1, success 3.84:1, danger 3.77:1.

How the lifecycles read with those tones (current mapping, unchanged):

| Lifecycle | info | warning | success | danger | neutral |
|---|---|---|---|---|---|
| Lead | New, Qualified | Quoted | Approved, Won | — | Replied, Lost |
| Quote | Sent, Viewed | Pending approval | Accepted | Rejected | Draft |
| Client (account lifecycle) | Prospect, Partner | At risk | Active client | — | Churned, Vendor |
| Renewal (derived states) | — | At risk | — | Overdue | Stuck |

A badge is always a word with tone as a second channel. `capitalize` goes, so labels render in
the sentence case they are written in (UX-30), and the job-sheet and renewal badge variants fold
into the one `StatusBadge`.

Non-text tokens: `--input` light `oklch(0.64 0.02 255)` (3.36:1 against the card, today 1.31:1)
and dark `oklch(0.5 0.03 260)` (3.02:1, today 1.56:1). The active navigation item gets a 3 px
`--sidebar-primary` inset bar plus weight 600 instead of a background that differs 1.13:1 from
the rail (UX-21). `--accent`, which drives hover on ghost/outline buttons and menu items, moves
from saturated blue to a quiet neutral `oklch(0.94 0.012 255)` with `--accent-foreground` equal
to `--foreground`; the blue remains available as `--info`.

### Dark mode stance

Supported, not redesigned. It already follows the OS preference, so it has to be correct: every
tone and border token above has a dark value, the raw palette colours in `notification-bell.tsx`
and `user-role-dialog.tsx` move to tokens, and Phase 4 takes dark-theme screenshots of the same
pages. No dark-only features and no separate dark visual language.

## Highest-leverage polish moves

1. **Status you can read in both themes.** The tone tokens above, one badge component, no
   `capitalize`, stronger input borders and active-navigation indicator. *UX-02, UX-04, UX-21,
   UX-29, UX-30.*
2. **Names, never identifiers.** A `rowLabel` for every per-row control in `DataTableShell` and
   `ResponsiveRecordList`; ids behind "Copy ID"; enum values through `getStatusLabel` and
   `getUserRoleLabel`; humanised audit actions; requester and actor names resolved from data the
   page can already read (SP-2 for the rest). *UX-05, UX-06, UX-12, UX-15.*
3. **Only offer what will work, and never strand anyone.** Sidebar filtered by the session's
   capability list; a router-level default error component that keeps the shell and shows
   `PermissionDeniedState` with a way back; gated lead actions; invitable roles filtered by the
   actor's role. Advisory only — the server stays authoritative. *UX-03, UX-07.*
4. **Every click answers.** A 2 px top progress bar driven by the router's pending state
   (appears after 150 ms, transform-only CSS, honours reduced motion) and a
   `defaultPendingComponent` built from `LoadingSkeleton`, so the next page's shape appears at
   once; on arrival focus moves to the page heading and the title is announced, and the
   Approvals record panel becomes reachable without tabbing through every row. *UX-08, UX-40.*
5. **The work above the fold.** Page-scoped stat-card grids become one compact, honest summary
   line (whole-dataset counts only — no "on this page" KPIs); cards stay only where the read
   model already returns whole-dataset figures (Renewals, Approvals); the table or board starts
   within the first 300 px at 1280×800. *UX-09, UX-15, UX-28, UX-29.*
6. **Close the two dead ends.** The invitation result lists each activation link with Copy and
   Revoke; the lead page gets "Add follow-up task" prefilled with the lead. *UX-01, UX-10.*
7. **Money and names that fit.** `whitespace-nowrap` money cells, a narrow-screen card layout for
   quote line items with the total always visible, two-line clamp with the full name on hover and
   focus for record names, the Approvals record as a sheet below 1440 px, the CJK font stack.
   *UX-11, UX-13, UX-14, UX-25.*
8. **Errors at the field, in plain words.** A small `Field` wrapper (label, hint, error,
   `aria-describedby`, `aria-invalid`) adopted by New task, invitations, access decisions and the
   import file inputs; a copy pass that removes apologies and internal vocabulary; "just now"
   instead of "0s from now"; the quote freshness indicator fed by fetch time. *UX-16, UX-18,
   UX-19, UX-24.*

Phase 3 order: P0 (UX-01, UX-02) → remaining P1 → token foundations (move 1) → moves 2–8 → P2.

## What stays as it is

- Authorization, capability checks, server-function contracts, repositories, read models,
  workflow handlers, migrations and data. Where a UX fix needs the server it is written up as
  SP-1…SP-4 in the audit.
- `src/components/ui/` (no hand edits) and `src/routeTree.gen.ts`.
- Information architecture: the lifecycle sidebar groups, route structure and URLs (only the
  inherited list parameters on child routes, UX-31, if the fix is trivial).
- The lucide icon set and the shadcn/Radix component model (the typeface itself is D-6).
- Charts (their accessible table alternative already works), the quote PDF/print styles, and the
  import/export machinery.
- `/agents`, `/agents/$name` and `/ai-review` beyond token-level changes: their source is 61
  commits ahead of UAT and carries fresh AI-governance acceptance evidence.
- Motion: CSS transitions only, 120–220 ms, on interactive state changes; no motion library, no
  animated data, nothing that moves when data refreshes.
- Dead-code and dependency removal (UX-32): a separate cleanup PR after sign-off.
- No new packages.

## Decisions needed before Phase 3

Resolved 2026-10-04: the owner approved the recommendations — D-1 screenshots stay local, D-2 no
UAT deploy (logged-in "after" screenshots environment-gated), D-3 CSS-only focus outline, D-4 add
`@axe-core/playwright`, D-5 write-ups only, D-6 apply Plus Jakarta Sans. See
[PROGRESS.md](PROGRESS.md).

- **D-1 Screenshots in a public repository.** The screenshots show the UAT app with synthetic data
  and seven `.example` identities. They are currently kept out of Git. Commit them (or a curated
  subset) for the PR description, or keep them local and describe them in text?
- **D-2 "After" screenshots of logged-in pages.** The role sessions expire on 2026-10-06. A branch
  preview on the production Vercel project cannot use UAT sessions, and deploying the branch to
  the UAT project is a production-target deploy there. Without your approval for that deploy,
  logged-in "after" screenshots are environment-gated, and verification relies on component tests
  plus public-page screenshots.
- **D-3 Focus ring and pressed state on `Button`.** Either re-sync `button`, `input`, `select` and
  `textarea` with `bunx shadcn@latest add … --overwrite` (current upstream has a 3 px ring and
  `aria-invalid` styling; it would undo the repo's `button-variants.ts` split and must be checked
  for new packages first), or keep the primitives and improve focus contrast through tokens only.
- **D-4 axe-core.** Phase 4 accessibility checks are scripted because axe-core is not installed.
  Add `@axe-core/playwright` as a dev dependency?
- **D-5 Server proposals SP-1…SP-4.** Write-up only, or prepare any as a separate PR?
- **D-6 Typeface.** Apply Plus Jakarta Sans as the code intends (recommended), or adopt the system
  stack on purpose? Either way the Traditional Chinese fallbacks are added.
