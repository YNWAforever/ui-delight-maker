import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("uses the Hong Kong business date instead of fixtures", () => {
  const revenue = readFileSync(new URL("../index.tsx", import.meta.url), "utf8");
  const tasks = readFileSync(new URL("../tasks.tsx", import.meta.url), "utf8");

  expect(revenue).toContain("getBusinessDateKey");
  expect(tasks).toContain("getBusinessDateKey");
  expect(revenue).not.toContain('const TODAY = "2026-06-28"');
  expect(tasks).not.toContain('const TODAY = "2026-05-20"');
  expect(tasks).not.toContain('useState("2026-05-25")');
});

it("declares typed Revenue Desk URL state instead of local filter and selection state", () => {
  const revenue = readFileSync(new URL("../index.tsx", import.meta.url), "utf8");

  expect(revenue).toContain("validateSearch: revenueDeskSearchSchema");
  expect(revenue).toContain("Route.useSearch()");
  expect(revenue).toContain("useNavigate({ from: Route.fullPath })");
  expect(revenue).not.toContain("useState<PipelineFilters>");
  expect(revenue).not.toContain("useState<string | null>");
});
