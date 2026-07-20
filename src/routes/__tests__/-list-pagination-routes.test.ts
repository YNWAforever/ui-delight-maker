import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function readSource(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

const routes = [
  "accounts.tsx",
  "clients.tsx",
  "leads.tsx",
  "campaigns.tsx",
  "quotes.tsx",
  "job-sheets.tsx",
];

describe("paginated CRM list routes", () => {
  it("renders shared URL-driven pagination for every paged list", () => {
    for (const route of routes) {
      const source = readSource(`../${route}`);
      expect(source, route).toContain("ListPagination");
      expect(source, route).toContain("onPageChange");
      expect(source, route).toMatch(/search:\s*\(current\)\s*=>\s*\(\{\s*\.\.\.current,\s*page\s*\}\)/);
    }
  });

  it("forwards client tier and lead status/source URL filters to paginated server reads", () => {
    const clients = readSource("../clients.tsx");
    const leads = readSource("../leads.tsx");

    expect(clients).toMatch(/clientListSearchSchema[\s\S]*tier:/);
    expect(clients).toContain("getClientsPage({ data: search })");
    expect(leads).toMatch(/leadListSearchSchema[\s\S]*status:[\s\S]*source:/);
    expect(leads).toContain("getLeadsPage({ data: search })");
  });
});