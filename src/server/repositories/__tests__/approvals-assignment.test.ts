import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RequestAuthorization } from "@/server/auth/authorization.server";
import type { AppSession } from "@/lib/auth/neon-auth.server";

const mocks = vi.hoisted(() => ({
  query: vi.fn(),
  transaction: vi.fn(),
}));
vi.mock("@/server/db/neon.server", () => ({
  query: vi.fn(),
  queryOne: vi.fn(),
  transaction: mocks.transaction,
}));
vi.mock("@/server/repositories/notifications", () => ({
  createNotification: vi.fn(),
  listApproverProfileIds: vi.fn(),
}));

import { assignApproval } from "@/server/repositories/approvals";

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
    agent_run_id: null,
    approval_type: "quote_send",
    requested_by: "user-1",
    assigned_to: null,
    status: "pending",
    row_version: 0,
    superseded_by: null,
    context_data: { quote_id: "quote-1" },
    context_summary: "Quote FIM-Q-1 for approval",
    reviewer_notes: null,
    decided_at: null,
    created_at: "2026-08-28T00:00:00.000Z",
    ...overrides,
  };
}
function callsMatching(fragment: string) {
  return mocks.query.mock.calls.filter(([text]) => String(text).includes(fragment));
}
function seed(options: { approval?: Record<string, unknown> | null; profileExists?: boolean }) {
  const { approval = approvalRow(), profileExists = true } = options;
  mocks.query.mockImplementation(async (text: string, values: readonly unknown[] = []) => {
    if (text.includes("select * from human_approvals")) return { rows: approval ? [approval] : [] };
    if (text.includes("select id from profiles"))
      return { rows: profileExists ? [{ id: values[0] }] : [] };
    if (text.includes("update human_approvals")) {
      return {
        rows: approval ? [{ ...approval, assigned_to: values[1] ?? null, row_version: 1 }] : [],
      };
    }
    return { rows: [] };
  });
}

describe("assignApproval", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation(async (work) => work({ query: mocks.query }));
  });

  it("assigns a reviewer to a pending approval", async () => {
    seed({});
    const approval = await assignApproval(
      { id: "approval-1", assignedTo: "reviewer-9", expectedVersion: 0 },
      context,
    );
    expect(approval.assigned_to).toBe("reviewer-9");
    expect(approval.row_version).toBe(1);
    expect(callsMatching("update human_approvals")).toHaveLength(1);
  });

  it("permits unassigning with null", async () => {
    seed({ approval: approvalRow({ assigned_to: "reviewer-9" }) });
    const approval = await assignApproval(
      { id: "approval-1", assignedTo: null, expectedVersion: 0 },
      context,
    );
    expect(approval.assigned_to).toBeNull();
    expect(callsMatching("select id from profiles")).toHaveLength(0);
  });

  it("refuses to reassign a terminal approval", async () => {
    seed({ approval: approvalRow({ status: "approved", decided_at: "2026-08-28T01:00:00.000Z" }) });
    await expect(
      assignApproval({ id: "approval-1", assignedTo: "reviewer-9" }, context),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(callsMatching("update human_approvals")).toHaveLength(0);
  });

  it("rejects an inactive or missing assignee", async () => {
    seed({ profileExists: false });
    await expect(
      assignApproval({ id: "approval-1", assignedTo: "ghost" }, context),
    ).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    expect(callsMatching("update human_approvals")).toHaveLength(0);
  });
});
