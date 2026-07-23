import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const readRoute = (name: string) => readFileSync(new URL(`../${name}`, import.meta.url), "utf8");

describe("client and account job sheet integration source", () => {
  it("loads and renders client job sheets", () => {
    const clientSource = readRoute("clients.$id.tsx");

    expect(clientSource).toMatch(/useClientWorkspaceSection\(clientId, "job_sheets"/);
    expect(clientSource).toContain(
      '<CountedTabLabel label="Job Sheets" count={counts.jobSheets} />',
    );
    expect(clientSource).toContain('to="/job-sheets/$id"');
  });

  it("loads and renders account job sheets", () => {
    const accountSource = readRoute("accounts.$id.tsx");

    expect(accountSource).toMatch(
      /useCompanyWorkspaceSection\(\s*account\.id,\s*"delivery_finance"/,
    );
    expect(accountSource).toContain("Accounting handoff");
    expect(accountSource).toContain('to="/job-sheets/$id"');
  });
});
