import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const repositorySource = (name: string) =>
  readFileSync(new URL(`../${name}.ts`, import.meta.url), "utf8");

describe("paginated repository ordering", () => {
  it.each([
    [
      "accounts",
      /listAccountsPage[\s\S]*order by coalesce\(last_activity_at, created_at\) desc, id desc[\s\S]*limit/i,
    ],
    ["clients", /listClientsPage[\s\S]*order by c\.company_name, c\.id desc[\s\S]*limit/i],
    ["leads", /listLeadsPage[\s\S]*order by created_at desc, id desc[\s\S]*limit/i],
    ["campaigns", /listCampaignsPage[\s\S]*order by created_at desc, id desc[\s\S]*limit/i],
    ["quotes", /listQuotesPage[\s\S]*order by created_at desc, id desc[\s\S]*limit/i],
    ["job-sheets", /listJobSheetsPage[\s\S]*order by created_at desc, id desc[\s\S]*limit/i],
  ])("uses a unique tie-breaker for %s pages", (repository, expected) => {
    expect(repositorySource(repository)).toMatch(expected);
  });
});
