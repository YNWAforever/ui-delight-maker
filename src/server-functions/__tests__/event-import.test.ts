import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  requireCapabilityMock,
  loadRequestAuthorizationMock,
  checkWithContextMock,
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
    requireCapabilityMock: vi.fn(),
    loadRequestAuthorizationMock: vi.fn(),
    checkWithContextMock: vi.fn(),
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

vi.mock("@/server/auth/authorization.server", () => ({
  requireCapability: requireCapabilityMock,
  loadRequestAuthorization: loadRequestAuthorizationMock,
  checkWithContext: checkWithContextMock,
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
    loadRequestAuthorizationMock.mockResolvedValue({ actor: { profileId: "user-1" } });
    checkWithContextMock.mockImplementation(async (_context: unknown, checks: unknown[]) =>
      checks.map(() => ({ allowed: true })),
    );
    requireCapabilityMock.mockResolvedValue({
      user: { id: "user-1" },
      profile: { id: "user-1", role: "sales", status: "active" },
      session: {},
    });

    requireNeonAuthSessionMock.mockResolvedValue({
      user: { id: "user-1" },
      profile: { id: "user-1", role: "sales", status: "active" },
      session: {},
    });
  });

  it("retires the old direct-write endpoint after authentication", async () => {
    const { commitEventImportFn } = await import("../event-import");
    await expect(
      commitEventImportFn({
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
      }),
    ).rejects.toThrow(/Direct CSV commit is retired/);
    expect(requireNeonAuthSessionMock).toHaveBeenCalled();
    expect(commitEventImportMock).not.toHaveBeenCalled();
    expect(listEventImportAccountCandidatesMock).not.toHaveBeenCalled();
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
    expect(requireCapabilityMock).toHaveBeenCalledWith("engagements.view", {}, expect.anything());
    expect(requireCapabilityMock).toHaveBeenCalledWith("accounts.view", {}, expect.anything());
    expect(requireCapabilityMock).toHaveBeenCalledWith("contacts.view", {}, expect.anything());
    expect(listEventImportAccountCandidatesMock).toHaveBeenCalledTimes(1);
  });

  it("does not return a matched account or contact denied at preview", async () => {
    listEventImportAccountCandidatesMock.mockResolvedValue([
      { id: "hidden-account", name: "Hidden Studio", domain: null },
    ]);
    listEventImportAccountContactsMock.mockResolvedValue([
      {
        id: "hidden-contact",
        account_id: "hidden-account",
        name: "Ada Wong",
        email: "ada@example.com",
      },
    ]);
    checkWithContextMock.mockResolvedValue([{ allowed: false }, { allowed: false }]);
    const { validateEventImportRowsFn } = await import("../event-import");
    const result = await validateEventImportRowsFn({
      data: {
        rows: [
          {
            company_name: "Hidden Studio",
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
    expect(result.valid).toEqual([]);
    expect(result.errors).toEqual([{ index: 0, reason: "Import row requires review." }]);
    expect(JSON.stringify(result)).not.toContain("hidden-account");
    expect(JSON.stringify(result)).not.toContain("hidden-contact");
  });
});
