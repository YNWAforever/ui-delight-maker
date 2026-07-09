import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockQuery } = vi.hoisted(() => ({ mockQuery: vi.fn() }));

vi.mock("@/server/db/neon.server", () => ({
  query: mockQuery,
}));

describe("quote template repository", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lists active quote templates ordered by name", async () => {
    mockQuery.mockResolvedValue([]);
    const { listQuoteTemplates } = await import("../quote-templates");

    await listQuoteTemplates();

    expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining("from quote_templates"));
    expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining("where active = true"));
    expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining("order by name"));
  });

  it("lists active PDF templates by document type", async () => {
    mockQuery.mockResolvedValue([]);
    const { listPdfTemplates } = await import("../quote-templates");

    await listPdfTemplates("quote");

    expect(mockQuery).toHaveBeenCalledWith(expect.stringContaining("from pdf_templates"), [
      "quote",
    ]);
  });
});
