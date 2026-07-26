import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const readSource = (relativePath: string) =>
  readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");

describe("quote loading performance contracts", () => {
  it("loads quote creation through one compact bootstrap", () => {
    const source = readSource("quotes.new.tsx");

    expect(source).toContain("crmQueryKeys.quotes");
    expect(source).toContain("crmQueryKeys.leads.detail");
    expect(source).toContain('crmQueryKeys.clients.section(clientId, "commercial")');
    expect(source).not.toContain("router.invalidate");
  });

  it("keeps quote versions and PDF resources out of the detail loader", () => {
    const source = readSource("quotes.$id.tsx");

    expect(source).toContain('enabled: search.tab === "versions"');
    expect(source).toContain('enabled: search.tab === "preview"');
    expect(source).toContain(
      'crmQueryKeys.quotes.section(quote.id, "versions", { page: versionPage })',
    );
    expect(source).toContain("versionPageByQuoteId");
    expect(source).toContain("setVersionPage");
    expect(source).toContain('aria-label="Next version page"');
    expect(source).toContain('crmQueryKeys.quotes.section(quote.id, "document")');
    expect(source).toContain('crmQueryKeys.clients.section(quote.client_id, "commercial")');
    expect(source).toContain('crmQueryKeys.clients.section(quote.client_id, "job_sheets")');
  });

  it("keys unsaved editor line items by quote id without refresh resets", () => {
    const source = readSource("quotes.$id.tsx");

    expect(source).toContain("editorDrafts");
    expect(source).toContain("statusByQuoteId");
    expect(source).toContain("[quote.id]");
    expect(source).not.toMatch(/useEffect\([\s\S]{0,240}setEditItems/);
  });

  it("uses on-demand paginated reference queries", () => {
    const source = readSource("../hooks/use-quote-reference-data.ts");

    expect(source).toContain("limit: 25");
    expect(source).toContain("crmQueryKeys.quotes.list");
    expect(source).toContain("placeholderData");
  });
});
