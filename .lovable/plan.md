# Plan: Deepen every ClientOps subpage

Frontend-only. Mock data stays in `src/lib/mock-data.ts`. All mutations live in component-level React state (resets on reload). Toasts via sonner.

## Cross-cutting fixes
- Fix SSR hydration mismatch from locale-formatted dates: centralize date formatting in `src/lib/format.ts` using fixed `en-GB` + UTC `Intl.DateTimeFormat`, replace ad-hoc `toLocaleString()` / `new Intl.DateTimeFormat("en-HK", …)` calls across routes.
- Expand `mock-data.ts`: add more leads/quotes/clients/tasks/approvals/runs, plus arrays for `quoteTemplates`, `notifications`, `pricingRules`, `notes`.
- New shared components: `data-table-toolbar.tsx` (search + filter chips), `empty-state.tsx`, `metric-card.tsx`, `activity-feed.tsx`, `confirm-dialog.tsx`.

## Per-route deepening

**`/` Dashboard** — 4 KPI cards with deltas, pipeline funnel (Recharts), agent activity sparkline, recent approvals feed, "needs your attention" list, quick-action buttons (New lead / New quote).

**`/leads`** — Search, status filter chips, owner filter, sort by score/value, bulk-select with "assign owner" / "convert to quote" actions, "New lead" dialog (local push), row click → detail.

**`/leads/$id`** — Tabs: Overview · Activity · Quotes · Files · AI Insights. Inline status change (Select), add-note composer, "Generate quote" CTA navigates to `/quotes/new?leadId=…`.

**`/quotes`** — Status tabs (draft/pending/sent/accepted/lost), revenue summary bar, search, sort, row actions (duplicate, archive).

**`/quotes/new`** — Multi-step wizard (Client → Services → Review): autocomplete client, add/remove line items from templates, qty/price editing with live total, discount %, validity date, "Save draft" / "Submit for approval" → toast + navigate.

**`/quotes/$id`** — Add Approve/Reject buttons (state-driven), inline status edits, comment thread, version history list, "Send to client" advances timeline.

**`/clients`** — Tier filter, health-score color chips, sortable columns, "Add client" dialog, ARR total at top.

**`/clients/$id`** — Already has tabs; add Contacts tab, Quotes tab listing related quotes, Files tab (mock list), edit-health-score popover.

**`/tasks`** — Kanban: drag-and-drop between columns using local state (HTML5 DnD, no library), priority filter, assignee filter, "New task" dialog, due-date overdue highlighting.

**`/approvals`** — Split view: list + detail pane. Approve/Reject with reason textarea, bulk approve, filter by agent/type, SLA countdown chips.

**`/agents`** — Toggle agent on/off (Switch, local state), success-rate sparklines per row, filter by status, "View runs" → detail.

**`/agents/$name`** — Add Runs timeline with expandable tool-call traces (mock JSON), Memory tab editor (read-only viewer + "pin" toggle), Config tab with sliders for temperature/confidence threshold.

**`/reports`** — Date-range selector (chips: 7d/30d/90d), 4 charts: revenue trend, conversion funnel, agent leaderboard (bar), task throughput. Export-CSV button (toast stub).

**`/settings`** — Expand existing tabs: Profile (form), Team (table with role select), Pricing (editable threshold rows), Agents (per-agent toggles + approval-required switch), Notifications (channel checkboxes), API keys (masked list + "Generate" button).

## Technical details
- New files: `src/lib/format.ts`, `src/components/data-table-toolbar.tsx`, `src/components/empty-state.tsx`, `src/components/metric-card.tsx`, `src/components/activity-feed.tsx`, `src/components/confirm-dialog.tsx`.
- All forms use shadcn `Dialog` + `Form` + `zod` (already installed).
- Drag-and-drop on `/tasks` uses native HTML5 DnD (no extra dep).
- Charts use existing Recharts.
- Mutations: each list page holds its own `useState` seeded from mock arrays; child pages receive via route loader (re-reads mock arrays at navigation time — accept that cross-page edits don't propagate, this is documented limitation of frontend-only prototype).
- Keep design tokens from `src/styles.css` (indigo brand). No new colors.

## Out of scope
Backend, persistence across reload, real auth, real PDF, real CSV, real email send.
