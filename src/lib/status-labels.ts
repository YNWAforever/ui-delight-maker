import {
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  PauseCircle,
  ShieldAlert,
  XCircle,
  type LucideIcon,
} from "lucide-react";

import { getBusinessDateKey } from "./business-date";

/**
 * The single source for status wording and tone.
 *
 * It replaces the flat `Record<string, string>` that lived in `status-badge.tsx`: 29 keys
 * spanning six unrelated domains with no way to say which domain a value came from. That
 * shape works only for as long as no two domains use the same word, and the product is
 * already one migration away from breaking it — `active` and `paused` mean an agent's
 * dispatch state here and would mean an account's standing the moment lifecycle joined the
 * same map. `getStatusLabel(domain, raw)` gives callers a way to say which vocabulary they
 * are speaking before that collision is a production bug.
 *
 * Two rules are load-bearing:
 *
 * 1. **Text always renders.** Tone is a second channel, never the only one. Every entry
 *    here carries a label; nothing is identified by colour alone.
 * 2. **Unknown values never crash and never get invented labels.** An unrecognised value
 *    falls back to itself with underscores replaced, in neutral tone — the same thing the
 *    old flat map did, so a status column gaining a value ships a plain word rather than
 *    an exception or a plausible-looking lie.
 *
 * Source of the table: docs/frontend-revision/design-decisions.md §5.
 */

/**
 * The five semantic tones, each backed by an existing token pair in `src/styles.css`.
 *
 * `primary` and `accent` are deliberately absent. They were used by four statuses in the
 * old map (`qualified`, `viewed`, `replied`), but they are brand roles, not semantic ones:
 * a reader cannot learn "primary means qualified" the way they can learn "info means in
 * flight". §5's Tone column collapses them into these five.
 */
export type StatusTone = "neutral" | "info" | "success" | "warning" | "destructive";

/** The vocabularies. One per status column that reaches the UI. */
export type StatusDomain =
  | "leads"
  | "quotes"
  | "tasks"
  | "approvals"
  | "agentRuns"
  | "agents"
  | "priority"
  | "campaigns";

/**
 * Fields are readonly because a lookup hands back the map's own entry rather than a copy.
 * One caller writing to `result.label` would relabel that status for the whole app.
 */
export type StatusPresentation = {
  /** Always rendered. Sentence case, matching §5's Label column. */
  readonly label: string;
  readonly tone: StatusTone;
  /**
   * Optional reinforcement, present only on states that stop work. Consumers decide
   * whether to render it; `StatusBadge` does not, because adding an icon to 29 existing
   * badges is a visual change this step is not making.
   */
  readonly icon?: LucideIcon;
};

/**
 * Tone to classes. One class string per tone, not one per status.
 *
 * The old map hand-tuned opacity per key — `bg-info/10` for `new` but `bg-info/15` for
 * `sent`, `bg-success/15` for `done` but `bg-success/20` for `won` — differences no reader
 * can decode and no rule generated. Each tone gets one appearance so that two badges of
 * the same tone are actually the same badge.
 */
export const STATUS_TONE_CLASS: Record<StatusTone, string> = {
  neutral: "bg-muted text-muted-foreground border-border",
  info: "bg-info/10 text-info border-info/20",
  success: "bg-success/15 text-success border-success/30",
  warning: "bg-warning/15 text-warning-foreground border-warning/30",
  destructive: "bg-destructive/15 text-destructive border-destructive/30",
};

/** Shown when a status value is null, undefined or blank. Never a guess at the real one. */
export const UNKNOWN_STATUS_LABEL = "Unknown";

const LEAD_STATUS: Record<string, StatusPresentation> = {
  new: { label: "New", tone: "info" },
  qualified: { label: "Qualified", tone: "info" },
  replied: { label: "Replied", tone: "neutral" },
  quoted: { label: "Quoted", tone: "warning" },
  approved: { label: "Approved", tone: "success" },
  won: { label: "Won", tone: "success" },
  lost: { label: "Lost", tone: "neutral" },
};

const QUOTE_STATUS: Record<string, StatusPresentation> = {
  draft: { label: "Draft", tone: "neutral" },
  pending_approval: { label: "Pending approval", tone: "warning", icon: ClipboardCheck },
  sent: { label: "Sent", tone: "info" },
  viewed: { label: "Viewed", tone: "info" },
  accepted: { label: "Accepted", tone: "success", icon: CheckCircle2 },
  rejected: { label: "Rejected", tone: "destructive", icon: XCircle },
};

const TASK_STATUS: Record<string, StatusPresentation> = {
  open: { label: "Open", tone: "info" },
  in_progress: { label: "In progress", tone: "warning" },
  done: { label: "Done", tone: "success", icon: CheckCircle2 },
};

/**
 * `pending` renders "Waiting approval" and `escalated` renders "Needs attention".
 *
 * Both are deliberate rewordings from §5, required by Instruction §7.5's "do not introduce
 * multiple labels for the same state". "Pending" was the same state as an agent run's
 * `waiting_approval` under a different word, and "Escalated" described the mechanism that
 * moved the record rather than what the reader has to do about it.
 */
const APPROVAL_STATUS: Record<string, StatusPresentation> = {
  pending: { label: "Waiting approval", tone: "warning", icon: ClipboardCheck },
  escalated: { label: "Needs attention", tone: "destructive", icon: ShieldAlert },
};

const AGENT_RUN_STATUS: Record<string, StatusPresentation> = {
  running: { label: "Running", tone: "info" },
  // Third spelling of the same state, and the third to be folded into one label.
  ready_for_review: { label: "Waiting approval", tone: "warning", icon: ClipboardCheck },
  waiting_approval: { label: "Waiting approval", tone: "warning", icon: ClipboardCheck },
  completed: { label: "Completed", tone: "success", icon: CheckCircle2 },
  failed: { label: "Failed", tone: "destructive", icon: XCircle },
  idle: { label: "Idle", tone: "neutral" },
};

const AGENT_STATUS: Record<string, StatusPresentation> = {
  active: { label: "Active", tone: "success" },
  paused: { label: "Paused", tone: "neutral" },
};

const PRIORITY_STATUS: Record<string, StatusPresentation> = {
  high: { label: "High", tone: "destructive" },
  medium: { label: "Medium", tone: "warning" },
  low: { label: "Low", tone: "neutral" },
};

/**
 * The campaign surface's vocabulary, covering four stored columns in one domain.
 *
 * `campaigns.status`, `campaign_members.attendee_status`, `.follow_up_status` and
 * `.conversion_outcome` share this map because their raw values do not collide — the one
 * value two of them do share, `completed`, means the same thing in both and therefore
 * renders the same label and tone. Splitting them into four domains would put four names
 * in `StatusDomain` for one screen and would still not stop a collision, because nothing
 * checks across domains.
 *
 * Deliberately **not** merged into `FLAT_STATUS`. `draft`, `active`, `completed` and
 * `in_progress` already resolve there through quotes, agents, agent runs and tasks with
 * identical wording, so merging would add only `planned`, `archived` and the attendee
 * vocabulary while changing `KNOWN_STATUS_VALUES` — the enumerated contract two test
 * suites assert against. Campaign screens pass `domain="campaigns"`; a domainless caller
 * keeps exactly the answer it got before this entry existed.
 *
 * `unknown` is an attendee status a CSV can actually contain, so it renders "Not recorded"
 * rather than borrowing `UNKNOWN_STATUS_LABEL`, which means "no value at all".
 */
const CAMPAIGN_STATUS: Record<string, StatusPresentation> = {
  // campaigns.status
  draft: { label: "Draft", tone: "neutral" },
  planned: { label: "Planned", tone: "info" },
  active: { label: "Active", tone: "success" },
  completed: { label: "Completed", tone: "success", icon: CheckCircle2 },
  archived: { label: "Archived", tone: "neutral" },
  // campaign_members.attendee_status
  attended: { label: "Attended", tone: "info" },
  met: { label: "Met in person", tone: "info" },
  high_intent: { label: "High intent", tone: "success" },
  unknown: { label: "Not recorded", tone: "neutral" },
  // campaign_members.follow_up_status
  not_started: { label: "Not started", tone: "warning" },
  task_created: { label: "Task created", tone: "info" },
  in_progress: { label: "In progress", tone: "warning" },
  dismissed: { label: "Dismissed", tone: "neutral" },
  // campaign_members.conversion_outcome
  none: { label: "No outcome yet", tone: "neutral" },
  lead: { label: "Lead created", tone: "info" },
  quote: { label: "Quote raised", tone: "info" },
  engagement: { label: "Engagement created", tone: "success", icon: CheckCircle2 },
  client_activity: { label: "Client activity", tone: "success" },
};

const DOMAIN_STATUS: Record<StatusDomain, Record<string, StatusPresentation>> = {
  leads: LEAD_STATUS,
  quotes: QUOTE_STATUS,
  tasks: TASK_STATUS,
  approvals: APPROVAL_STATUS,
  agentRuns: AGENT_RUN_STATUS,
  agents: AGENT_STATUS,
  priority: PRIORITY_STATUS,
  campaigns: CAMPAIGN_STATUS,
};

/**
 * The domainless view, and the reason the rewrite is safe.
 *
 * `StatusBadge` is called without a domain at more than forty sites, so a domain-aware map
 * that only answered domain-aware questions would have broken every one of them. This merge
 * reproduces the old flat lookup exactly: no raw value appears in two domains today, so the
 * merge order below cannot silently pick a winner. If a future domain does collide, the
 * duplicate assertion in the test suite fails rather than a badge quietly changing meaning
 * in production — and the fix is for the caller to pass `domain`, not to rename the value.
 *
 * Account lifecycle is deliberately **not** merged in. It owns `active_client`, `at_risk`
 * and `churned`, and merging it would silently retone `at_risk` for every domainless
 * caller. It is reached through `getLifecycleLabel` instead.
 */
const FLAT_STATUS: Record<string, StatusPresentation> = {
  ...LEAD_STATUS,
  ...QUOTE_STATUS,
  ...TASK_STATUS,
  ...APPROVAL_STATUS,
  ...AGENT_RUN_STATUS,
  ...AGENT_STATUS,
  ...PRIORITY_STATUS,
};

/** Every raw value the seven decided domains recognise. Exported so tests can enumerate. */
export const KNOWN_STATUS_VALUES = Object.keys(FLAT_STATUS);

/**
 * `Object.hasOwn` rather than a bare index read: `FLAT_STATUS["constructor"]` returns a
 * function from the prototype chain, which is truthy, so a record whose status column
 * happened to hold "constructor" or "toString" would render a stringified function.
 */
function lookup(
  map: Record<string, StatusPresentation>,
  key: string,
): StatusPresentation | undefined {
  return Object.hasOwn(map, key) ? map[key] : undefined;
}

/** The old badge's fallback, preserved verbatim: underscores become spaces, nothing else. */
function humanizeStatusKey(key: string): string {
  return key.replace(/_/g, " ");
}

/**
 * Label, tone and optional icon for a raw status value.
 *
 * Resolution order is domain, then the merged map, then the raw value itself. The middle
 * step matters: a caller that starts passing `domain="approvals"` must not lose the ability
 * to render `approved`, which lives in the leads vocabulary but reaches approval screens
 * through shared read models. Narrowing the domain sharpens the answer; it never removes one.
 *
 * @param domain the vocabulary the value came from, or null when the caller does not know
 * @param raw the stored value, of any shape including null
 */
export function getStatusLabel(
  domain: StatusDomain | null | undefined,
  raw: string | null | undefined,
): StatusPresentation {
  const key = raw?.trim() ?? "";
  if (key === "") return { label: UNKNOWN_STATUS_LABEL, tone: "neutral" };

  const fromDomain = domain ? lookup(DOMAIN_STATUS[domain], key) : undefined;
  if (fromDomain) return fromDomain;

  const fromAnyDomain = lookup(FLAT_STATUS, key);
  if (fromAnyDomain) return fromAnyDomain;

  return { label: humanizeStatusKey(key), tone: "neutral" };
}

/* -------------------------------------------------------------------------- */
/* Account lifecycle                                                           */
/* -------------------------------------------------------------------------- */

/**
 * The six stages the database actually stores.
 *
 * Taken from `AccountLifecycleStage` in `src/lib/types.ts` and the check constraint in
 * `neon/migrations/003_client_relationship_360.sql`, not from the four a design brief
 * usually lists. `churned` and `vendor` exist and reach the UI, so they get labels here
 * rather than falling through to the raw-value path.
 *
 * Tone signals revenue health, which is why `partner` and `vendor` are not success: they
 * describe what kind of relationship this is, not how well it is going.
 */
const LIFECYCLE_STAGE: Record<string, StatusPresentation> = {
  prospect: { label: "Prospect", tone: "info" },
  active_client: { label: "Active client", tone: "success" },
  at_risk: { label: "At risk", tone: "warning", icon: ShieldAlert },
  churned: { label: "Churned", tone: "neutral" },
  partner: { label: "Partner", tone: "info" },
  vendor: { label: "Vendor", tone: "neutral" },
};

/** Every stage `LifecycleBadge` recognises. Exported so tests can enumerate. */
export const KNOWN_LIFECYCLE_STAGES = Object.keys(LIFECYCLE_STAGE);

/**
 * Label and tone for a stored account lifecycle stage.
 *
 * Note the overlap with the derived "At risk" below, because it is the one place this
 * vocabulary genuinely does have two sources. `accounts.lifecycle_stage = 'at_risk'` is a
 * curated standing that a human sets and that survives a good week; `isAtRisk(score)` is a
 * computed signal that moves with the risk model. They share a label because they mean the
 * same thing to a reader, and they must not share a column: writing a derived score back
 * into `lifecycle_stage` would overwrite the human's judgement every time the model ran.
 */
export function getLifecycleLabel(raw: string | null | undefined): StatusPresentation {
  const key = raw?.trim() ?? "";
  if (key === "") return { label: UNKNOWN_STATUS_LABEL, tone: "neutral" };

  const stage = lookup(LIFECYCLE_STAGE, key);
  if (stage) return stage;

  return { label: humanizeStatusKey(key), tone: "neutral" };
}

/* -------------------------------------------------------------------------- */
/* Derived states — computed, never stored                                     */
/* -------------------------------------------------------------------------- */

/**
 * The three canonical labels with **no raw value behind them**.
 *
 * "Stuck", "At risk" and "Overdue" are computed from a threshold, a risk score and a date
 * comparison. They are in the vocabulary because a reader needs the words, not because a
 * column produces them, and this file is the reason nobody has to add a phantom enum member
 * to `leads.status` or `tasks.status` to make the words available. A status enum should
 * only ever hold states a person or a workflow explicitly moved a record into.
 *
 * Reach them through `getDerivedStatusLabel`, and decide *whether* they apply with the
 * predicates below.
 */
export type DerivedStatus = "stuck" | "at_risk" | "overdue";

const DERIVED_STATUS: Record<DerivedStatus, StatusPresentation> = {
  stuck: { label: "Stuck", tone: "neutral", icon: PauseCircle },
  at_risk: { label: "At risk", tone: "warning", icon: ShieldAlert },
  overdue: { label: "Overdue", tone: "destructive", icon: CalendarClock },
};

/** Presentation for a derived state. Total over `DerivedStatus`, so it cannot miss. */
export function getDerivedStatusLabel(derived: DerivedStatus): StatusPresentation {
  return DERIVED_STATUS[derived];
}

const DAY_MS = 86_400_000;
const ISO_DATE_PREFIX = /^\d{4}-\d{2}-\d{2}/;

/**
 * A `YYYY-MM-DD` key for a date value, or null when there is not one.
 *
 * Two SSR hazards are handled here rather than at each call site. A bare ISO date string is
 * taken as written, because `new Date("2026-08-27")` parses as UTC midnight and then prints
 * as the previous day anywhere west of Greenwich — the classic off-by-one that makes a task
 * due today read as overdue. Anything else goes through `getBusinessDateKey`, so the day
 * boundary is Hong Kong midnight, the same boundary every other business-day calculation in
 * this codebase uses, instead of whatever timezone the rendering machine happens to be in.
 */
function toDateKey(value: string | Date | null | undefined): string | null {
  if (value == null) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : getBusinessDateKey(value);
  }
  const isoPrefix = ISO_DATE_PREFIX.exec(value)?.[0];
  if (isoPrefix) return isoPrefix;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : getBusinessDateKey(parsed);
}

function daysBetweenKeys(from: string, to: string): number {
  const time = (key: string) =>
    Date.UTC(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, Number(key.slice(8, 10)));
  return Math.floor((time(to) - time(from)) / DAY_MS);
}

/**
 * Whether a due date has passed, compared whole day against whole day.
 *
 * `today` is a parameter and not `new Date()` inside, for the same reason `relativeTime` and
 * `slaChip` take one: a component that reads the clock during render produces different
 * markup on the server and on the first client pass, and React reports a hydration mismatch.
 * Route loaders already have a business date; components should take one from
 * `useClientNow()`, which is null until after mount.
 *
 * A missing or unparseable due date is **not** overdue. A record with no deadline has not
 * missed one, and guessing otherwise puts rows into an exception queue that nobody can clear.
 */
export function isOverdue(
  dueDate: string | Date | null | undefined,
  today: string | Date,
): boolean {
  const due = toDateKey(dueDate);
  const now = toDateKey(today);
  if (due == null || now == null) return false;
  return due < now;
}

/** Days without movement before a record reads as "Stuck". */
export const STUCK_AFTER_DAYS = 7;

/**
 * Whether a record has sat at the same stage past the threshold.
 *
 * The threshold is an argument with a default rather than a constant read from inside,
 * because "stuck" is not one duration: a lead that has not moved in a week is stuck, a quote
 * awaiting a client signature for a week is normal. Callers that know their own cadence pass
 * it; callers that do not get a defensible default.
 */
export function isStuck(
  lastMovedAt: string | Date | null | undefined,
  today: string | Date,
  thresholdDays: number = STUCK_AFTER_DAYS,
): boolean {
  const moved = toDateKey(lastMovedAt);
  const now = toDateKey(today);
  if (moved == null || now == null) return false;
  return daysBetweenKeys(moved, now) >= thresholdDays;
}

/**
 * Health score at or below which an account reads as "At risk".
 *
 * 40 is not a new number: `scoreRenewalRiskFallback` in `src/lib/risk-scoring.ts` already
 * calls `score < 40` a high renewal risk, and a second threshold that disagreed with it
 * would put a badge and a risk column in visible contradiction on the same row.
 */
export const AT_RISK_SCORE_THRESHOLD = 40;

/**
 * Whether a health score is low enough to read as "At risk".
 *
 * A null score is not at risk — it is unscored, which is a different thing and belongs in a
 * different message. Scores here run 0–100 with **low meaning bad**, matching
 * `RiskScoringResult.health_score`.
 */
export function isAtRisk(
  healthScore: number | null | undefined,
  threshold: number = AT_RISK_SCORE_THRESHOLD,
): boolean {
  if (healthScore == null || Number.isNaN(healthScore)) return false;
  return healthScore < threshold;
}
