import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const readSource = (relativePath: string) =>
  readFileSync(new URL("../" + relativePath, import.meta.url), "utf8");

const readLibSource = (relativePath: string) =>
  readFileSync(new URL("../../lib/" + relativePath, import.meta.url), "utf8");

describe("operations loading performance contracts", () => {
  it("loads one job-sheet read and preserves drafts by job-sheet id", () => {
    const source = readSource("job-sheets.$id.tsx");
    expect(source).toContain("crmQueryKeys.jobSheets.detail");
    expect(source).toContain("billingDraftsByJobSheetId");
    expect(source).toContain("xeroDraftsByJobSheetId");
    expect(source).not.toMatch(/useEffect\([\s\S]{0,280}setPortionDrafts/);
    expect(source).not.toContain("router.invalidate");

    // The mutation invalidation set moved to @/lib/job-sheet-editor when the route's pure
    // helpers were extracted out of the component file. Same contract, new home — assert it
    // where getJobSheetMutationQueryKeys now lives rather than dropping it.
    const editorSource = readLibSource("job-sheet-editor.ts");
    expect(editorSource).toContain("crmQueryKeys.clients.section");
    expect(editorSource).toContain("crmQueryKeys.companyWorkspace.section");
  });

  it("loads renewal rows and product summaries through one filtered read", () => {
    const source = readSource("renewals.tsx");
    expect(source).toContain("loaderDeps");
    expect(source).toContain("renewalWindow");
    expect(source).toContain("crmQueryKeys.renewals");
    expect(source).toContain("limit: 50");
    expect(source).toContain("setPage");

    const preview = readSource("../components/renewals/renewals-preview-panel.tsx");
    expect(preview).toContain("touchpointDataByClientId");
    expect(preview).toContain("[clientId]");
    expect(preview).not.toContain("router.invalidate");
  });

  it("keeps report datasets and recharts out of the primary route load", () => {
    const source = readSource("reports.tsx");
    const charts = readSource("../components/reports/report-charts.tsx");
    expect(source).toContain("lazy(");
    expect(source).toContain("enabled:");
    expect(source).not.toContain('from "recharts"');
    expect(charts).toContain('from "recharts"');
  });
});
