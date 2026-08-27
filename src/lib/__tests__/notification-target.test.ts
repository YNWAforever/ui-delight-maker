import { describe, expect, it } from "vitest";

import { notificationTarget } from "../notification-target";

/**
 * The rules behind every "Open" button on `/notifications`.
 *
 * The version this replaces built a path string and cast it with `as never` (IF-E2-52), so
 * none of these cases had a type or a test behind them: an engagement notification silently
 * lost its `object_id`, and an unrecognised `object_type` produced a link from
 * `/notifications` to `/notifications`.
 */
describe("notificationTarget", () => {
  it("sends an approval notification to the approval desk", () => {
    expect(notificationTarget({ object_type: "approval", object_id: "approval-1" })).toEqual({
      kind: "approvals",
    });
  });

  it("carries the record id for the two object types that have a detail route", () => {
    expect(notificationTarget({ object_type: "client", object_id: "client-1" })).toEqual({
      kind: "client",
      id: "client-1",
    });
    expect(notificationTarget({ object_type: "lead", object_id: "lead-1" })).toEqual({
      kind: "lead",
      id: "lead-1",
    });
  });

  it("sends an engagement to the renewals board, because no engagement route exists", () => {
    // Stated rather than hidden: the id genuinely has nowhere to land, and the caller labels
    // this link for the board it opens rather than for the record it cannot show.
    expect(notificationTarget({ object_type: "engagement", object_id: "engagement-1" })).toEqual({
      kind: "renewals",
    });
  });

  it("offers no target rather than a link that goes nowhere", () => {
    expect(notificationTarget({ object_type: null, object_id: null })).toBeNull();
    expect(notificationTarget({ object_type: "quote", object_id: "quote-1" })).toBeNull();
  });

  it("offers no target when the record id is missing or blank", () => {
    // `/clients/null` and `/leads/` are both worse than no button: the first is a 404 and the
    // second reaches a route param the loader will reject.
    expect(notificationTarget({ object_type: "client", object_id: null })).toBeNull();
    expect(notificationTarget({ object_type: "lead", object_id: "   " })).toBeNull();
  });
});
