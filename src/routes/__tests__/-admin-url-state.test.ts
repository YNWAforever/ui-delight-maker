import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("uses the Hong Kong business date instead of fixtures", () => {
  const revenue = readFileSync(new URL("../index.tsx", import.meta.url), "utf8");
  const tasks = readFileSync(new URL("../tasks.tsx", import.meta.url), "utf8");

  expect(revenue).not.toContain('const TODAY = "2026-06-28"');
  expect(tasks).not.toContain('const TODAY = "2026-05-20"');
  expect(tasks).not.toContain('useState("2026-05-25")');
});

it("declares typed Revenue Desk URL state instead of local filter and selection state", () => {
  const revenue = readFileSync(new URL("../index.tsx", import.meta.url), "utf8");

  expect(revenue).toContain("validateSearch: revenueDeskSearchSchema");
  expect(revenue).toContain("Route.useSearch()");
});

it("declares typed Companies URL state and keeps only saved-view extras local", () => {
  const companies = readFileSync(new URL("../accounts.tsx", import.meta.url), "utf8");

  expect(companies).toContain("validateSearch: companiesSearchSchema");
  expect(companies).toContain("Route.useSearch()");
  expect(companies).toContain("savedViewConfig");
  expect(companies).not.toContain("setSelectedAccountId");
});

it("controls every existing admin detail tab from validated URL search", () => {
  const routes = [
    ["../accounts.$id.tsx", "accountDetailSearchSchema", "overview"],
    ["../leads.$id.tsx", "leadDetailSearchSchema", "overview"],
    ["../clients.$id.tsx", "clientDetailSearchSchema", "overview"],
    ["../quotes.$id.tsx", "quoteDetailSearchSchema", "items"],
    ["../agents.$name.tsx", "agentHistorySearchSchema", "runs"],
    ["../settings.tsx", "settingsSearchSchema", "profile"],
  ] as const;

  for (const [file, schema, defaultTab] of routes) {
    const source = readFileSync(new URL(file, import.meta.url), "utf8");
    expect(source).toContain(`validateSearch: ${schema}`);
    expect(source).toContain("Route.useSearch()");
    expect(source).toContain(`value={search.tab ?? "${defaultTab}"}`);
    expect(source).toContain("replace: true");
    expect(source).not.toContain("<Tabs defaultValue=");
  }
});

it("preserves quote edit and approval search through tab changes", () => {
  const quote = readFileSync(new URL("../quotes.$id.tsx", import.meta.url), "utf8");

  expect(quote).toContain("...current");
  expect(quote).toContain('tab === "items" ? undefined');
});
