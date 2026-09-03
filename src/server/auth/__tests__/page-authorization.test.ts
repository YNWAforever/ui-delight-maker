import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  requireNeonAuthSession: vi.fn(),
  resolveOwnerProfileIds: vi.fn(),
}));

vi.mock("@/server/db/neon.server", () => ({ query: mocks.query }));
vi.mock("@/lib/auth/neon-auth.server", () => ({
  requireNeonAuthSession: mocks.requireNeonAuthSession,
}));
vi.mock("@/server/auth/resource-ownership", () => ({
  resolveOwnerProfileIds: mocks.resolveOwnerProfileIds,
}));

// The plan's original ACTOR guess omitted `status`, and used `department_id` / `team_id`
// instead of the real `Profile` field `primary_department_id` (there is no `team_id` field on
// `Profile` at all — team membership comes from a DB query, not the profile row). Without
// `status: "active"`, `evaluateAuthorization` short-circuits every decision to
// `{ allowed: false, reason: "inactive_actor" }` before role grants are even consulted, which
// would have made every "allowed" assertion below pass for the wrong reason (or fail silently
// misleadingly) rather than actually exercising role grants.
const ACTOR = {
  profile: { id: "actor-1", role: "sales", status: "active", primary_department_id: null },
};

describe("requirePageAuthorization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireNeonAuthSession.mockResolvedValue(ACTOR);
    mocks.query.mockResolvedValue([]);
    mocks.resolveOwnerProfileIds.mockResolvedValue(new Map());
  });

  it("loads the authorization context exactly once", async () => {
    const { requirePageAuthorization } = await import("../authorization.server");

    const { rows } = await requirePageAuthorization(["leads.view"]);
    await rows.allow("leads.view", "lead", ["lead-1"]);
    await rows.allow("leads.view", "lead", ["lead-2"]);

    // The context is four queries. If this grows with the number of allow() calls, the
    // authorizer is reloading it and the whole design is pointless.
    expect(mocks.requireNeonAuthSession).toHaveBeenCalledTimes(1);
  });

  it("resolves ownership once per allow call, not once per id", async () => {
    const { requirePageAuthorization } = await import("../authorization.server");
    mocks.resolveOwnerProfileIds.mockResolvedValue(
      new Map([
        ["lead-1", "actor-1"],
        ["lead-2", "someone-else"],
        ["lead-3", null],
      ]),
    );

    const { rows } = await requirePageAuthorization(["leads.view"]);
    await rows.allow("leads.view", "lead", ["lead-1", "lead-2", "lead-3"]);

    expect(mocks.resolveOwnerProfileIds).toHaveBeenCalledTimes(1);
    expect(mocks.resolveOwnerProfileIds).toHaveBeenCalledWith("lead", [
      "lead-1",
      "lead-2",
      "lead-3",
    ]);
  });

  it("returns a decision for every id", async () => {
    const { requirePageAuthorization } = await import("../authorization.server");
    mocks.resolveOwnerProfileIds.mockResolvedValue(new Map([["lead-1", "actor-1"]]));

    const { rows } = await requirePageAuthorization(["leads.view"]);
    const decided = await rows.allow("leads.view", "lead", ["lead-1", "lead-2"]);

    expect([...decided.keys()].sort()).toEqual(["lead-1", "lead-2"]);
  });

  it("issues no ownership query for an empty id list", async () => {
    const { requirePageAuthorization } = await import("../authorization.server");

    const { rows } = await requirePageAuthorization(["leads.view"]);
    const decided = await rows.allow("leads.view", "lead", []);

    expect(mocks.resolveOwnerProfileIds).not.toHaveBeenCalled();
    expect(decided.size).toBe(0);
  });

  it("reports optional capabilities without throwing", async () => {
    const { requirePageAuthorization } = await import("../authorization.server");

    const { access } = await requirePageAuthorization(["leads.view"], {
      optional: ["accounts.view", "api_keys.manage"],
    });

    expect(access["leads.view"]).toBe(true);
    expect(access["accounts.view"]).toBe(true);
    // A sales actor does not hold api_keys.manage — reported as false, not thrown.
    expect(access["api_keys.manage"]).toBe(false);
  });

  it("throws when a required capability is denied, before any row is considered", async () => {
    const { requirePageAuthorization } = await import("../authorization.server");

    await expect(requirePageAuthorization(["api_keys.manage"])).rejects.toThrow();
    expect(mocks.resolveOwnerProfileIds).not.toHaveBeenCalled();
  });

  it("propagates a store error rather than reporting the rows as denied", async () => {
    const { requirePageAuthorization } = await import("../authorization.server");
    mocks.resolveOwnerProfileIds.mockRejectedValue(new Error("ownership store unreachable"));

    const { rows } = await requirePageAuthorization(["leads.view"]);

    // A failure to determine access is not a determination of no access. Swallowing this
    // would silently blank pages during an outage.
    await expect(rows.allow("leads.view", "lead", ["lead-1"])).rejects.toThrow(
      "ownership store unreachable",
    );
  });
});
