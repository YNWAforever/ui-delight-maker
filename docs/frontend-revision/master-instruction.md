## Fimmick Total CRM + AI Ops Platform — Frontend Product Revision

**Repository:** `YNWAforever/ui-delight-maker`  
**Primary product name:** `Fimmick ClientOps`  
**Target positioning:** `Fimmick Total CRM + AI Operations Platform`  
**Current stack:** TanStack Start, React 19, TypeScript, TanStack Router, TanStack Query, Tailwind CSS 4, shadcn/ui, Neon Postgres, Neon Auth, n8n workflows, Vercel  
**Execution mode:** Revise the complete authenticated product frontend while preserving all real routes, business functions, authorization rules, server functions, database contracts and workflow integrations.  
**Release rule:** Create a reviewable branch, pull request and Vercel preview. Do not merge to `main` and do not promote to production until explicit approval.

---

# 1. Your role

Act as a world-class:

- Enterprise SaaS product designer
- CRM product strategist
- AI operations console architect
- Revenue operations specialist
- Customer-success workflow designer
- Design-system lead
- Accessibility specialist
- Senior TanStack Start and React engineer
- Data-dense application UX expert
- Product QA and frontend performance engineer

You are not designing a marketing website. You are revising a real operational product used by sales, client-success, operations, management, accounting and administrators.

The result must feel like a coherent, dependable operating system rather than a collection of CRUD pages or AI demos.

---

# 2. Product vision

Reposition and redesign the product around this promise:

> **Acquire, convert, deliver, retain and grow every client relationship with a governed AI workforce embedded in the operating workflow.**

The product must not feel like:

- A generic CRM clone
- A collection of isolated dashboards
- A chatbot interface
- An AI agent gallery
- A visual prototype with non-functional controls
- A sales-only pipeline tool

The product should feel like:

- A unified relationship and revenue operating system
- A dependable daily workspace for teams
- A control tower for human and AI work
- A credible enterprise platform with clear permissions and auditability
- A system where every action has an owner, state, evidence and outcome
- A platform designed for Fimmick’s CRM, AI, marketing, customer-success and operations expertise

Use the working product descriptor:

**Fimmick ClientOps**  
**Total CRM + AI Operations**

Do not rename database entities or routes merely for visual consistency. Product language may improve, but the underlying system contracts must remain intact.

---

# 3. Core product principles

## 3.1 Operational clarity over decorative complexity

Every screen should immediately answer:

1. What needs attention?
2. Why does it matter?
3. Who owns it?
4. What should happen next?
5. What is the current state?
6. What evidence supports the recommendation?

Do not fill pages with equal-weight cards. Establish a strong hierarchy between urgent work, important context, supporting metrics and historical data.

## 3.2 One relationship graph

Accounts and contacts are durable identities. Leads, quotes, campaigns, tasks, engagements, job sheets, approvals, touchpoints and AI runs should visually connect back to the same relationship context.

Do not make users mentally reconcile separate mini-CRMs.

## 3.3 AI must be observable and governable

AI features must expose, when available:

- Agent or workflow identity
- Subject or related record
- Current status
- Confidence
- Human-review requirement
- Output summary
- Trigger and timestamp
- Duration and token usage
- Failure or attention reason
- Direct path to review or inspect

Do not imply that a control changes runtime behavior unless a real server-side policy and action exist.

## 3.4 No decorative controls

A button, switch, slider, filter, replay action, export action, automation state or configuration field must satisfy one of these conditions:

1. It performs a real authorized server-side action, provides success/failure feedback and refreshes the correct query state; or
2. It is explicitly read-only, disabled or marked as unavailable.

Never show a success toast for an action that only changes local React state.

## 3.5 Progressive disclosure

Show the minimum information required to make the next decision, with access to details through:

- Expandable rows
- Drawers or side panels
- Tabs
- Dedicated record pages
- Contextual links

Do not place full record detail inside every table row.

## 3.6 Consistency is a feature

All workspaces should share:

- Header structure
- Metric presentation
- Filter behavior
- Table density
- Empty states
- Loading states
- Error states
- Status language
- Action placement
- Detail-panel patterns
- Responsive behavior

---

# 4. Non-negotiable technical constraints

Preserve the repository’s architecture and conventions.

## 4.1 Existing architecture

Keep this request lifecycle:

```text
src/routes/*.tsx
  → src/server-functions/
  → src/server/repositories/ or src/server/read-models/
  → src/server/db/neon.server.ts
  → Neon Postgres
```

n8n callbacks continue through the existing protected workflow API routes.

## 4.2 Required frontend patterns

- Use TanStack Router route loaders.
- Use `routeQueryOptions` for route data.
- Use `crmQueryKeys` for every query and invalidation key.
- Keep server data in TanStack Query rather than duplicating it into long-lived local state.
- Use existing server functions instead of calling the database from route components.
- Use existing SSR-safe formatters in `src/lib/format.ts`.
- Keep all date rendering SSR-safe and hydration-safe.
- Preserve server-side capability enforcement.
- Show navigation only when it is valid for the current actor when capability data is available.
- Keep mobile, keyboard and screen-reader behavior first-class.

## 4.3 Files and systems that must not be improperly changed

- Do not manually edit `src/routeTree.gen.ts`.
- Do not add duplicate plugins to `vite.config.ts`.
- Do not hand-edit shadcn primitives in `src/components/ui/` merely to style one screen.
- Do not add new Supabase imports.
- Do not bypass `src/server-functions/`.
- Do not weaken capability checks to make a page easier to render.
- Do not expose stack traces, database messages, credentials or workflow secrets.
- Do not add a package without a clear need and explicit approval where the repository’s supply-chain rules require it.
- Do not add a new route or navigation item unless it has a real working page and data source.

## 4.4 Backend and schema scope

This is primarily a frontend product revision.

Small read-model or server-function changes are allowed only when needed to:

- Support a truthful frontend state
- Avoid N+1 requests
- Provide aggregate metrics
- Return a compact view model
- Correct invalidation behavior
- Enforce an existing action properly

Do not introduce a large database migration in the frontend revision PR. Document larger backend requirements separately.

---

# 5. Source-of-truth review before editing

Before changing the UI:

1. Read `README.md` and `CLAUDE.md`.
2. Inspect the current route tree and every authenticated route.
3. Inspect `src/components/app-sidebar.tsx` and the root shell.
4. Inspect `src/lib/query-keys.ts`, `src/lib/format.ts`, `src/lib/admin/types.ts` and authorization policy.
5. Inspect relevant server functions and read models before changing each page.
6. Identify every action that is real, local-only, incomplete or unavailable.
7. Produce a route/function parity checklist before implementation.
8. Preserve all current real business functions.

Do not redesign from screenshots alone. Understand the code and data flow.

---

# 6. Target information architecture

Organize the product around lifecycle outcomes. Use only routes that actually exist.

## 6.1 Sidebar groups

### Today

- **Revenue Desk** — `/`

### Acquire

- **Leads** — `/leads`
- **Campaigns** — `/campaigns`
- **AI Review** — `/ai-review`

### Convert

- **Quotes** — `/quotes`
- **Approvals** — `/approvals`

### Deliver

- **Job Sheets** — `/job-sheets`

Do not add Projects to navigation until a real Neon-backed route and permissions exist.

### Retain & Grow

- **Accounts** — `/accounts`
- **Active Clients** — `/clients`
- **Relationships** — `/relationships`
- **Renewals** — `/renewals`
- **Tasks** — `/tasks`

### Operate

- **AI Ops** — `/agents`
- **Reports** — `/reports`
- **Settings** — `/settings`

### Administration

Show the existing Admin workspace entry only for actors with permitted admin destinations. Preserve its capability-aware first destination.

## 6.2 Navigation behavior

- Keep the sidebar collapsible.
- Provide clear active state across nested routes.
- Preserve user favorites.
- Use short, operational labels.
- Avoid placing more than seven items in one visual group.
- On mobile, use a drawer with the same group structure.
- Keep the product name and descriptor visible in expanded mode.
- The shell header should contain global search, notification access, theme control and user identity.

---

# 7. Visual direction

Create a premium enterprise operations interface with calm density.

## 7.1 Design personality

- Precise
- Confident
- Modern
- Trustworthy
- Data-aware
- Human-centered
- Asia-ready and globally credible

Avoid:

- Excessive gradients
- Oversized marketing typography
- Glassmorphism on data surfaces
- Decorative illustrations inside operational workspaces
- Too many card borders
- Rainbow status colors
- Large empty areas that reduce information efficiency
- “AI magic” visual clichés

## 7.2 Color system

Use the existing design tokens and improve their application. Do not scatter hard-coded colors.

Recommended role hierarchy:

- Neutral app background
- High-contrast work surfaces
- Dark or strongly differentiated navigation rail
- One primary Fimmick accent
- Semantic success, warning, destructive and informational roles
- Muted background for secondary context
- Subtle attention tint for exception queues

All status colors must meet accessible contrast requirements and never rely on color alone.

## 7.3 Typography

Retain the current product font unless a repository-level brand decision says otherwise.

Use a disciplined type scale:

- Page title: 24–30px depending on viewport
- Workspace section title: 16–18px
- Table and body text: 13–14px
- Supporting metadata: 11–12px
- KPI values: 22–30px

Use tabular numerals for currency, percentages, dates, counts and durations.

Avoid overly bold text across entire pages. Reserve strongest weight for priorities and primary values.

## 7.4 Spacing and density

- Desktop content padding: approximately 24px
- Mobile content padding: 16px
- Section rhythm: 20–28px
- Table rows should be compact but not cramped.
- Avoid nested cards inside cards unless the inner element is truly independent.
- Prefer section dividers, subtle backgrounds and spacing over heavy containers.

## 7.5 Status language

Use consistent plain-language labels:

- Waiting approval
- Needs attention
- Running
- Completed
- Failed
- Stuck
- Draft
- Pending approval
- Sent
- Viewed
- Accepted
- Rejected
- At risk
- Overdue

Do not introduce multiple labels for the same state.

---

# 8. Global application shell revision

## 8.1 Sidebar

Revise the sidebar to:

- Reflect the target lifecycle information architecture.
- Present `Fimmick ClientOps` and `Total CRM + AI Operations` clearly.
- Improve label alignment and vertical rhythm.
- Keep icons visually consistent.
- Avoid unnecessary badges.
- Maintain clear active states for nested routes.
- Preserve favorites and admin navigation logic.
- Keep account identity and sign-out in the footer.

## 8.2 Top header

The top header should:

- Remain sticky.
- Use a subtle solid or translucent surface without readability loss.
- Give global search sufficient width on desktop.
- Keep icon buttons at least 40px touch target where possible.
- Show accessible labels and tooltips.
- Avoid visual competition with each page’s command header.

## 8.3 Command header pattern

Standardize a reusable workspace header with:

- Lifecycle or operating context label
- Page title
- One-sentence operational description
- Primary action
- Maximum two secondary actions
- Optional status or freshness indicator

On mobile, actions should wrap below the title without horizontal overflow.

## 8.4 Global states

Create consistent patterns for:

- Loading skeletons
- Empty workspaces
- Filtered-empty results
- Permission-denied states
- Recoverable server errors
- Offline or failed refresh states
- Stale data indicators where relevant

Do not show a blank card or raw error message as the default response.

---

# 9. Route-by-route frontend revision

Complete every route below. Do not stop after the dashboard or AI Ops page.

---

## 9.1 Revenue Desk — `/`

### Purpose

The daily operating surface for revenue work. It should prioritize action, not merely display pipeline data.

### Required hierarchy

1. Command header
2. Critical KPI strip
3. Today queue
4. Pipeline workspace
5. Context and insights

### KPI strip

Retain truthful metrics such as:

- Overdue follow-ups
- Due today
- Hot leads
- Active quote value

Use concise hints. Do not add vanity metrics.

### Today queue

Each item should show:

- Urgency or reason
- Account or lead name
- Action description
- Owner where available
- Due or age indicator
- Direct path to the relevant record

The queue should visually distinguish:

- SLA breach
- Approval risk
- High-value opportunity
- AI review requirement
- Renewal or relationship risk when present

### Pipeline

- Preserve drag/move behavior only where it already performs real writes.
- Make column headers sticky inside horizontal boards where useful.
- Improve selected-card state.
- Keep compact account, contact, score, value and next-step context.
- On mobile, use a stage selector or vertically grouped list rather than forcing a tiny horizontal board.

### Lead preview

Use a responsive side panel or below-board panel with:

- Lead summary
- Contact details
- Qualification evidence
- Recent activity
- Open tasks
- Quotes
- AI actions
- Clear primary next step

### Integrity requirement

The timeline-summary control is currently not connected. Do not present it as completed functionality. Either connect it to a real server-backed result or mark it unavailable/read-only.

---

## 9.2 Leads list — `/leads`

### Purpose

Triage and manage inbound and prospecting work efficiently.

### Required features

- Search
- Saved or persistent filters where already supported
- Status, source, owner, score and recency filters
- Sort by urgency, score, updated time and company
- Dense table on desktop
- Card/list adaptation on mobile
- Bulk selection only for actions that genuinely support bulk writes

### Row content

Show:

- Company
- Primary contact
- Source
- Stage
- Score
- Owner
- Next task or follow-up
- Last activity
- AI state when relevant

### Actions

Keep row actions in an accessible overflow menu or context action area. Do not overload each row with multiple visible buttons.

### Empty states

Differentiate:

- No leads exist
- No results match filters
- User lacks scope
- Data failed to load

---

## 9.3 Lead detail — `/leads/$id`

### Purpose

Turn one lead into a qualified opportunity with clear evidence and next actions.

### Header

Show:

- Company and contact
- Current stage
- Owner
- Lead score
- Source
- Primary next action

### Suggested tabs or sections

1. **Overview** — summary, qualification, contact and next action
2. **Activity** — chronological timeline
3. **Tasks** — open and completed work
4. **Quotes** — related commercial records
5. **AI Insights** — qualification result, confidence and review state

### AI presentation

AI qualification must show:

- Score breakdown
- Service interest
- Budget and urgency signals
- Recommended next action
- Reasoning summary
- Confidence
- Whether human review is required

Avoid rendering raw JSON as the default experience. Raw input/output can be available under an advanced disclosure.

---

## 9.4 Accounts list — `/accounts`

### Purpose

Provide a relationship-level operating view across prospects, clients, partners and at-risk accounts.

### Required features

- Search
- Lifecycle stage filter
- Owner and CS owner filter
- Tier, industry, region and health filter where supported
- Saved views and favorites
- Clear distinction between prospect, active client and at-risk account

### Row content

Show:

- Account name
- Lifecycle stage
- Account owner
- CS owner
- Relationship health
- Last activity
- Next action
- Open commercial value or related summary if truthful
- Open relationship signal count

Avoid showing metrics that cannot be reconciled to the account data.

---

## 9.5 Account 360 — `/accounts/$id`

### Purpose

This is the most important strategic CRM page. It should reconcile relationship, commercial, delivery, finance, retention and AI context.

### Header

Show:

- Account name
- Lifecycle stage
- Tier and industry
- Owners
- Relationship health
- Last activity
- Primary next action

### Required workspace sections

1. **Overview**
   - Executive summary
   - Relationship health and reasons
   - Key stakeholders
   - Current commercial state
   - Open risks and next actions

2. **Stakeholders**
   - Relationship map or structured stakeholder list
   - Role, influence, sentiment and relationship strength
   - Missing decision-maker or champion signals

3. **Commercial**
   - Leads
   - Quotes
   - Accepted value
   - Open pipeline
   - Current products/services

4. **Delivery & Finance**
   - Active client records
   - Engagements
   - Job sheets
   - Billing state and Xero references where available

5. **Activity**
   - Unified chronological timeline
   - Campaign touches
   - Tasks
   - Quotes
   - Touchpoints
   - AI runs and approvals

6. **Signals**
   - Relationship gaps
   - Stale touchpoints
   - Renewal risk
   - Cross-sell opportunities
   - Suggested actions

### Critical correctness rule

Do not mask missing quote-to-account linkage with UI workarounds. If account-linked quote data is unavailable because `quotes.account_id` is missing, surface the dependency in the implementation report and keep the UI truthful.

### Invalidation rule

Every mutation displayed in the Account 360 must refresh all affected sections, including activity. Do not update only the originating page.

---

## 9.6 Active Clients list — `/clients`

### Purpose

Manage delivery, adoption, health, renewal and expansion across current clients.

### Required features

- Health filter
- Renewal-window filter
- Owner filter
- Tier and onboarding status filter
- Search
- At-risk-first sorting option

### Row content

Show:

- Client/account
- Health score
- Onboarding state
- ARR or value where truthful
- Renewal date
- Renewal risk
- Owner
- Last touchpoint
- Next action

---

## 9.7 Client detail — `/clients/$id`

### Purpose

Operate customer-success and retention workflows.

### Required sections

1. Client summary
2. Products and engagements
3. Health and risk factors
4. Touchpoints
5. Renewal plan
6. Open tasks
7. Related job sheets or commercial history
8. AI renewal-risk outputs

### UX requirements

- Health must be explained, not shown only as a number.
- Renewal risk must expose evidence and recommendation.
- AI output must be distinguishable from confirmed human decisions.
- Make the next client-success action prominent.

---

## 9.8 Relationships — `/relationships`

### Purpose

Provide an exception-oriented command center for account relationship coverage.

### Required hierarchy

- Relationship health overview
- Open signals by severity
- Accounts missing decision-makers or champions
- Stale relationships
- High-risk engagements
- Cross-sell opportunities

### Signal presentation

Each signal should show:

- Severity
- Account
- Signal type
- Reason
- Suggested action
- Age
- Owner
- Dismiss or resolve action only if real and authorized

After dismissal or action, invalidate the account workspace signal and activity sections.

---

## 9.9 Renewals — `/renewals`

### Purpose

Help client-success and management prioritize retention and expansion.

### Required features

- Overdue, 30-day, 60-day, 90-day and later windows
- Risk filter
- Product filter
- Owner filter where supported
- Pagination
- At-risk value and due-soon metrics

### Row content

Show:

- Account/client
- Product or engagement
- Renewal date
- Value
- Risk
- Health
- Last touch
- Owner
- Next action

### Mobile behavior

Use stacked renewal cards with a clear date and risk hierarchy. Do not require horizontal table scrolling for primary decisions.

---

## 9.10 Campaigns list — `/campaigns`

### Purpose

Connect campaigns and events to account follow-up and commercial outcomes.

### Required features

- Status and type filters
- Date range
- Owner
- Search
- Outcome summary

### Row content

Show:

- Campaign name
- Type
- Status
- Dates
- Owner
- Members/attendees
- Follow-up completion
- Leads, quotes or client activity outcomes

Avoid presenting campaign vanity metrics without downstream outcomes.

---

## 9.11 Campaign detail — `/campaigns/$id`

### Purpose

Operate attendee follow-up and attribution.

### Required sections

1. Campaign summary
2. Member/attendee list
3. Follow-up queue
4. Conversion outcomes
5. Related accounts and contacts
6. Activity timeline

### Member row

Show:

- Person/company
- Attendee status
- Interests
- Account match
- Follow-up owner
- Follow-up status
- Conversion outcome
- Next action

Make unmatched and duplicate identities visible and actionable without hiding data-quality issues.

---

## 9.12 Quotes list — `/quotes`

### Purpose

Manage commercial documents and quote lifecycle.

### Required features

- Status filters
- Owner
- Value range
- Date range
- Search by number, account or contact
- Clear pending-approval queue

### Row content

Show:

- Quote number
- Account/client
- Status
- Value and currency
- Owner
- Valid-until date
- Updated time
- Approval or acceptance state

Do not show account information inferred only from company-name strings if a canonical link is expected.

---

## 9.13 Quote builder — `/quotes/new`

### Purpose

Create a truthful, consistent quote with a clear path to approval.

### Layout

Use a two-column desktop layout:

- Main quote editor
- Sticky commercial summary and validation panel

On mobile, stack sections and keep the total/action bar sticky near the bottom.

### Required sections

- Lead/client/account context
- Template selection
- Cover text
- Scope sections
- Line items
- Assumptions
- Payment terms
- Validity
- Discount representation if supported
- Total and currency
- Save draft
- Submit for approval

### Integrity requirements

- The total must always reconcile with line items.
- Submit for approval must call the real approval action.
- Account linkage must be populated when the account is known.
- Validation errors must be specific and inline.

---

## 9.14 Quote detail — `/quotes/$id`

### Purpose

Operate one quote through edit, approval, issue, revision, acceptance and accounting handoff.

### Required hierarchy

1. Quote identity, account and status
2. Primary lifecycle action
3. Commercial summary
4. Document content
5. Version history
6. Approval history
7. Job-sheet handoff
8. Activity

### UX requirements

- Make immutable or locked states visually clear.
- Separate document editing from lifecycle actions.
- Show accepted and issued versions distinctly.
- Explain why an action is unavailable.
- Avoid placing all actions in one crowded toolbar.

---

## 9.15 Quote PDF — `/quotes/$id/pdf`

### Purpose

Provide a clean client-facing printable document.

### Requirements

- Preserve the existing route and data contract.
- Use consistent Fimmick branding.
- Ensure print-safe page breaks.
- Keep totals and terms readable.
- Avoid app navigation in print output.
- Test A4 and browser PDF export.

---

## 9.16 Approvals — `/approvals`

### Purpose

Provide a controlled decision queue for commercial and operational approvals.

### Required structure

- Pending count and ageing metrics
- Filters by type, age, owner and risk where supported
- Queue list
- Selected detail panel
- Decision notes
- Approve, reject or request changes/escalate

### Decision context

Show:

- Request type
- Requesting user or agent
- Related account/record
- Financial impact
- Summary
- Supporting evidence
- Created time and age
- Assigned reviewer

### Correctness

After a quote decision, refresh approval, quote, account commercial and account activity data where applicable.

---

## 9.17 Job Sheets list — `/job-sheets`

### Purpose

Manage accepted commercial scope and accounting handoff.

### Required features

- Status filters
- Accounting-review queue
- Owner
- Date
- Search by job-sheet, quote, account or client

### Row content

Show:

- Job-sheet number
- Account/client
- Source quote
- Status
- Total and currency
- Sales owner
- Accounting owner
- Billing progress
- Last update

---

## 9.18 Job Sheet detail — `/job-sheets/$id`

### Purpose

Provide a precise, auditable handoff from accepted quote to accounting.

### Required sections

1. Accepted scope summary
2. Linked quote and accepted version
3. Billing portions
4. PO and client-order references
5. Xero customer and invoice references
6. Accounting notes
7. Acceptance/lock state
8. Activity history

### Integrity requirements

- Clearly differentiate editable, accepted and locked states.
- Protect Xero-linked billing portions.
- Make irreversible actions explicit.
- Do not hide server validation errors behind generic toasts.

---

## 9.19 Tasks — `/tasks`

### Purpose

Manage cross-lifecycle work, not merely a generic checklist.

### Required views

- My tasks
- Due today
- Overdue
- Unassigned where permitted
- Completed
- By account or related object

### Row/card content

Show:

- Task title
- Priority
- Status
- Due date
- Owner
- Related account/lead/client/project where available
- Source or created-by-agent indicator

### Interaction

- Preserve real status changes.
- After mutation, refresh related account activity and relevant detail views.
- Use optimistic updates only when rollback and error feedback are reliable.

---

## 9.20 AI Review — `/ai-review`

### Purpose

Provide a focused human-review queue for AI-generated work.

### Layout

Use a master-detail workspace:

- Left: compact queue
- Right: selected decision context

### Queue item content

Show:

- Approval type
- Account/subject
- Agent
- Confidence
- Age
- Risk or reason for review
- Status

### Detail content

Show:

- Proposed action
- Agent summary
- Relevant source context
- Confidence
- Related record
- Reviewer notes
- Approve, reject and request changes/escalate

### Required improvements

- Keep the selected item synchronized after a decision.
- Show clear loading/submitting state.
- Prevent double submission.
- Return to an intelligent next item after decision.
- Make queue-empty state positive but operational.

Use “AI Ops” rather than “Agent Monitor” in links.

---

## 9.21 AI Ops Control Tower — `/agents`

### Purpose

Monitor the health, attention workload, cost and behavior of the Fimmick AI workforce.

### Required top metrics

- Runs in the previous 24 hours
- Success rate
- Needs attention
- Token usage
- Average confidence
- Running jobs
- Pending approvals
- Stuck jobs

Do not overload the first row. Four primary cards with supporting hints are sufficient.

### AI workforce cards

Each agent card should show:

- Agent name and workflow
- Catalogue state
- Runs over 24 hours
- Success rate
- Attention count
- Activity sparkline
- Last run
- Direct Inspect link

### Attention queue

Prioritize:

1. Stuck runs
2. Recent failures
3. Waiting approvals

Show:

- Issue type
- Agent
- Subject
- Age
- Summary
- Direct Inspect or Review action

### Recent runs

Show:

- Agent
- Workflow
- Trigger
- Status
- Duration
- Tokens
- Confidence
- Time
- Expandable summary

### Integrity rule

Do not show pause, replay, threshold, model or auto-approval controls unless they are persisted, authorized, audited and enforced server-side.

---

## 9.22 Agent detail — `/agents/$name`

### Purpose

Inspect one agent’s behavior and current governance profile.

### Tabs

1. **Runs**
2. **Memory**
3. **Governance**

### Runs

Show:

- Paginated run history
- Status
- Time
- Confidence
- Tokens
- Output summary
- Expandable input snapshot
- Direct link to full trace when a trace route exists

### Memory

Until real memory persistence and policies exist, show a truthful read-only explanation covering:

- No long-term memory currently persisted
- Required retention policy
- Required access controls
- Required deletion and audit behavior

### Governance

Show the code-defined catalogue state as read-only:

- Workflow identity
- Runtime catalogue state
- Model catalogue
- Human-review behavior

Explain what is required before settings become editable:

- Versioned policy store
- Server-side dispatch enforcement
- Capability checks
- Audit log
- Rollback
- Runtime telemetry

---

## 9.23 Reports — `/reports`

### Purpose

Provide trustworthy operating and management analytics.

### Required improvements

- Select a meaningful default report instead of rendering an empty report area.
- Keep range selection visible and keyboard accessible.
- Improve KPI hierarchy.
- Give charts descriptive titles, subtitles and accessible summaries.
- Handle loading, empty and error states distinctly.
- Ensure charts resize cleanly.

### Export integrity

The current Export CSV action must not merely show a success toast.

Implement one of these:

1. A real client-side export from the loaded, authorized dataset; or
2. A real server-side export endpoint with an audit event; or
3. A clearly disabled “Export unavailable” state.

Do not claim an export is queued unless a queue exists.

### Future reporting direction

Prepare the layout to support, without fake data:

- Forecast accuracy
- Campaign attribution
- Gross margin
- Renewal and expansion
- AI cost per outcome
- Human-review workload
- AI quality and latency

---

## 9.24 Settings — `/settings`

### Purpose

Make operational configuration understandable and safe.

### Requirements

- Group settings by domain.
- Clearly distinguish personal, workspace, integration and administrative settings.
- Do not duplicate Admin functionality.
- Do not show fields that are not persisted.
- Provide explicit save state, validation and error recovery.
- Explain permissions for restricted settings.

Potential groups, only when backed:

- Profile and preferences
- Notifications
- Workspace defaults
- Products and pricing
- Integrations
- Automation
- AI governance

---

## 9.25 Admin workspace — `/admin/*`

### Purpose

Manage people, teams, access and audit without exposing unauthorized options.

### Required consistency

- Preserve capability-aware navigation.
- Use the same page-header and data-table conventions as the main product.
- Make dangerous actions explicit.
- Use confirmation dialogs with consequences.
- Show status, role, team and access data clearly.
- Preserve auditability.

### Admin routes

Complete and visually align:

- `/admin`
- `/admin/people`
- `/admin/people/$id`
- `/admin/teams`
- `/admin/teams/$id`
- `/admin/access`
- `/admin/audit`

Do not weaken protected-role rules or management scope.

---

# 10. Shared component system

Create or refine shared feature-level components rather than repeating page-specific markup.

Potential shared patterns:

- `WorkspaceHeader`
- `MetricStrip`
- `AttentionQueue`
- `FilterToolbar`
- `DataTableShell`
- `ResponsiveRecordList`
- `RecordSummaryPanel`
- `LifecycleBadge`
- `OwnerDisplay`
- `RelationshipHealthDisplay`
- `AiRunStatus`
- `EvidenceList`
- `EmptyWorkspaceState`
- `FilteredEmptyState`
- `ErrorState`
- `LoadingSkeleton`
- `ActivityTimeline`
- `StickyActionBar`

Do not create abstractions merely to reduce line count. Components should represent stable product patterns.

---

# 11. Tables and responsive records

## Desktop

- Keep key identifying columns sticky only when useful.
- Use compact headers.
- Right-align numeric data.
- Use clear hover and selected states.
- Keep row-level actions predictable.
- Avoid horizontal overflow for ordinary data volumes.

## Tablet

- Hide secondary columns progressively.
- Preserve primary actions.
- Use details disclosure for lower-priority fields.

## Mobile

Do not simply place a desktop table in a horizontal scroll container for every page.

For primary workflows, convert rows into cards showing:

- Identity
- State
- Primary metric
- Due/age
- Owner
- Main action

Horizontal scrolling is acceptable only for advanced or finance-heavy detail tables where the column relationship is essential.

---

# 12. Forms and actions

## 12.1 Forms

- Use clear labels, not placeholder-only inputs.
- Group fields by user decision.
- Place validation close to the field.
- Preserve entered data after recoverable failure.
- Show unsaved state where relevant.
- Disable submit during mutation.
- Avoid modal forms that exceed viewport height without internal scrolling.

## 12.2 Action hierarchy

Each page should have:

- One primary action
- Up to two visible secondary actions
- Remaining actions in contextual menus

Destructive actions must never visually compete with the primary action.

## 12.3 Mutation feedback

Every mutation must provide:

- In-progress state
- Success feedback
- Failure feedback
- Correct query invalidation
- Rollback if optimistic
- No duplicate submission

Do not rely solely on toast notifications when the page state itself should change visibly.

---

# 13. Data visualization rules

- Use charts only when a visual pattern improves a decision.
- Use tables for exact comparisons.
- Avoid pie charts for many categories.
- Keep axis and tooltip formatting consistent.
- Use semantic colors sparingly.
- Always provide a text summary or accessible label.
- Display no-data and insufficient-data states honestly.
- Do not interpolate or fabricate missing business data.

---

# 14. Accessibility requirements

Meet WCAG 2.2 AA wherever reasonably achievable.

Required:

- Keyboard-operable navigation and actions
- Visible focus state
- Semantic headings
- One clear H1 per page
- Accessible table headers
- Accessible names for icon buttons
- Status conveyed through text and color
- Minimum readable contrast
- Logical tab order
- Reduced-motion support
- Form errors associated with fields
- Dialog focus management
- Touch targets suitable for mobile
- No keyboard-only inaccessible drag interaction; provide an alternative stage-change action

Test at minimum with keyboard-only navigation and browser accessibility inspection.

---

# 15. Performance requirements

- Avoid loading all detail datasets on initial route load.
- Keep large charts lazy-loaded.
- Prefer compact read models.
- Avoid N+1 server calls.
- Do not invalidate the entire router after every small mutation.
- Invalidate the narrowest correct query keys.
- Preserve route-level code splitting.
- Review bundles over 500 KB and split where practical.
- Avoid shipping raw large JSON payloads when a summary is sufficient.
- Use skeletons only where they match final layout.

Known cleanup item:

`src/routes/__tests__/route-query-keys.test.ts` should not be interpreted as a route. Resolve the route-discovery warning using the repository’s configured ignore convention without weakening test discovery.

---

# 16. Product integrity audit during revision

Search for and report all instances of:

- Success toast without a server action
- Local-only switch representing persisted state
- Local-only slider representing runtime configuration
- Replay or retry action without idempotency
- Disabled action without explanation
- Export action without an actual artifact
- Placeholder “coming soon” presented as active navigation
- Raw database or driver errors shown to users
- Stale query invalidation
- Duplicate route/query key construction
- Unscoped or capability-inappropriate navigation

Fix clear frontend cases within scope. Document backend-dependent cases.

---

# 17. Implementation phases

## Phase A — Audit and design system alignment

1. Produce route/function parity map.
2. Inventory all shared patterns and inconsistent implementations.
3. Identify fake or incomplete controls.
4. Define the revised navigation and visual system.
5. Create a concise implementation checklist.

## Phase B — Global shell and foundational components

1. Revise sidebar information architecture.
2. Refine top header.
3. Standardize command headers.
4. Standardize metric strips.
5. Build consistent loading, empty and error states.
6. Establish responsive list/table patterns.

## Phase C — Revenue and commercial workflows

Complete:

- Revenue Desk
- Leads list/detail
- Quotes list/builder/detail/PDF
- Approvals
- Job Sheets list/detail

## Phase D — Relationship and retention workflows

Complete:

- Accounts list/Account 360
- Clients list/detail
- Relationships
- Renewals
- Tasks
- Campaigns list/detail

## Phase E — AI and operating workspaces

Complete:

- AI Review
- AI Ops Control Tower
- Agent detail
- Reports
- Settings
- Admin alignment

## Phase F — Responsive, accessibility and QA pass

1. Test 1440px desktop.
2. Test 1024px laptop/tablet landscape.
3. Test 768px tablet.
4. Test 375px mobile.
5. Test keyboard navigation.
6. Inspect console and network errors.
7. Verify all links and actions.
8. Verify dark mode if supported.
9. Run full repository gates.
10. Create reviewable deployment.

Do not stop after an early phase. Complete all stages in one branch unless a genuine blocker is documented.

---

# 18. Required validation commands

Run the repository’s full gates:

```bash
bun install --frozen-lockfile
bun run test
bun run lint
bunx tsc --noEmit
bun run build
git diff --check
```

Also run browser verification against the preview deployment.

The final report must distinguish:

- Passed checks
- Environment-gated/skipped checks
- Existing baseline warnings
- New warnings introduced by the revision
- Known backend dependencies

Do not report a skipped integration suite as passed.

---

# 19. Acceptance criteria

The frontend revision is complete only when all of the following are true.

## Product coherence

- Every existing authenticated route has been reviewed and visually aligned.
- Navigation reflects lifecycle outcomes.
- Product language consistently supports Total CRM + AI Operations.
- Pages no longer feel like unrelated templates.

## Functional integrity

- Existing real actions continue to work.
- No fake switch, slider, replay or export remains presented as operational.
- Query invalidation refreshes all affected workspaces.
- Permission and scope behavior remains server-enforced.
- No direct database access is introduced into route components.

## AI Ops

- `/agents` presents fleet health, attention queue and recent runs.
- `/agents/$name` presents truthful run history, memory status and governance state.
- `/ai-review` supports reliable human decisions.
- AI-generated information is visually distinct from confirmed human decisions.

## Responsive behavior

- No global horizontal overflow at 375px.
- Primary workflows do not depend on tiny desktop tables.
- Headers and actions wrap correctly.
- Dialogs and drawers remain usable on small screens.

## Accessibility

- Keyboard navigation works across primary workflows.
- Focus is visible.
- Icon buttons have names.
- Status is not color-only.
- Heading structure is logical.

## Quality

- Tests, lint, type checking and build pass, subject to clearly documented environment gates.
- No new console errors.
- No broken route or asset.
- Preview deployment is reviewable.
- Production remains unchanged.

---

# 20. Deliverables

Provide all of the following:

1. **Revised frontend code** on a dedicated branch.
2. **Draft pull request** with scope, screenshots and validation evidence.
3. **Vercel preview deployment**.
4. **Route/function parity report** showing every route reviewed.
5. **Before/after product summary**.
6. **Changed-file summary** grouped by shell, shared components and routes.
7. **Product-integrity findings** for any incomplete backend-dependent controls.
8. **Responsive QA report** for 1440, 1024, 768 and 375 widths.
9. **Accessibility QA summary**.
10. **Performance and bundle findings**.
11. **No production publication or merge** before approval.

---

# 21. Recommended copy system

Use concise, operational language.

Examples:

- “Needs attention” rather than “Critical AI Insights”
- “Waiting approval” rather than “Pending Human-in-the-Loop Governance”
- “Inspect run” rather than “Explore execution intelligence”
- “No work needs attention” rather than “Everything is magically optimized”
- “Last updated 4 minutes ago” where freshness matters
- “Configuration is read-only until runtime policy enforcement is enabled” for unavailable governance controls

Avoid exaggerated AI language. Trust comes from evidence, control and clarity.

---

# 22. Final execution instruction

Begin by onboarding the current repository and generating a route/function parity checklist. Then implement the complete frontend revision across all authenticated product routes using the existing architecture and real data contracts.

Preserve the current business functionality, permissions, Neon and n8n integrations. Improve information architecture, operational hierarchy, responsiveness, accessibility, consistency and product integrity.

Where a requested experience depends on missing backend functionality, do not simulate it. Present the state truthfully, document the dependency and preserve a clear future path.

Create a dedicated branch, a draft pull request and a reviewable Vercel preview. Do not merge, publish or replace production until explicit approval.
