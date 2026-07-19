import { beforeEach, describe, expect, it, vi } from "vitest";

const queryMock = vi.hoisted(() => vi.fn());
vi.mock("@/server/db/neon.server", () => ({
  query: queryMock,
  queryOne: vi.fn(),
  transaction: vi.fn(),
}));

import { listEngagementsByClientIds } from "../engagements";

describe("listEngagementsByClientIds", () => {
  beforeEach(() => {
    queryMock.mockReset();
    queryMock.mockResolvedValue([]);
  });

  it("loads all client engagements in one UUID-array query", async () => {
    await listEngagementsByClientIds(["client-1", "client-2"]);

    expect(queryMock).toHaveBeenCalledTimes(1);
    expect(queryMock.mock.calls[0]?.[0]).toContain("client_id = any($1::uuid[])");
    expect(queryMock.mock.calls[0]?.[1]).toEqual([["client-1", "client-2"]]);
  });

  it("does not query for an empty client set", async () => {
    await expect(listEngagementsByClientIds([])).resolves.toEqual([]);
    expect(queryMock).not.toHaveBeenCalled();
  });
});
