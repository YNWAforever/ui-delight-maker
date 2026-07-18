import { beforeEach, describe, expect, it, vi } from "vitest";

const { queryOneMock } = vi.hoisted(() => ({
  queryOneMock: vi.fn(),
}));

vi.mock("@/server/db/neon.server", () => ({
  queryOne: queryOneMock,
}));

import { getProfileByEmail } from "../profiles";

describe("profile identity lookup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queryOneMock.mockResolvedValue({ id: "legacy-profile", status: "active" });
  });

  it("looks up a legacy profile by normalized email", async () => {
    await expect(getProfileByEmail(" ADA@EXAMPLE.COM ")).resolves.toMatchObject({
      id: "legacy-profile",
    });

    expect(queryOneMock).toHaveBeenCalledWith(expect.stringContaining("lower(email) = $1"), [
      "ada@example.com",
    ]);
  });
});
