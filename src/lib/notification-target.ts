import type { NotificationRecord } from "@/lib/types";

/**
 * Where a notification's "Open" button actually goes.
 *
 * The route used to build a string and hand it to `<Link to={... as never}>` (IF-E2-52).
 * That cast switched off the router's link type checking for every Open button on the page,
 * and behind it two branches were wrong: `engagement` discarded `object_id` and sent every
 * engagement notification to the unfiltered renewals board, while the default branch linked
 * `/notifications` back to itself - an Open button that opens nothing.
 *
 * A discriminated union instead of a path string, so the call site renders a real typed
 * `Link` per case and a new `object_type` is a compile error rather than a dead button.
 *
 * Two deliberate limits are encoded here rather than papered over:
 *
 * - **`engagement` resolves to the renewals board, not to the engagement.** There is no
 *   engagement detail route in this product, so `object_id` genuinely has nowhere to land.
 *   The caller labels this link for the board it opens, so it does not promise a record it
 *   cannot show.
 * - **An unknown `object_type`, and a `client`/`lead` notification with no `object_id`,
 *   resolve to `null`.** No button at all beats a button that goes nowhere.
 */
export type NotificationTarget =
  | { kind: "approvals" }
  | { kind: "renewals" }
  | { kind: "client"; id: string }
  | { kind: "lead"; id: string }
  | null;

export function notificationTarget(
  notification: Pick<NotificationRecord, "object_type" | "object_id">,
): NotificationTarget {
  const id = notification.object_id?.trim() ?? "";

  switch (notification.object_type) {
    case "approval":
      return { kind: "approvals" };
    case "engagement":
      return { kind: "renewals" };
    case "client":
      return id === "" ? null : { kind: "client", id };
    case "lead":
      return id === "" ? null : { kind: "lead", id };
    default:
      return null;
  }
}
