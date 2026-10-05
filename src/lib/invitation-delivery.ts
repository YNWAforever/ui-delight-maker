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
    return `${total} invitation${total === 1 ? "" : "s"} created, but no email was sent because invitation email is not set up. Copy each link below and send it to the person yourself.`;
  }
  return `${total} invitations created. ${undelivered} could not be emailed because invitation email is not set up — copy their links below.`;
}

/** One invitee whose activation link has to be passed on by hand. */
export type ActivationLink = {
  email: string;
  url: string;
  /** ISO timestamp, or null when the server did not report one. */
  expiresAt: string | null;
};

/**
 * The activation links the person who invited has to share themselves.
 *
 * `inviteUsers` already returns `{ invitation, inviteUrl, delivery }` for every invitee; the
 * dialog used to keep only the delivery sentence and drop the links, so a batch created
 * without email delivery left the admin told to "share the invite link" with no link to share.
 *
 * Only undelivered entries are returned — an emailed link does not need to be on screen — and
 * only URLs that are plainly an http(s) `/invite/` link, so a malformed entry can never render
 * something else as a link.
 */
export function readActivationLinks(result: unknown): ActivationLink[] {
  if (!Array.isArray(result)) return [];

  const links: ActivationLink[] = [];
  for (const entry of result) {
    if (typeof entry !== "object" || entry === null) continue;
    const record = entry as {
      inviteUrl?: unknown;
      delivered?: unknown;
      delivery?: { delivered?: unknown } | null;
      invitation?: { email?: unknown; expires_at?: unknown } | null;
    };
    const delivered =
      record.delivered === true ||
      (record.delivered === undefined && record.delivery?.delivered === true);
    if (delivered) continue;

    const url = typeof record.inviteUrl === "string" ? record.inviteUrl : "";
    if (!isActivationUrl(url)) continue;

    const email = typeof record.invitation?.email === "string" ? record.invitation.email : "";
    const expiresAt =
      typeof record.invitation?.expires_at === "string" ? record.invitation.expires_at : null;
    links.push({ email, url, expiresAt });
  }
  return links;
}

function isActivationUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      (url.protocol === "https:" || url.protocol === "http:") && url.pathname.startsWith("/invite/")
    );
  } catch {
    return false;
  }
}
