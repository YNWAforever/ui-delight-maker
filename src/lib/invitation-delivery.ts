/**
 * Reading what the invitation server actually reported about email delivery.
 *
 * Its own module rather than a helper inside the dialog, because the sentence a user
 * reads after inviting somebody is a product rule worth testing on its own — and because
 * the shape it reads is the shape three server functions return, not a detail of one
 * component.
 */

/**
 * How many invitations in a batch were saved but never emailed.
 *
 * The branch this replaces read `entry.delivery.status === "missing_webhook"`, and there is
 * no `status` key: `dispatchInvitationEmail` returns `{ delivered: false, reason:
 * "missing_webhook" }` (src/server/admin/invitation-email.server.ts). The branch was
 * therefore dead, `missingWebhook` was always 0, and the dialog said "Invitations sent
 * successfully." even with `N8N_USER_INVITATION_WEBHOOK_URL` unset and not one email
 * dispatched — the invitation row existed and the person was never told about it.
 *
 * `inviteUsers` spreads the delivery result onto each entry (`{ invitation, ...delivery }`),
 * so `delivered` sits at the top level of the entry; the nested `delivery` shape is read too
 * because `resendUserInvitation` returns the same fields under that name. Anything this
 * cannot read counts as undelivered, because the failure that matters is claiming a send
 * that did not happen.
 */
export function countUndelivered(result: unknown): { total: number; undelivered: number } {
  if (!Array.isArray(result)) return { total: 0, undelivered: 0 };

  let undelivered = 0;
  for (const entry of result) {
    if (typeof entry !== "object" || entry === null) {
      undelivered += 1;
      continue;
    }
    const record = entry as { delivered?: unknown; delivery?: { delivered?: unknown } | null };
    const delivered =
      typeof record.delivered === "boolean"
        ? record.delivered
        : typeof record.delivery?.delivered === "boolean"
          ? record.delivery.delivered
          : false;
    if (!delivered) undelivered += 1;
  }
  return { total: result.length, undelivered };
}

/** The sentence shown after a batch. Never claims a send the server did not report. */
export function describeDelivery(result: unknown, requested: number): string {
  const { total, undelivered } = countUndelivered(result);
  if (total === 0) {
    return `${requested} invitation${requested === 1 ? "" : "s"} submitted. The server did not report delivery, so treat the email as unsent.`;
  }
  if (undelivered === 0) {
    return `${total} invitation${total === 1 ? "" : "s"} created and emailed.`;
  }
  if (undelivered === total) {
    return `${total} invitation${total === 1 ? "" : "s"} created, but no email was sent — invitation email delivery is not configured. Share the invite link another way.`;
  }
  return `${total} invitations created. ${undelivered} could not be emailed because delivery is not configured.`;
}
