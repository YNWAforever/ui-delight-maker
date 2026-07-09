import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockQuery, mockQueryOne } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockQueryOne: vi.fn(),
}));

vi.mock("@/server/db/neon.server", () => ({
  query: mockQuery,
  queryOne: mockQueryOne,
}));

describe("accounts repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists accounts with optional owners and name search", async () => {
    mockQuery.mockResolvedValue([]);
    const { listAccounts } = await import("../accounts");

    await listAccounts({
      owner: "owner-1",
      cs_owner: "cs-1",
      lifecycle_stage: "prospect",
      query: "Acme",
    });

    expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining("from accounts"), [
      "owner-1",
      "cs-1",
      "prospect",
      "%Acme%",
    ]);
  });

  it("creates accounts with prospect and empty tag defaults", async () => {
    mockQueryOne.mockResolvedValue({ id: "account-1" });
    const { createAccount } = await import("../accounts");

    await createAccount({ name: "Acme" });

    expect(mockQueryOne).toHaveBeenCalledWith(
      expect.stringContaining("insert into accounts"),
      ["Acme", null, null, null, null, null, null, null, null, null, null, null],
      undefined,
    );
  });

  it("updates only allowed account columns", async () => {
    mockQueryOne.mockResolvedValue({ id: "account-1", name: "Renamed" });
    const { updateAccount } = await import("../accounts");

    await updateAccount("account-1", { name: "Renamed", notes: "hello" });

    expect(mockQueryOne).toHaveBeenCalledWith(
      expect.stringContaining("update accounts"),
      ["Renamed", "hello", "account-1"],
      undefined,
    );
  });
});
