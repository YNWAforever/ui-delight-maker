import { describe, expect, it } from "vitest";

import { countUndelivered, describeDelivery, readActivationLinks } from "../invitation-delivery";

/**
 * An invitation that was saved but never emailed must never be reported as sent.
 *
 * The branch this replaces read `entry.delivery.status === "missing_webhook"` and there is no
 * `status` key anywhere in the invitation path: `dispatchInvitationEmail` returns
 * `{ delivered: false, reason: "missing_webhook" }`. The branch was dead, so the dialog said
 * "Invitations sent successfully." with `N8N_USER_INVITATION_WEBHOOK_URL` unset and not one
 * email dispatched — and the route toasted a second, independent success on top of it.
 *
 * The shapes below are the real ones. `inviteUsers` spreads the delivery result onto each
 * entry; `resendUserInvitation` returns the same fields, and a caller may hand back the
 * nested object instead.
 */
const delivered = { invitation: { id: "invitation-1" }, delivered: true };
const notDelivered = {
  invitation: { id: "invitation-2" },
  delivered: false,
  reason: "missing_webhook",
};
/** The shape the dead branch was looking for. It has never been produced by any server fn. */
const legacyStatusShape = {
  invitation: { id: "invitation-3" },
  delivery: { status: "missing_webhook" },
};

describe("countUndelivered", () => {
  it("reads the delivered flag at the top level and nested under delivery", () => {
    expect(countUndelivered([delivered, notDelivered])).toEqual({ total: 2, undelivered: 1 });
    expect(countUndelivered([{ delivery: { delivered: true } }])).toEqual({
      total: 1,
      undelivered: 0,
    });
  });

  it("counts anything it cannot read as undelivered", () => {
    // Deny by default: the failure that matters is claiming a send that did not happen.
    expect(countUndelivered([legacyStatusShape]).undelivered).toBe(1);
    expect(countUndelivered([null, 7, "sent"]).undelivered).toBe(3);
  });

  it("returns nothing for a result that is not a list", () => {
    for (const value of [undefined, null, {}, "ok"]) {
      expect(countUndelivered(value)).toEqual({ total: 0, undelivered: 0 });
    }
  });
});

describe("describeDelivery", () => {
  it("claims a send only when every entry reported one", () => {
    expect(describeDelivery([delivered, delivered], 2)).toBe("2 invitations created and emailed.");
    expect(describeDelivery([delivered], 1)).toBe("1 invitation created and emailed.");
  });

  it("says the invitation exists and the email did not go out", () => {
    const message = describeDelivery([notDelivered], 1);
    expect(message).toContain("created");
    expect(message).toContain("no email was sent");
    expect(message).not.toContain("successfully");
  });

  it("reports a partial batch as a partial batch", () => {
    const message = describeDelivery([delivered, notDelivered], 2);
    expect(message).toContain("2 invitations created");
    expect(message).toContain("1 could not be emailed");
  });

  it("does not claim delivery when the server reported none at all", () => {
    // A resolved call with no reportable result is not evidence that an email was sent.
    const message = describeDelivery(undefined, 3);
    expect(message).toContain("3 invitations submitted");
    expect(message).toContain("treat the email as unsent");
  });

  it("points at the links instead of asking for 'another way'", () => {
    expect(describeDelivery([notDelivered], 1)).toContain("Copy each link below");
    expect(describeDelivery([notDelivered], 1)).not.toContain("another way");
  });
});

describe("readActivationLinks", () => {
  /** The shape `inviteUsers` really returns: `{ invitation, inviteUrl, delivery }`. */
  const unsent = {
    invitation: {
      id: "invitation-4",
      email: "ada@example.com",
      expires_at: "2026-10-11T02:00:00Z",
    },
    inviteUrl: "https://clientops.example/invite/raw-token-1",
    delivery: { delivered: false, reason: "missing_webhook" },
  };

  it("returns the link, address and expiry of every invitation that was not emailed", () => {
    expect(readActivationLinks([unsent])).toEqual([
      {
        email: "ada@example.com",
        url: "https://clientops.example/invite/raw-token-1",
        expiresAt: "2026-10-11T02:00:00Z",
      },
    ]);
  });

  it("leaves out invitations that were emailed", () => {
    const emailed = { ...unsent, delivery: { delivered: true } };
    expect(readActivationLinks([emailed, { ...delivered, inviteUrl: unsent.inviteUrl }])).toEqual(
      [],
    );
  });

  it("never treats a value that is not an invite URL as a link", () => {
    for (const inviteUrl of [
      "javascript:alert(1)",
      "https://clientops.example/admin/people",
      "not a url",
      42,
      undefined,
    ]) {
      expect(readActivationLinks([{ ...unsent, inviteUrl }])).toEqual([]);
    }
  });

  it("returns nothing for a result that is not a list", () => {
    for (const value of [undefined, null, {}, "ok"]) {
      expect(readActivationLinks(value)).toEqual([]);
    }
  });
});
