import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getAccountMock: vi.fn(),
  listAccountContactsMock: vi.fn(),
  getAccountTimelineMock: vi.fn(),
  listRelationshipSignalsMock: vi.fn(),
  getAgentRunWithCallsMock: vi.fn(),
}));

vi.mock("@/server/repositories/accounts", () => ({
  getAccount: mocks.getAccountMock,
}));

vi.mock("@/server/repositories/account-contacts", () => ({
  listAccountContacts: mocks.listAccountContactsMock,
}));

vi.mock("@/server/repositories/account-timeline", () => ({
  getAccountTimeline: mocks.getAccountTimelineMock,
}));

vi.mock("@/server/repositories/relationship-signals", () => ({
  listRelationshipSignals: mocks.listRelationshipSignalsMock,
}));

vi.mock("@/server/repositories/agent-runs", () => ({
  getAgentRunWithCalls: mocks.getAgentRunWithCallsMock,
}));

import { getAccountWorkflowContext } from "@/server/workflows/context-account.server";

describe("workflow account context", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAccountMock.mockResolvedValue({
      id: "account-1",
      name: "Acme CRM",
    });
    mocks.listAccountContactsMock.mockResolvedValue([{ id: "contact-1", account_id: "account-1" }]);
    mocks.getAccountTimelineMock.mockResolvedValue(
      Array.from({ length: 55 }, (_, index) => ({
        id: `entry-${index + 1}`,
        occurred_at: `2026-07-${String((index % 28) + 1).padStart(2, "0")}T00:00:00.000Z`,
      })),
    );
    mocks.listRelationshipSignalsMock.mockResolvedValue([{ id: "signal-1", account_id: "account-1" }]);
    mocks.getAgentRunWithCallsMock.mockResolvedValue({
      run: {
        id: "run-1",
        status: "running",
        subject_type: "account",
        subject_id: "account-1",
      },
      toolCalls: [],
    });
  });

  it("returns account workflow context and trims timeline entries", async () => {
    const result = await getAccountWorkflowContext({ accountId: "account-1", agentRunId: "run-1" });

    expect(result.account).toEqual({ id: "account-1", name: "Acme CRM" });
    expect(result.contacts).toEqual([{ id: "contact-1", account_id: "account-1" }]);
    expect(result.open_signals).toEqual([{ id: "signal-1", account_id: "account-1" }]);
    expect(result.agent_run).toMatchObject({
      id: "run-1",
      subject_type: "account",
      subject_id: "account-1",
    });
    expect(result.timeline).toHaveLength(50);
    expect(mocks.listRelationshipSignalsMock).toHaveBeenCalledWith({
      account_id: "account-1",
      openOnly: true,
    });
  });

  it("rejects when the run does not belong to the account", async () => {
    mocks.getAgentRunWithCallsMock.mockResolvedValue({
      run: {
        id: "run-1",
        status: "running",
        subject_type: "account",
        subject_id: "account-2",
      },
      toolCalls: [],
    });

    await expect(
      getAccountWorkflowContext({ accountId: "account-1", agentRunId: "run-1" }),
    ).rejects.toThrow("Agent run does not belong to this account");
  });
});
