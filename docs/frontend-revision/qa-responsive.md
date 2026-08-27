# Responsive QA

Step F1. **Not performed — environment-gated.** See [validation-report.md](./validation-report.md) EG-2.

No credentials means no authenticated session, which means no route renders real data and no screenshot is meaningful. Per Instruction §18 this is reported as gated, never as passed.

## What was done instead

Responsive behaviour was built to the rules rather than measured against them, and the structural parts are enforced by unit tests:

- `ResponsiveRecordList` switches between table and card surfaces with Tailwind classes (`hidden md:block` / `md:hidden`), **not** JavaScript width detection, so the switch is correct during SSR and survives hydration. Tested.
- `DataTableShell` hides `secondary` columns below `md` and `tertiary` below `lg` through column priorities, and creates a horizontal scroll container **only** when `allowHorizontalScroll` is passed. Tested. That prop is used in exactly one place in the product — the billing-portions table, where column relationships genuinely matter.
- `WorkspaceHeader` stacks below `md` so actions wrap under the title rather than overflowing. Tested.
- `StickyActionBar` pins to the bottom on mobile, returns to flow at `md`, and carries `env(safe-area-inset-bottom)`.

## A hazard the checklist must account for

`src/styles.css` sets `body { overflow-x: hidden }`. This **masks** horizontal overflow rather than preventing it, so the §19 criterion "no global horizontal overflow at 375px" can appear satisfied while content is silently clipped and unreachable — which is worse than a visible scrollbar.

Whoever runs this pass must therefore check **both**:

1. `document.documentElement.scrollWidth <= window.innerWidth`, and
2. that no content is being clipped — temporarily set `body { overflow-x: auto }` in devtools and re-check.

## Manual checklist for whoever has credentials

Environment needs `DATABASE_URL`, `NEON_AUTH_URL`, `APP_BASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY` (the last two are required at runtime — see EG-2).

For each of the **35** authenticated routes (not 31 — see PC-1), at 1440, 1024, 768 and 375:

- [ ] No horizontal overflow, by both tests above
- [ ] Command header wraps; nothing overflows
- [ ] Primary lists render as cards below `md`
- [ ] Dialogs and drawers usable; internal scroll where the body exceeds the viewport
- [ ] No primary decision requires reading a tiny desktop table

**The before-state is still capturable.** `origin/main` is untouched at `5c8590a`:

```
git worktree add ../ui-delight-baseline 5c8590a
```

Run the same matrix there for a true before/after pair.

| Route | 1440 | 1024 | 768 | 375 | Overflow at 375 | Card mode below md | Header wraps | Dialogs usable | Notes |
|---|---|---|---|---|---|---|---|---|---|
| _all 35_ | gated | gated | gated | gated | gated | gated | gated | gated | credentials required |
