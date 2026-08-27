# Navigation and Visual System Decisions

Step A6. Decided once here, applied everywhere in Phases B–E. Every decision points at a real token, class or file.

Governing sources: Instruction §6 (IA), §7 (visual direction), §8 (shell); evidence from [repo-map.md](./repo-map.md) and [pattern-inventory.md](./pattern-inventory.md).

---

## 1. Sidebar model

### Groups

Six lifecycle groups plus Administration, per Instruction §6.1. Current state and the exact delta:

| Group | Items | Change from today |
|---|---|---|
| Today | Revenue Desk `/` | none |
| Acquire | Leads `/leads`, **Campaigns** `/campaigns`, AI Review `/ai-review` | Campaigns **moves in** from Convert |
| Convert | Quotes `/quotes`, Approvals `/approvals` | Job Sheets and Campaigns **move out** |
| **Deliver** | Job Sheets `/job-sheets` | **new group**, item moves from Convert |
| Retain & Grow | Accounts, Active Clients, Relationships, Renewals, Tasks | none |
| Operate | **AI Ops** `/agents`, Reports `/reports`, Settings `/settings` | "Agents" **relabelled** "AI Ops" |
| Administration | existing capability-gated entry | none |

No group exceeds seven items; the largest is Retain & Grow at five.

### Routes that deliberately stay out of navigation

`/account`, `/notifications`, `/clients/import`, `/quotes/new`. Each has a real inbound path (post-invite redirect, the notification bell, a link from `/clients`, and the "New quote" action respectively). Instruction §4.3 requires a working page *and* a real data source before adding navigation; these qualify on that test but do not belong in a lifecycle group — they are entered from context, not browsed to. Adding them would push Retain & Grow and Operate past the seven-item guidance for no operational gain.

`/admin/` is reached through the existing Administration entry's first-destination resolution, which is preserved untouched.

### Behaviour

- **Active state** — keep `isSidebarItemActive` (`src/lib/sidebar-active.ts`) exactly as is. It already implements the required rule: active when the pathname equals the item path or starts with `${path}/`, with `/` matched exactly. No change needed.
- **Collapse** — keep `Sidebar collapsible="icon"`. `SidebarMenuButton` already receives `tooltip={item.title}`, so collapsed-mode accessible names are already correct.
- **Favorites, sign-out, identity** — preserved unchanged in the footer.
- **Admin gating** — preserved exactly, including first-destination resolution. Plan §0.6 requires human approval before touching capability modules; this branch does not touch them.
- **Badges** — the current sidebar has none. None are added. A badge is added only if it carries a truthful live count sourced from `crmQueryKeys`; the pending-approvals count is the only candidate, and it is deferred rather than introduced speculatively.
- **Mobile** — the existing drawer renders the same group structure; no separate mobile IA.

### Header identity

Expanded: `Fimmick ClientOps` with the descriptor `Total CRM + AI Operations`. Collapsed: product mark only, with icon tooltips carrying full labels.

---

## 2. Token roles

`src/styles.css` already defines 39 light and 38 dark custom properties in OKLCH, with an explicit cascade-layer order. Mapping Instruction §7.2's roles onto what exists:

| §7.2 role | Token | Status |
|---|---|---|
| Neutral app background | `--background` | exists |
| High-contrast work surface | `--card` | exists (white on `0.985` light; `0.2` on `0.15` dark) |
| Differentiated navigation rail | `--sidebar` | **exists but fails in light mode — see below** |
| One primary accent | `--primary` (+ `--accent`) | exists |
| Semantic success / warning / destructive / info | `--success`, `--warning`, `--destructive`, `--info`, each with `-foreground` | exists, complete |
| Muted secondary context | `--muted`, `--muted-foreground` | exists |
| Subtle attention tint for exception queues | — | **missing** |

### Change 1 — differentiate the light-mode navigation rail

Dark mode is fine: `--sidebar: oklch(0.18 0.025 262)` sits against `--background: oklch(0.15 0.02 260)`.

Light mode is not: `--sidebar: oklch(0.98 0.004 250)` against `--background: oklch(0.985 0.004 250)` — a **0.005 lightness difference**, which is invisible. Instruction §7.2 asks for a "dark or strongly differentiated navigation rail" and light mode currently has neither.

Decision: darken the light-mode `--sidebar` (and adjust `--sidebar-accent` / `--sidebar-border` to stay coherent) so the rail reads as a distinct surface. Change the token values in `src/styles.css` only — never a hard-coded colour in a component, per plan §0.4 and the plan's own allowance in A6. Contrast of `--sidebar-foreground` against the new `--sidebar` must be re-checked at AA.

### Change 2 — add an attention tint

No token expresses §7.2's "subtle attention tint for exception queues". The attention queue is the product's central pattern (§9.1, §9.8, §9.21), so it needs a real role rather than reusing `--warning` at low opacity ad hoc.

Decision: add `--attention` and `--attention-foreground` in both schemes, exposed through the `@theme inline` block like every other colour. Used only as the surface behind exception rows; status text keeps the semantic tone tokens.

These are the **only** two token additions. Everything else reuses what exists.

### Chart colours

`--chart-1..5` already map to primary / info / success / warning / destructive — semantically consistent. Instruction §13's "semantic colours only for semantic meaning" is satisfied by construction. No change.

---

## 3. Type scale

Instruction §7.3, expressed in the Tailwind classes actually available:

| Role | Instruction | Class | Note |
|---|---|---|---|
| Page title (h1) | 24–30px | `text-2xl` (24px), `lg:text-3xl` (30px) | **both current headers use `text-xl` (20px) and must move up** |
| Workspace section title | 16–18px | `text-base` (16px) / `text-lg` (18px) | for `SectionHeader` |
| Body and table text | 13–14px | `text-sm` (14px) | already the norm |
| Supporting metadata | 11–12px | `text-xs` (12px) | already the norm |
| KPI value | 22–30px | `text-2xl` / `text-3xl` | with `tabular-nums` |

**Tabular numerals are already global for tables** — `src/styles.css` sets `table { font-variant-numeric: tabular-nums; }`. So the `tabular-nums` utility is needed only outside tables: KPI values, metric strips, inline currency and durations.

Weight discipline (§7.3): reserve `font-semibold` for page titles, KPI values and priority markers. Body and table text stay `font-normal`; table headers `font-medium`. No page-wide bolding.

---

## 4. Spacing

| Role | Value | Class |
|---|---|---|
| Desktop content padding | ~24px | `px-6 py-6` |
| Mobile content padding | 16px | `px-4` |
| Section rhythm | 20–28px | `space-y-6` (24px) |
| Table row height | compact, not cramped | `py-2.5` with `text-sm` |

`px-6` is already the prevailing convention in both existing headers, so this codifies current practice rather than changing it.

Per §7.4 and plan §2.10: prefer dividers, subtle backgrounds and spacing over nested cards. A card inside a card only when the inner element is independently meaningful.

---

## 5. Status map

`src/lib/status-labels.ts` is created in B7 and becomes the single source, with `StatusBadge` consuming it (PC-10) so the label map and the style map cannot drift.

The existing `STATUS_STYLES` in `status-badge.tsx` is a **flat** `Record<string, string>` of 29 keys with no domain parameter, which means cross-domain collisions are possible today (`active`/`paused` are shared by agents and lifecycle; `pending` and `pending_approval` are different domains' near-synonyms). The new map is domain-aware — `getStatusLabel(domain, rawStatus)` — and **must preserve the rendered result for all 29 existing keys**, verified by a test that enumerates them.

Raw values found in the repository, mapped to the canonical vocabulary of plan §2.5:

| Domain | Raw value | Label | Tone |
|---|---|---|---|
| leads | `new` | New | info |
| leads | `qualified` | Qualified | info |
| leads | `replied` | Replied | neutral |
| leads | `quoted` | Quoted | warning |
| leads | `approved` | Approved | success |
| leads | `won` | Won | success |
| leads | `lost` | Lost | neutral |
| quotes | `draft` | Draft | neutral |
| quotes | `pending_approval` | Pending approval | warning |
| quotes | `sent` | Sent | info |
| quotes | `viewed` | Viewed | info |
| quotes | `accepted` | Accepted | success |
| quotes | `rejected` | Rejected | destructive |
| tasks | `open` | Open | info |
| tasks | `in_progress` | In progress | warning |
| tasks | `done` | Done | success |
| approvals | `pending` | Waiting approval | warning |
| approvals | `escalated` | Needs attention | destructive |
| agent runs | `running` | Running | info |
| agent runs | `ready_for_review` | Waiting approval | warning |
| agent runs | `waiting_approval` | Waiting approval | warning |
| agent runs | `completed` | Completed | success |
| agent runs | `failed` | Failed | destructive |
| agent runs | `idle` | Idle | neutral |
| agents | `active` | Active | success |
| agents | `paused` | Paused | neutral |
| priority | `high` / `medium` / `low` | High / Medium / Low | destructive / warning / neutral |

Two deliberate consolidations, both required by §7.5's "do not introduce multiple labels for the same state": `pending` and `ready_for_review` both render **Waiting approval**; `escalated` renders **Needs attention**.

**Three canonical labels have no stored raw value and must never be faked into one.** `Stuck`, `At risk` and `Overdue` are *derived* states — computed from a threshold, a risk score and a due-date comparison respectively, not read from a status column. They get their own derivation helpers and are documented as derived, so nobody later adds a phantom enum member to the database to satisfy the vocabulary.

Unknown values fall back to the raw value in neutral tone — never crash, never invent. This preserves today's `replace(/_/g, " ")` behaviour.

Tone maps to the existing semantic tokens. **Status always renders text**, optionally with an icon, never colour alone (§14).

---

## 6. Component list

All shared components live in **`src/components/sales/`** behind its existing barrel (PC-5).

A naming caveat, recorded rather than acted on: the folder name `sales/` is narrower than its contents, which now serve Deliver, Retain & Grow and Operate as well. Renaming it to `workspace/` would touch 10 route files for no functional gain and is out of scope for this branch. It is worth doing as a standalone rename later.

| Component | Action | File |
|---|---|---|
| `WorkspaceHeader` | **converge** `PageHeader` + `CommandHeader` | `sales/workspace-header.tsx` |
| `MetricStrip` | **extend** (four-metric cap, `tabular-nums`, `href`, `updatedAt`) | `sales/metric-strip.tsx` |
| `RecordSummaryPanel` | **promote** from `sales/context-panel.tsx` | `sales/record-summary-panel.tsx` |
| `EmptyWorkspaceState` | **extend** `empty-state.tsx` / `work-surface-empty.tsx` | `sales/states.tsx` |
| `StatusBadge`, `LifecycleBadge`, `AiRunStatus` | **extend** `status-badge.tsx`, fed by `status-labels.ts` | `components/status-badge.tsx`, `sales/ai-run-status.tsx` |
| `DataTableShell`, `ResponsiveRecordList` | create | `sales/data-table-shell.tsx`, `sales/responsive-record-list.tsx` |
| `AttentionQueue`, `FilterToolbar`, `ActivityTimeline`, `StickyActionBar`, `SectionHeader` | create | `sales/*` |
| `OwnerDisplay`, `RelationshipHealthDisplay`, `EvidenceList` | create | `sales/*` |
| `LoadingSkeleton`, `FilteredEmptyState`, `ErrorState`, `PermissionDeniedState`, `StaleDataIndicator` | create | `sales/states.tsx` |

Supporting libraries: `src/lib/status-labels.ts` (B7), `src/lib/errors.ts` (B5), `src/lib/csv.ts` (E4), and the consolidated invalidation helper (PC-8).

### Mutation feedback helper

Because `useMutation` does not exist in this codebase (PC-3), Instruction §12.3's guarantees are delivered by a small helper wrapping the existing imperative shape — in-progress flag, success feedback, failure feedback through `toSafeErrorMessage`, correct invalidation, and guaranteed no double submission. It wraps `await serverFn(...)`; it does not introduce a new state-management idiom.

It must also handle the `missing_webhook` sentinel: six server functions return `{ triggered: false, reason: "missing_webhook" }` rather than throwing, and three call sites currently toast success anyway. The helper treats a falsy `triggered` as a **failure to report**, not a success.

---

## 7. Dark mode

Dark mode exists and is essentially complete: 38 `.dark` overrides against 39 `:root` properties. The single light-only property is `--radius`, which is correct — it is a geometry value, not a colour. `--accent` deliberately flips polarity between schemes.

Rule for this branch: **every new token role is defined in both schemes.** That applies to the two additions in §2 — the light-rail change (dark already differentiated, but re-check the pair) and `--attention` / `--attention-foreground` (both schemes).

Toggling is via the `.dark` class with `@custom-variant dark (&:is(.dark *))`, driven by `theme-toggle.tsx`. `html`/`html.dark` set `color-scheme`, so native form controls follow. No change.

---

## 8. Two global hazards to carry into Phase F

**`body { overflow-x: hidden }`** — this *masks* horizontal overflow rather than preventing it. Instruction §19's "no global horizontal overflow at 375px" can therefore appear satisfied while content is silently clipped and unreachable, which is worse than a visible scrollbar. F1 must assert on `document.documentElement.scrollWidth` **and** check that no content is clipped, rather than treating the absence of a scrollbar as a pass.

**`prefers-reduced-motion` is already handled** globally in the base layer. Phase B must not introduce animation that escapes it — in particular, no inline `style` transitions, which the global rule cannot reach.
