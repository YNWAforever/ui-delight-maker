## ClientOps — Frontend Only (MVP)

Build the full UI shell described in the spec as a **frontend-only Lovable app** using TanStack Start + Tailwind + shadcn/ui. No backend, no Lovable Cloud, no auth, no agents executing — all data comes from in-memory mock fixtures so every page renders realistic content.

### Scope

All 14 routes from spec §8.1, navigable from a persistent dashboard layout (sidebar + topbar):

| Route | Page |
|---|---|
| `/` | Dashboard — KPI tiles, pipeline funnel chart, agent activity feed |
| `/leads` | Lead Inbox — filterable table (source, status, score, owner) |
| `/leads/$id` | Lead Detail — profile, qualification JSON, activity log, agent suggestions |
| `/quotes` | Quote List — table with status, value, client |
| `/quotes/new` | Quote Builder — line-item editor, template picker, totals, request-approval CTA |
| `/quotes/$id` | Quote Detail — summary, status timeline, mock PDF preview panel |
| `/clients` | Client List — health score, tier, renewal date |
| `/clients/$id` | Client Profile — projects, tasks, history tabs |
| `/tasks` | Task Board — Kanban (open / in-progress / done) |
| `/approvals` | Approval Inbox — cards with Approve/Reject/Escalate |
| `/agents` | Agent Monitor — agent_runs table, expandable rows showing tool calls |
| `/agents/$name` | Agent Detail — run history, memory snippets, config |
| `/reports` | Reports — Recharts pipeline / conversion / agent activity |
| `/settings` | Settings — tabs for users, pricing rules, service taxonomy, agent config |

### Design System

- Neutral white/slate base, indigo brand accent (Fimmick-style), defined as semantic tokens in `src/styles.css` (oklch)
- Inter font, Lucide icons, shadcn/ui primitives already present
- Sidebar navigation using `components/ui/sidebar.tsx`; topbar with search + user menu
- Status badges colored consistently across leads/quotes/approvals
- Agent vs user actor distinguished with robot vs avatar icon

### Mock data

A `src/lib/mock-data.ts` module exports typed arrays for leads, quotes, clients, tasks, approvals, agent_runs, tool_calls, activity_logs — matching the schema in spec §6 so swapping to a real API later is trivial. Detail pages look up by id.

### Out of scope (explicitly not built)

- No Lovable Cloud / Supabase / database
- No authentication
- No real agent runtime, LLM calls, PDF generation, or messaging integrations
- No CSV import processing (UI button only)
- Form submissions update local component state only; nothing persists

### Technical notes

- TanStack Start file-based routing in `src/routes/`, flat dot-separated naming (e.g. `leads.$id.tsx`, `quotes.new.tsx`, `agents.$name.tsx`)
- Dashboard layout route `src/routes/_app.tsx` wraps all pages with sidebar + outlet; `__root.tsx` keeps current head/error/notFound
- Each route sets its own `head()` with unique title + description
- Recharts for charts, TanStack Table for sortable tables, shadcn Dialog/Sheet for detail modals where helpful
- Replace placeholder `src/routes/index.tsx` with the real dashboard

### Deliverable

A fully clickable ClientOps frontend prototype — every page renders, navigation works, mock data flows through tables and detail views. Ready for a backend team to wire to real endpoints later.