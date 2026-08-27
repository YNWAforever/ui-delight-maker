# Accessibility QA

Step F2. **Inspector and keyboard passes not performed — environment-gated.** See [validation-report.md](./validation-report.md) EG-2. Reported as gated, never as passed.

## Method

What could be verified statically and by test, was. What needs a running browser and a real session, was not.

## What is enforced by tests

These are product rules with unit tests behind them, so they cannot silently regress:

- **One `<h1>` per page.** `WorkspaceHeader` owns it. The two headers it replaced each rendered their own, so a detail page nesting one inside another produced two.
- **Accessible table semantics.** `DataTableShell` renders a real `<table>` with `<th scope="col">`; `aria-sort` sits on the `<th>` where assistive tech reads it, not on the sort button; `<caption>` is present and `sr-only` when supplied.
- **Row activation is a real anchor** in the identity cell — not a click handler on `<tr>`. Tests assert no `tr[tabindex]` and no `tr[role]`, so a keyboard-inaccessible row cannot come back.
- **Status is never colour alone.** Every `StatusBadge` renders text; `AttentionQueue` renders each severity as an icon **plus** a text label.
- **Focus returns to its trigger.** `RecordSummaryPanel` restores focus on close, via both the Close button and Escape. Radix aims focus at a `DialogTrigger`, and a panel opened from a table row has none — focus was falling to `<body>` until this was handled explicitly.
- **Icon buttons have names.** Header icon controls carry `aria-label` and meet a 40px touch target.
- **Disabled controls explain themselves.** Every unavailable control carries its reason via visible text or `aria-describedby` — a disabled control with no explanation is its own defect under the integrity rules.
- **AI content is distinguishable.** `ActivityTimeline` marks agent actors from an explicit `isAgent` flag rather than an automated-sounding event kind, so a human approving an agent run still reads as a human decision.

## Already correct at baseline, preserved

- `prefers-reduced-motion` is handled globally in the base layer. Phase B introduced no inline `style` transitions, which that rule cannot reach.
- `table { font-variant-numeric: tabular-nums }` is global.
- A skip link to `#main-content` exists in the root shell.
- Sidebar items carry tooltips in collapsed mode, giving icon-only entries accessible names.

## Not verified — needs a browser

- Contrast ratios, including the **new light-mode sidebar tokens**. This is the highest-priority item on the manual list: A6 darkened the light-mode navigation rail because it was 0.005 lightness from the page background, and the new `--sidebar-foreground` pairing has not been measured at AA.
- Actual focus visibility and tab order on a rendered page.
- Screen-reader announcement of live regions after a mutation.
- Touch-target sizes as rendered.
- An `axe` or browser-inspector run per route.

## Manual checklist for whoever has credentials

Keyboard-only, from the sidebar to the action and back, for each primary workflow:

- [ ] Revenue Desk queue and pipeline board — including the **keyboard alternative to drag** (a "Move to stage" menu on each card; drag alone would be a §14 violation)
- [ ] Leads list → Lead detail
- [ ] Quote builder → submit
- [ ] Approvals decision
- [ ] Job sheet lock — confirm the dialog names the consequence
- [ ] Account 360 tab switching
- [ ] Client touchpoint
- [ ] Relationships resolve
- [ ] Tasks status change
- [ ] AI Review decision
- [ ] AI Ops inspect
- [ ] Reports export
- [ ] Settings save
- [ ] Admin people edit — the one place a mis-click has an irreversible human cost

Then per route: visible focus, dialog focus trap and return, one `h1`, logical heading order, `<th scope>`, icon-button names, status text alongside colour, form errors associated with fields, reduced motion respected, touch targets on mobile.

Record violations by severity, and treat any critical or serious finding as blocking.
