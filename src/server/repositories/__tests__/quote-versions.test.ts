import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockQuery, mockQueryOne } = vi.hoisted(() => ({
  mockQuery: vi.fn(),
  mockQueryOne: vi.fn(),
}));

vi.mock("@/server/db/neon.server", () => ({
  query: mockQuery,
  queryOne: mockQueryOne,
}));

describe("quote version repository", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates the next quote version from a snapshot", async () => {
    mockQueryOne.mockResolvedValue({ id: "version-1" });
    const { createQuoteVersion } = await import("../quote-versions");

    await createQuoteVersion({
      quote_id: "quote-1",
      reason: "issued",
      snapshot: { total_value: 120000 },
      pdf_template_id: "pdf-1",
      pdf_url: null,
      created_by: "user-1",
    });

    expect(mockQueryOne).toHaveBeenCalledWith(
      expect.stringContaining("coalesce(max(version_number), 0) + 1"),
      ["quote-1", "issued", JSON.stringify({ total_value: 120000 }), "pdf-1", null, "user-1"],
      undefined,
    );
  });

  it("lists versions newest first", async () => {
    mockQuery.mockResolvedValue([]);
    const { listQuoteVersions } = await import("../quote-versions");

    await listQuoteVersions("quote-1");

    expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining("from quote_versions"), ["quote-1"]);
    expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining("order by version_number desc"), ["quote-1"]);
  });
});
