import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireNeonAuthSessionMock,
  listAccountsMock,
  commitEventImportMock,
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
    listAccountsMock: vi.fn(),
    commitEventImportMock: vi.fn(),
    createServerFnChain,
  };
});

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => createServerFnChain,
}));

vi.mock("@/lib/auth/neon-auth.server", () => ({
  requireNeonAuthSession: requireNeonAuthSessionMock,
}));

vi.mock("@/server/repositories/accounts", () => ({
  listAccounts: listAccountsMock,
}));

vi.mock("@/server/repositories/event-import", () => ({
  commitEventImport: commitEventImportMock,
}));

describe("event import server functions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireNeonAuthSessionMock.mockResolvedValue({ user: { id: "user-1" } });
  });

  it("revalidates raw rows on commit and returns errors without writing invalid data", async () => {
    listAccountsMock.mockResolvedValue([]);
    const { commitEventImportFn } = await import("../event-import");

    const result = await commitEventImportFn({
      data: {
        campaignId: "campaign-1",
        rows: [
          {
            company_name: "Fimmick",
            contact_name: "Ada Wong",
            email: "ada@example.com",
            phone: "",
            attendee_status: "registered",
            interests: [],
            notes: "",
          },
        ],
      },
    });

    expect(requireNeonAuthSessionMock).toHaveBeenCalled();
    expect(listAccountsMock).toHaveBeenCalledWith({});
    expect(commitEventImportMock).not.toHaveBeenCalled();
    expect(result).toEqual({
      ok: false,
      errors: [
        { index: 0, reason: "Attendee status must be attended, met, high_intent, or unknown." },
      ],
    });
  });
});
