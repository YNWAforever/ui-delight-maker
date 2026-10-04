import {
  STATUS_TONE_CLASS,
  getLifecycleLabel,
  getStatusLabel,
  type StatusDomain,
} from "@/lib/status-labels";
import { cn } from "@/lib/utils";

/**
 * Shared badge shell.
 *
 * `whitespace-nowrap` because a badge is one token, not a sentence. Without it a two-word
 * status broke across lines inside its own pill — "Active client" rendered as "Active" over
 * "client" — whenever the row it sits in got tight.
 *
 * No `capitalize`. The labels in `status-labels.ts` are sentence case ("Waiting approval")
 * and now paint as written; the class title-cased them on screen ("Waiting Approval") while a
 * screen reader announced the sentence-case text (UX-30). Unmapped keys fall back to a
 * sentence-case rendering of the key, so nothing relied on the class any more.
 */
const BADGE_BASE =
  "inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium whitespace-nowrap";

export type StatusBadgeProps = {
  /** The stored value. Null, undefined and blank all render "Unknown" rather than throwing. */
  value: string | null | undefined;
  /**
   * Which vocabulary `value` belongs to.
   *
   * Optional, and omitting it is not a shortcut — the label map falls back to a merged
   * lookup across every domain, which is exactly what the old flat map did. Pass it when the
   * call site knows, so that the day two domains claim the same word this badge already
   * resolves the right one.
   */
  domain?: StatusDomain;
  /**
   * Overrides the resolved label. Kept for the call sites that already compute their own
   * wording — the approvals screen renders a decision verb rather than a state.
   */
  label?: string;
  className?: string;
};

/**
 * A status pill: text, always, with tone as a second channel.
 *
 * Colour never carries the meaning on its own (Instruction §14), so there is no variant of
 * this component that renders a dot without a word.
 */
export function StatusBadge({ value, domain, label, className }: StatusBadgeProps) {
  const status = getStatusLabel(domain, value);

  return (
    <span className={cn(BADGE_BASE, STATUS_TONE_CLASS[status.tone], className)}>
      {label ?? status.label}
    </span>
  );
}

export type LifecycleBadgeProps = {
  /**
   * An `AccountLifecycleStage` — the six values the `accounts.lifecycle_stage` check
   * constraint allows. Typed as a string because read models hand it back untyped, and an
   * unrecognised stage must render rather than fail a build.
   */
  stage: string | null | undefined;
  label?: string;
  className?: string;
};

/**
 * An account's standing in the relationship lifecycle.
 *
 * Separate from `StatusBadge` rather than another domain on it, because lifecycle is the one
 * vocabulary that genuinely collides: `active` means an agent is dispatching and
 * `active_client` means an account is paying, and folding them into the shared flat lookup
 * would retone `at_risk` for every caller that never asked about accounts.
 */
export function LifecycleBadge({ stage, label, className }: LifecycleBadgeProps) {
  const lifecycle = getLifecycleLabel(stage);

  return (
    <span className={cn(BADGE_BASE, STATUS_TONE_CLASS[lifecycle.tone], className)}>
      {label ?? lifecycle.label}
    </span>
  );
}
