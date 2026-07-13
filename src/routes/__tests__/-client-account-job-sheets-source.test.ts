import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const readRoute = (name: string) => readFileSync(new URL(`../${name}`, import.meta.url), "utf8");

describe("client and account job sheet integration source", () => {
  it("loads and renders client job sheets", () => {
    const clientSource = readRoute("clients.$id.tsx");

    expect(clientSource).toContain("getJobSheets({ data: { client_id: params.id } })");
    expect(clientSource).toContain(
      '<TabsTrigger value="job-sheets">Job Sheets ({jobSheets.length})</TabsTrigger>',
    );
    expect(clientSource).toContain('to="/job-sheets/$id"');
  });

  it("loads and renders account job sheets", () => {
    const accountSource = readRoute("accounts.$id.tsx");

    expect(accountSource).toContain('useCompanyWorkspaceSection(account.id, "delivery_finance")');
    expect(accountSource).toContain("Accounting handoff");
    expect(accountSource).toContain('to="/job-sheets/$id"');
  });
});
