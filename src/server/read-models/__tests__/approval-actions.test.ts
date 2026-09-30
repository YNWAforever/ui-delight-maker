import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RequestAuthorization } from "@/server/auth/authorization.server";
import type { UserRole } from "@/lib/admin/types";
import type { HumanApproval } from "@/lib/types";
const queryMock = vi.hoisted(() => vi.fn());
vi.mock("@/server/db/neon.server", () => ({ query: queryMock }));
import { withApprovalActionFlags } from "../approval-actions.server";
const context = (role: UserRole): RequestAuthorization => ({
  session: {} as RequestAuthorization["session"],
  actor: {
    profileId: "actor",
    role,
    status: "active",
    directReportIds: [],
    managedTeamIds: [],
    managedDepartmentIds: [],
  },
  overrides: [],
  now: new Date("2026-09-30T06:00:00Z"),
});
const row = (overrides: Partial<HumanApproval> = {}) => ({
  id: "approval",
  approval_type: "qualification_review" as const,
  assigned_to: "actor",
  status: "pending" as const,
  ...overrides,
});
beforeEach(() => queryMock.mockReset().mockResolvedValue([]));
describe("Approval affordances follow existing per-record policy", () => {
  it.each([
    "super_admin",
    "admin",
    "manager",
    "sales",
    "client_success",
    "accounting",
    "read_only",
  ] as const)(
    "evaluates %s independently without reading more ownership for non-quote rows",
    async (role) => {
      const [actions] = await withApprovalActionFlags(context(role), [row()]);
      const allowed = ["super_admin", "admin", "manager"].includes(role);
      expect(actions).toMatchObject({
        can_decide: allowed,
        can_assign: allowed,
        can_request_changes: allowed,
      });
      expect(queryMock).not.toHaveBeenCalled();
    },
  );
  it("denies an unowned or unrelated manager row", async () => {
    const rows = await withApprovalActionFlags(context("manager"), [
      row({ assigned_to: null }),
      row({ id: "other", assigned_to: "outsider" }),
    ]);
    expect(rows.every((item) => !item.can_decide && !item.can_assign)).toBe(true);
  });
  it("honors a scoped allow, active deny and expired allow without widening another record", async () => {
    const actor = context("read_only");
    actor.overrides = [
      {
        profileId: "actor",
        capability: "approvals.decide",
        effect: "allow",
        resourceType: "human_approval",
        resourceId: "approval",
      },
    ];
    const [allowed, unrelated] = await withApprovalActionFlags(actor, [
      row(),
      row({ id: "other" }),
    ]);
    expect(allowed.can_decide).toBe(true);
    expect(unrelated.can_decide).toBe(false);
    actor.overrides.push({
      profileId: "actor",
      capability: "approvals.decide",
      effect: "deny",
      resourceType: "human_approval",
      resourceId: "approval",
    });
    expect((await withApprovalActionFlags(actor, [row()]))[0].can_decide).toBe(false);
    actor.overrides = [
      {
        profileId: "actor",
        capability: "approvals.decide",
        effect: "allow",
        resourceType: "human_approval",
        resourceId: "approval",
        expiresAt: "2026-09-01T00:00:00Z",
      },
    ];
    expect((await withApprovalActionFlags(actor, [row()]))[0].can_decide).toBe(false);
  });
  it("removes terminal writes and allows only non-quote escalated decisions", async () => {
    const actor = context("admin"),
      rows = await withApprovalActionFlags(actor, [
        row({ status: "approved" }),
        row({ id: "escalated", status: "escalated" }),
        row({ id: "quote", approval_type: "quote_send", status: "escalated" }),
      ]);
    expect(rows[0]).toMatchObject({
      can_decide: false,
      can_assign: false,
      can_request_changes: false,
    });
    expect(rows[1]).toMatchObject({
      can_decide: true,
      can_assign: true,
      can_request_changes: false,
    });
    expect(rows[2].can_decide).toBe(false);
  });
  it("batches actual quote ownership and honors its separate deny while keeping routing independent", async () => {
    queryMock.mockResolvedValue([{ id: "quote-1", owner_profile_id: "actor" }]);
    const actor = context("manager");
    actor.overrides = [
      {
        profileId: "actor",
        capability: "quotes.approve",
        effect: "deny",
        resourceType: "quote",
        resourceId: "quote-1",
      },
    ];
    const rows = await withApprovalActionFlags(actor, [
      row({ approval_type: "quote_send", context_data: { quote_id: "quote-1" } }),
      row({ id: "second", approval_type: "quote_send", context_data: { quote_id: "quote-1" } }),
    ]);
    expect(queryMock).toHaveBeenCalledTimes(1);
    expect(queryMock.mock.calls[0][1]).toEqual([["quote-1"]]);
    expect(
      rows.every((item) => !item.can_decide && item.can_assign && item.can_request_changes),
    ).toBe(true);
  });
  it("does not offer decisions for a missing quote", async () => {
    const [item] = await withApprovalActionFlags(context("admin"), [
      row({ approval_type: "quote_send", context_data: { quote_id: "missing" } }),
    ]);
    expect(item.can_decide).toBe(false);
  });
});
