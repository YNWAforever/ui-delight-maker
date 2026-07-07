import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireNeonAuthSessionMock,
  listRelationshipSignalsMock,
  dismissRelationshipSignalMock,
  createServerFnChain,
} = vi.hoisted(() => {
  const createServerFnChain = {
    validator() {
      return createServerFnChain;
    },
    handler<T extends (...args: unknown[]) => unknown>(handler: T) {
      return handler;
    },
  };

  return {
    requireNeonAuthSessionMock: vi.fn(),
    listRelationshipSignalsMock: vi.fn(),
    dismissRelationshipSignalMock: vi.fn(),
    createServerFnChain,
  };
});

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => createServerFnChain,
}));

vi.mock("@/lib/auth/neon-auth.server", () => ({
  requireNeonAuthSession: requireNeonAuthSessionMock,
}));

vi.mock("@/server/repositories/relationship-signals", () => ({
  listRelationshipSignals: listRelationshipSignalsMock,
  dismissRelationshipSignal: dismissRelationshipSignalMock,
}));

describe("relationship signals server functions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireNeonAuthSessionMock.mockResolvedValue({ user: { id: "user-1" } });
  });

  it("lists signals after requiring a Neon auth session", async () => {
    listRelationshipSignalsMock.mockResolvedValue([]);
    const { getRelationshipSignals } = await import("../relationship-signals");

    await getRelationshipSignals({
      data: {
        account_id: "account-1",
        openOnly: true,
      },
    });

    expect(requireNeonAuthSessionMock).toHaveBeenCalled();
    expect(listRelationshipSignalsMock).toHaveBeenCalledWith({
      account_id: "account-1",
      openOnly: true,
    });
  });

  it("dismisses a signal with the authenticated user id", async () => {
    dismissRelationshipSignalMock.mockResolvedValue({ id: "signal-1" });
    const { dismissRelationshipSignalFn } = await import("../relationship-signals");

    await dismissRelationshipSignalFn({
      data: {
        id: "signal-1",
        reason: "not relevant anymore",
      },
    });

    expect(requireNeonAuthSessionMock).toHaveBeenCalled();
    expect(dismissRelationshipSignalMock).toHaveBeenCalledWith("signal-1", {
      dismissed_by: "user-1",
      dismissal_reason: "not relevant anymore",
    });
  });
});
