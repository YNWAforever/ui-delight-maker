import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Routing an approval to a reviewer (BD-6).
 *
 * The control on /approvals was disabled because nothing wrote `human_approvals.assigned_to`.
 * The column has existed and been FK-constrained since 001_clientops_runtime.sql:138; what was
 * missing was a write path with rules. These are the rules.
 */
const mocks = vi.hoisted(() => ({
  queryOneMock: vi.fn(),
}));

vi.mock("@/server/db/neon.server", () => ({
  query: vi.fn(),
  queryOne: mocks.queryOneMock,
  transaction: vi.fn(),
}));

vi.mock("@/server/repositories/notifications", () => ({
  createNotification: vi.fn(),
  listApproverProfileIds: vi.fn(),
}));

import { assignApproval } from "@/server/repositories/approvals";

function approvalRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "approval-1",
    agent_run_id: null,
    approval_type: "quote_send",
    requested_by: "user-1",
    assigned_to: null,
    status: "pending",
    context_data: { quote_id: "quote-1" },
    context_summary: "Quote FIM-Q-1 for approval",
    reviewer_notes: null,
    decided_at: null,
    created_at: "2026-08-28T00:00:00.000Z",
    ...overrides,
  };
}

/** How many statements were normalised for matching — whitespace varies across the file. */
function normalize(text: unknown) {
  return String(text).replace(/\s+/g, " ").trim();
}

function callsMatching(fragment: string) {
  return mocks.queryOneMock.mock.calls.filter(([text]) => normalize(text).includes(fragment));
}

/**
 * Seeds `queryOne` by statement, so a case can change one leg (the stored approval, whether
 * the profile resolves) without scripting a call order the implementation is free to change.
 */
function seed(options: { approval?: Record<string, unknown> | null; profileExists?: boolean }) {
  const { approval = approvalRow(), profileExists = true } = options;
  mocks.queryOneMock.mockImplementation(async (text: string, values: readonly unknown[] = []) => {
    const sql = normalize(text);
    if (sql.includes("select * from human_approvals")) return approval;
    if (sql.includes("select id from profiles")) return profileExists ? { id: values[0] } : null;
    if (sql.includes("update human_approvals")) {
      return approval ? { ...approval, assigned_to: values[1] ?? null } : null;
    }
    return null;
  });
}

describe("assignApproval", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("assigns a reviewer to a pending approval", async () => {
    seed({});

    const approval = await assignApproval({ id: "approval-1", assignedTo: "reviewer-9" });

    expect(approval.assigned_to).toBe("reviewer-9");
    const updates = callsMatching("update human_approvals");
    expect(updates, "expected exactly one update to human_approvals").toHaveLength(1);
    expect(normalize(updates[0][0])).toContain("set assigned_to = $2");
    expect(updates[0][1]).toEqual(["approval-1", "reviewer-9"]);
  });

  it("permits unassigning with null rather than treating it as an error", async () => {
    // An approval routed to the wrong person needs a way back to the unassigned pool.
    seed({ approval: approvalRow({ assigned_to: "reviewer-9" }) });

    const approval = await assignApproval({ id: "approval-1", assignedTo: null });

    expect(approval.assigned_to).toBeNull();
    expect(callsMatching("update human_approvals")[0][1]).toEqual(["approval-1", null]);
    // No assignee to resolve, so no profile lookup should have been issued at all.
    expect(callsMatching("select id from profiles")).toHaveLength(0);
  });

  it("refuses to reassign a decided approval, and issues no update", async () => {
    // Changing the reviewer on a closed decision would misrepresent who made it.
    seed({ approval: approvalRow({ status: "approved", decided_at: "2026-08-28T01:00:00.000Z" }) });

    await expect(assignApproval({ id: "approval-1", assignedTo: "reviewer-9" })).rejects.toThrow(
      "A decided approval cannot be reassigned",
    );

    expect(
      callsMatching("update human_approvals"),
      "a rejected reassignment must not reach the database",
    ).toHaveLength(0);
  });

  it("rejects an unresolvable profile id, and issues no update", async () => {
    seed({ profileExists: false });

    await expect(assignApproval({ id: "approval-1", assignedTo: "ghost" })).rejects.toThrow(
      "Assignee not found",
    );

    expect(
      callsMatching("update human_approvals"),
      "an unresolvable assignee must not be stored",
    ).toHaveLength(0);
  });
});
