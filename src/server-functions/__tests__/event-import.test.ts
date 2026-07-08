import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireNeonAuthSessionMock,
  listEventImportAccountCandidatesMock,
  listEventImportAccountContactsMock,
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
    listEventImportAccountCandidatesMock: vi.fn(),
    listEventImportAccountContactsMock: vi.fn(),
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

vi.mock("@/server/repositories/event-import", () => ({
  commitEventImport: commitEventImportMock,
  listEventImportAccountCandidates: listEventImportAccountCandidatesMock,
  listEventImportAccountContacts: listEventImportAccountContactsMock,
}));

describe("event import server functions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requireNeonAuthSessionMock.mockResolvedValue({ user: { id: "user-1" } });
  });

  it("revalidates raw rows on commit and returns errors without writing invalid data", async () => {
    listEventImportAccountCandidatesMock.mockResolvedValue([]);
    listEventImportAccountContactsMock.mockResolvedValue([]);
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
    expect(listEventImportAccountCandidatesMock).toHaveBeenCalled();
    expect(listEventImportAccountContactsMock).toHaveBeenCalled();
    expect(commitEventImportMock).not.toHaveBeenCalled();
    expect(result).toEqual({
      ok: false,
      errors: [
        { index: 0, reason: "Attendee status must be attended, met, high_intent, or unknown." },
      ],
    });
  });

  it("validates rows with uncapped account candidates and account contacts", async () => {
    listEventImportAccountCandidatesMock.mockResolvedValue([
      { id: "account-1", name: "Fimmick", domain: "fimmick.com" },
    ]);
    listEventImportAccountContactsMock.mockResolvedValue([
      { id: "contact-1", account_id: "account-1", name: "Ada Wong", email: "ada@example.com" },
    ]);
    const { validateEventImportRowsFn } = await import("../event-import");

    const result = await validateEventImportRowsFn({
      data: {
        rows: [
          {
            company_name: "Fimmick",
            contact_name: "Ada Wong",
            email: "ada@example.com",
            phone: "",
            attendee_status: "attended",
            interests: [],
            notes: "",
          },
        ],
      },
    });

    expect(result.valid[0].contact_match).toEqual({
      kind: "matched",
      contactId: "contact-1",
      matchedBy: "email",
    });
    expect(listEventImportAccountCandidatesMock).toHaveBeenCalledTimes(1);
  });
});
