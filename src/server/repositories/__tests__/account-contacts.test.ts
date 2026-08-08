import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockQuery, mockQueryOne } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockQueryOne: vi.fn(),
}));

vi.mock("@/server/db/neon.server", () => ({
  query: mockQuery,
  queryOne: mockQueryOne,
}));

describe("account contacts repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists contacts by account with relationship ordering", async () => {
    mockQuery.mockResolvedValue([]);
    const { listAccountContacts } = await import("../account-contacts");

    await listAccountContacts("account-1");

    expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining("from account_contacts"), [
      "account-1",
    ]);
  });

  it("counts account contacts without loading contact rows", async () => {
    mockQuery.mockResolvedValue([{ count: 2 }]);
    const { countAccountContacts } = await import("../account-contacts");

    await expect(countAccountContacts("account-1")).resolves.toBe(2);
    expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining("count(*)"), ["account-1"]);
  });

  it("creates contacts with relationship defaults", async () => {
    mockQueryOne.mockResolvedValue({ id: "contact-1" });
    const { createAccountContact } = await import("../account-contacts");

    await createAccountContact({ account_id: "account-1", name: "Ada" });

    expect(mockQueryOne).toHaveBeenCalledWith(
      expect.stringContaining("insert into account_contacts"),
      [
        "account-1",
        "Ada",
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
      ],
      undefined,
    );
  });

  it("updates only allowed account contact columns", async () => {
    mockQueryOne.mockResolvedValue({ id: "contact-1", name: "Ada" });
    const { updateAccountContact } = await import("../account-contacts");

    await updateAccountContact("contact-1", { name: "Ada", active: false });

    expect(mockQueryOne).toHaveBeenCalledWith(
      expect.stringContaining("update account_contacts"),
      ["Ada", false, "contact-1"],
      undefined,
    );
  });
});
