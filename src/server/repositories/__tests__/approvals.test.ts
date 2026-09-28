import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RequestAuthorization } from "@/server/auth/authorization.server";
import type { AppSession } from "@/lib/auth/neon-auth.server";

const mocks = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock("@/server/db/neon.server", () => ({
  query: vi.fn(),
  queryOne: vi.fn(),
  transaction: vi.fn(),
}));
vi.mock("@/server/repositories/notifications", () => ({
  createNotification: vi.fn(),
  listApproverProfileIds: vi.fn(),
}));

import { decideApprovalInTransaction } from "@/server/repositories/approvals";

const context: RequestAuthorization = {
  session: { profile: { id: "reviewer-admin" } } as AppSession,
  actor: {
    profileId: "reviewer-admin",
    role: "admin",
    status: "active",
    managedDepartmentIds: [],
    managedTeamIds: [],
    directReportIds: [],
  },
  overrides: [],
  now: new Date(),
};
function approvalRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "approval-1",
    agent_run_id: "run-1",
    approval_type: "cs_risk_review",
    assigned_to: null,
    status: "pending",
    row_version: 0,
    decided_at: null,
    ...overrides,
  };
}
function callsMatching(fragment: string) {
  return mocks.query.mock.calls.filter(([text]) => String(text).includes(fragment));
}
function seed(approval: Record<string, unknown> | null = approvalRow()) {
  mocks.query.mockImplementation(async (text: string, values: readonly unknown[] = []) => {
    if (text.includes("select * from human_approvals")) return { rows: approval ? [approval] : [] };
    if (text.includes("update human_approvals")) {
      return {
        rows: approval
          ? [
              {
                ...approval,
                status: values[1],
                row_version: 1,
                decided_at: values[1] === "escalated" ? null : "2026-09-27T00:00:00.000Z",
              },
            ]
          : [],
      };
    }
    return { rows: [] };
  });
}

describe("decideApprovalInTransaction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it.each(["approved", "rejected"] as const)(
    "releases a waiting agent run on %s",
    async (decision) => {
      seed();
      await decideApprovalInTransaction({ query: mocks.query }, context, {
        id: "approval-1",
        decision,
      });
      const release = callsMatching("update agent_runs");
      expect(release).toHaveLength(1);
      expect(release[0][1]).toEqual(["run-1"]);
    },
  );

  it("keeps a run parked when escalated", async () => {
    seed();
    const approval = await decideApprovalInTransaction({ query: mocks.query }, context, {
      id: "approval-1",
      decision: "escalated",
    });
    expect(approval.decided_at).toBeNull();
    expect(callsMatching("update agent_runs")).toHaveLength(0);
  });

  it("does not release a run when none is linked", async () => {
    seed(approvalRow({ agent_run_id: null }));
    await decideApprovalInTransaction({ query: mocks.query }, context, {
      id: "approval-1",
      decision: "approved",
    });
    expect(callsMatching("update agent_runs")).toHaveLength(0);
  });

  it("records the decision in the same database client", async () => {
    seed();
    await decideApprovalInTransaction({ query: mocks.query }, context, {
      id: "approval-1",
      decision: "approved",
    });
    expect(callsMatching("insert into activity_logs")).toHaveLength(1);
  });

  it("fails when the approval does not exist", async () => {
    seed(null);
    await expect(
      decideApprovalInTransaction({ query: mocks.query }, context, {
        id: "missing",
        decision: "approved",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});
